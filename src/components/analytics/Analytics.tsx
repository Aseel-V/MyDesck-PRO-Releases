import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  MapPin,
  Users,
  UserPlus,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { supabase } from '../../lib/supabase';
import RestaurantAnalytics from './RestaurantAnalytics';



// Local interface matching what we map manually
interface UserProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  role: 'user' | 'admin';
  created_at: string;
  business_name?: string | null;
  business_type?: string | null;
  subscription_status?: 'trial' | 'active' | 'past_due';
  trial_start_date?: string;
  is_suspended?: boolean;
}

interface AdminStats {
  totalUsers: number;
  totalAdmins: number;
  totalRegularUsers: number;
  newUsersThisMonth: number;
  averageUsersPerMonth: number;
}

interface UserStats {
  totalRevenue: number;
  totalProfit: number;
  totalTrips: number;
  totalTravelers: number;
  averageProfit: number;

  // ✅ include topDestinations here so TS is happy
  topDestinations: { name: string; value: number }[];
}

interface YearlyStats {
  year: string;
  total_trips: number;
  total_revenue: number;
  total_profit: number;
  profit_growth_percentage: number;
}

interface AnalyticsProps {
  trips: Trip[];
  onOpenTripsWithFilter?: (options: { month?: string; pendingOnly?: boolean }) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number | string; color: string }[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel bg-white/95 border border-slate-200 p-4 rounded-xl shadow-xl backdrop-blur-md dark:bg-slate-950/90 dark:border-slate-700/50 dark:shadow-2xl">
        <p className="text-slate-700 font-semibold mb-2 text-sm dark:text-slate-200">{label}</p>
        {payload.map((entry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500 capitalize dark:text-slate-400">{entry.name}:</span>
            <span className="text-slate-900 font-medium dark:text-slate-100">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const AnalyticsContent = ({ trips, onOpenTripsWithFilter }: AnalyticsProps) => {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const { convert, format, currency, isLoading: ratesLoading } = useCurrency();

  // Redirect check moved to parent component wrapper

  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [yearlyStats, setYearlyStats] = useState<YearlyStats[]>([]);

  /* New Year Filter State for Cash-Basis Analytics */
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  // ✅ Historical Exchange Rate Locking helper
  const getHistoricalValue = useCallback((amount: number, trip: Trip, targetCurrency: string) => {
    if (!amount) return 0;

    const tripCurrency = trip.currency || 'USD';

    // 1) Same currency?
    if (tripCurrency === targetCurrency) return amount;

    // 2) Trip Currency -> USD using HISTORICAL rate
    // exchange_rate is "Units per 1 USD" (Units/USD)
    // USD = Amount / exchange_rate
    const historicalRate = trip.exchange_rate || 1;
    const usdAmount = amount / historicalRate;

    // 3) USD -> Target Currency using LIVE rate
    return convert(usdAmount, 'USD', targetCurrency);
  }, [convert]);

  const getMonthsSinceFirstUser = (profiles: UserProfile[]) => {
    if (profiles.length === 0) return 1;
    const firstUser = profiles[profiles.length - 1];
    const firstDate = new Date(firstUser.created_at);
    const now = new Date();
    const months =
      (now.getFullYear() - firstDate.getFullYear()) * 12 + (now.getMonth() - firstDate.getMonth());
    return Math.max(1, months + 1);
  };

  // Derive available years from ALL VALID trips (Cash Basis: based on Effective Date)
  // "Sold" implies not cancelled.
  const availableYears = useMemo(() => {
    if (!trips || trips.length === 0) return [new Date().getFullYear().toString()];
    
    const validTrips = trips.filter(t => t.status !== 'cancelled');
    
    if (validTrips.length === 0) return [new Date().getFullYear().toString()];

    const years = new Set(
      validTrips.map((tr) => {
        const effDate = tr.payment_date || tr.start_date;
        return new Date(effDate).getFullYear().toString();
      })
    );
    
    // Always include current year (e.g. 2026) to allow filtering even with no data
    const currentYear = new Date().getFullYear().toString();
    if (!years.has(currentYear)) {
      years.add(currentYear);
    }
    
    const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
    return sortedYears.length > 0 ? sortedYears : [currentYear];
  }, [trips]);

  // Ensure selectedYear is valid when availableYears changes
  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      // If currently selected year is not in the list (e.g. became invalid or initial load),
      // switch to the most recent available year.
      if (availableYears.length > 0) {
        setSelectedYear(availableYears[0]);
      }
    }
  }, [availableYears, selectedYear]);

  // STRICT CASH-BASIS FILTERING
  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    return trips.filter((trip) => {
      // Exclude cancelled trips from analytics entirely
      if (trip.status === 'cancelled') return false;

      const effDate = trip.payment_date || trip.start_date;
      return new Date(effDate).getFullYear().toString() === selectedYear;
    });
  }, [trips, selectedYear]);

  // Fetch user profiles for admin
  useEffect(() => {
    const loadData = async () => {
      if (isAdmin) {
        setLoading(true);
        await fetchUserProfiles();
      }
    };
    loadData();
  }, [isAdmin]);

  /* REPLACED WITH PARALLEL FETCH AND MERGE TO SOLVE RELATIONSHIP ERROR */
  const fetchUserProfiles = async () => {
    try {
      // Fetch both profiles separately since they don't have a direct foreign key relationship
      const [usersResponse, businessResponse] = await Promise.all([
        supabase.from('user_profiles').select('*'),
        supabase.from('business_profiles').select('user_id, business_name, business_type, subscription_status, trial_start_date, is_suspended')
      ]);

      if (usersResponse.error) throw usersResponse.error;
      if (businessResponse.error) throw businessResponse.error;

      const users = usersResponse.data || [];
      const businesses = businessResponse.data || [];

      // Create a map for quick business lookup by user_id
      const businessMap = new Map(businesses.map(b => [b.user_id, b]));

      // Merge data
      const mappedUsers: UserProfile[] = users.map((u) => {
        const business = businessMap.get(u.user_id);
        return {
          user_id: u.user_id,
          email: u.email,
          full_name: u.full_name,
          phone_number: u.phone_number,
          role: u.role,
          created_at: u.created_at,
          // Business Profile Data (Source of Truth for Subscription)
          business_name: business?.business_name || null,
          business_type: business?.business_type || null,
          subscription_status: business?.subscription_status || 'trial',
          trial_start_date: business?.trial_start_date || undefined,
          is_suspended: business?.is_suspended ?? u.is_suspended // Prefer business profile, fallback to user profile
        };
      });

      setUserProfiles(mappedUsers);
    } catch (error) {
       console.error('Error fetching user profiles:', error);
    } finally {
       setLoading(false);
    }
  };

  const fetchYearlyStats = async () => {
    try {
      // @ts-expect-error: RPC function not yet in types
      const { data, error } = await supabase.rpc('get_yearly_stats_overview');
      if (error) throw error;

      let stats = ((data as unknown) || []) as YearlyStats[];
      const currentYear = new Date().getFullYear().toString();

      // Ensure current year is in the list
      if (!stats.find((s) => s.year === currentYear)) {
        stats = [
          {
            year: currentYear,
            total_trips: 0,
            total_revenue: 0,
            total_profit: 0,
            profit_growth_percentage: 0,
          },
          ...stats,
        ];
      }

      // Sort by year descending to ensure correct order
      stats.sort((a, b) => b.year.localeCompare(a.year));

      // Calculate growth percentages
      const statsWithGrowth = stats.map((stat) => {
        const prevYear = (parseInt(stat.year) - 1).toString();
        const prevStat = stats.find((s) => s.year === prevYear);

        let growth = 0;
        if (prevStat && prevStat.total_profit > 0) {
          growth = ((stat.total_profit - prevStat.total_profit) / prevStat.total_profit) * 100;
        }

        return {
          ...stat,
          profit_growth_percentage: parseFloat(growth.toFixed(1)),
        };
      });

      setYearlyStats(statsWithGrowth);
    } catch (error) {
       console.error('Error fetching yearly stats:', error);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      fetchYearlyStats();
    }
  }, [isAdmin]);

  const stats = useMemo((): AdminStats | UserStats => {
    if (isAdmin) {
      const totalUsers = userProfiles.length;
      const totalAdmins = userProfiles.filter((p) => p.role === 'admin').length;
      const totalRegularUsers = userProfiles.filter((p) => p.role === 'user').length;

      const newUsersThisMonth = userProfiles.filter((profile) => {
        const createdDate = new Date(profile.created_at);
        const now = new Date();
        return createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear();
      }).length;

      return {
        totalUsers,
        totalAdmins,
        totalRegularUsers,
        newUsersThisMonth,
        averageUsersPerMonth: totalUsers > 0 ? totalUsers / Math.max(1, getMonthsSinceFirstUser(userProfiles)) : 0,
      };
    }

    const tripsToCalc = filteredTrips;

    const totalRevenue = tripsToCalc.reduce((sum, trip) => sum + getHistoricalValue(trip.sale_price || 0, trip, currency), 0);
    const totalProfit = tripsToCalc.reduce((sum, trip) => sum + getHistoricalValue(trip.profit || 0, trip, currency), 0);

    const totalTrips = tripsToCalc.length;
    const totalTravelers = tripsToCalc.reduce((sum, trip) => sum + (trip.travelers_count || 0), 0);

    // Top Destinations (by count)
    const destinationsMap = new Map<string, number>();
    tripsToCalc.forEach((trip) => {
      if (!trip.destination) return;
      destinationsMap.set(trip.destination, (destinationsMap.get(trip.destination) || 0) + 1);
    });

    const topDestinations = Array.from(destinationsMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalRevenue,
      totalProfit,
      totalTrips,
      totalTravelers,
      averageProfit: totalTrips > 0 ? totalProfit / totalTrips : 0,
      topDestinations,
    };
  }, [userProfiles, isAdmin, filteredTrips, currency, getHistoricalValue]);

  const monthlyData = useMemo(() => {
    if (isAdmin) {
      const monthMap = new Map<string, { users: number; admins: number; regularUsers: number }>();

      userProfiles.forEach((profile) => {
        const date = new Date(profile.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        const existing = monthMap.get(monthKey) || { users: 0, admins: 0, regularUsers: 0 };

        monthMap.set(monthKey, {
          users: existing.users + 1,
          admins: existing.admins + (profile.role === 'admin' ? 1 : 0),
          regularUsers: existing.regularUsers + (profile.role === 'user' ? 1 : 0),
        });
      });

      return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }));
    }

    const monthMap = new Map<string, { profit: number; revenue: number; travelers: number }>();

    filteredTrips.forEach((trip) => {
      const dateString = trip.payment_date || trip.start_date;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthMap.get(monthKey) || { profit: 0, revenue: 0, travelers: 0 };

      const tripProfit = getHistoricalValue(trip.profit || 0, trip, currency);
      const tripRevenue = getHistoricalValue(trip.sale_price || 0, trip, currency);

      monthMap.set(monthKey, {
        profit: existing.profit + tripProfit,
        revenue: existing.revenue + tripRevenue,
        travelers: existing.travelers + (trip.travelers_count || 0),
      });
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));
  }, [userProfiles, isAdmin, filteredTrips, currency, getHistoricalValue]);

  const {
    profitMarginPct,
    profitMarginTrend,
    totalCollected,
    totalPending,
    paymentHealthPct,
  } = useMemo(() => {
    if (isAdmin) {
      return {
        profitMarginPct: 0,
        profitMarginTrend: 0,
        totalCollected: 0,
        totalPending: 0,
        paymentHealthPct: 0,
      };
    }

    const tripsToCalc = filteredTrips;

    const totalRevenue = tripsToCalc.reduce((sum, trip) => sum + getHistoricalValue(trip.sale_price || 0, trip, currency), 0);
    const totalProfit = tripsToCalc.reduce((sum, trip) => sum + getHistoricalValue(trip.profit || 0, trip, currency), 0);

    const profitMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const totalCollected = tripsToCalc.reduce(
      (sum, trip) => sum + getHistoricalValue(trip.amount_paid || 0, trip, currency),
      0
    );

    const totalPending = tripsToCalc.reduce((sum, trip) => {
      const price = trip.sale_price || 0;
      const paid = trip.amount_paid || 0;
      const pending = Math.max(0, price - paid);
      return sum + getHistoricalValue(pending, trip, currency);
    }, 0);

    const totalDue = totalCollected + totalPending;
    const paymentHealthPct = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;

    let profitMarginTrend = 0;
    if (monthlyData.length >= 2) {
      const last = monthlyData[monthlyData.length - 1] as { revenue: number, profit: number };
      const prev = monthlyData[monthlyData.length - 2] as { revenue: number, profit: number };

      const lastRev = last?.revenue || 0;
      const lastProf = last?.profit || 0;
      const prevRev = prev?.revenue || 0;
      const prevProf = prev?.profit || 0;

      const lastMargin = lastRev > 0 ? (lastProf / lastRev) * 100 : 0;
      const prevMargin = prevRev > 0 ? (prevProf / prevRev) * 100 : 0;

      profitMarginTrend = lastMargin - prevMargin;
    }

    return {
      profitMarginPct,
      profitMarginTrend,
      totalCollected,
      totalPending,
      paymentHealthPct,
    };
  }, [isAdmin, monthlyData, filteredTrips, currency, getHistoricalValue]);

  const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="h-11 w-11 rounded-full border-4 border-sky-500/30 border-t-sky-400 animate-spin" />
      </div>
    );
  }

  return (
      <div className="space-y-6 animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-sky-600/80 mb-1 dark:text-sky-300/80">
            {isAdmin ? t('analytics.platformInsights') : t('analytics.businessInsights')}
          </p>
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-sky-800 to-slate-700 drop-shadow-sm dark:from-slate-50 dark:via-sky-100 dark:to-slate-200 dark:drop-shadow-[0_0_16px_rgba(15,23,42,0.9)]">
            {isAdmin ? 'Admin Analytics' : t('analytics.title')}
          </h2>
          <p className="text-slate-500 mt-1 text-sm dark:text-slate-400">
            {isAdmin
              ? t('analytics.adminSubtitle')
              : t('analytics.subtitle')}
            {currency !== 'USD' && !isAdmin && (
              <span className="ml-2 text-xs text-sky-500 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-200 dark:text-sky-400 dark:bg-sky-500/10 dark:border-sky-500/20">
                {t('analytics.convertedTo')?.replace('{{currency}}', currency)}
                {ratesLoading && <span className="ml-1 animate-pulse">...</span>}
              </span>
            )}
          </p>
        </div>

        {/* Year Selector */}
        {!isAdmin && (
          <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-1 shadow-sm overflow-x-auto no-scrollbar max-w-full md:max-w-xs dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-slate-950/60">
            {availableYears.map((year) => {
              const isActive = selectedYear === year;
              return (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* TOP STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isAdmin ? (
          <>
            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">Total Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as AdminStats).totalUsers}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">All registered users</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <UserPlus className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">New Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as AdminStats).newUsersThisMonth}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">This month</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <Shield className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">Admins</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as AdminStats).totalAdmins}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">Administrators</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">Regular Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as AdminStats).totalRegularUsers}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">Standard accounts</div>
            </div>
          </>
        ) : (
          <>
            {/* Profit Margin KPI */}
            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] md:col-span-2 dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">{t('analytics.netProfitMargin')}</span>
                </div>
                <div className={`flex items-center gap-1 text-sm ${profitMarginTrend >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {profitMarginTrend >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{Math.abs(profitMarginTrend).toFixed(1)}%</span>
                </div>
              </div>
              <div className="text-4xl font-extrabold mb-1">{profitMarginPct.toFixed(1)}%</div>
              <div className="text-slate-500 text-xs dark:text-slate-400">{t('analytics.netProfitMarginDesc')}</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">{t('analytics.totalRevenue')}</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{format((stats as UserStats).totalRevenue ?? 0, currency)}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">{t('analytics.totalRevenue')}</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">{t('analytics.totalProfit')}</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{format((stats as UserStats).totalProfit ?? 0, currency)}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">{t('analytics.totalProfit')}</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <MapPin className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">{t('analytics.totalTrips')}</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as UserStats).totalTrips}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">{t('analytics.totalTrips')}</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-slate-900 transform transition-all hover:scale-[1.02] dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)] dark:text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-slate-100 rounded-lg px-3 py-1 dark:bg-white/10">
                  <span className="text-xs font-semibold">{t('analytics.totalTravelers')}</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{(stats as UserStats).totalTravelers ?? 0}</div>
              <div className="text-slate-500 text-sm dark:text-slate-400">{t('analytics.totalTravelers')}</div>
            </div>
          </>
        )}
      </div>

      {/* PAYMENT HEALTH */}
      {!isAdmin && (
        <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-[0_18px_55px_rgba(15,23,42,0.95)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('analytics.paymentHealth')}</h3>
            <AlertTriangle className={`w-5 h-5 ${totalPending > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
          </div>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>
              {t('analytics.collected')}:{' '}
              <span className="text-emerald-500 font-semibold dark:text-emerald-400">{format(totalCollected, currency)}</span>
            </span>
            <span>
              {t('analytics.pending')}:{' '}
              <span
                className="text-red-500 font-semibold cursor-pointer hover:underline decoration-red-400/70 dark:text-red-400"
                onClick={() => onOpenTripsWithFilter?.({ pendingOnly: true })}
              >
                {format(totalPending, currency)}
              </span>
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 border border-slate-200 overflow-hidden dark:bg-slate-800/70 dark:border-white/10">
            <div className="h-full bg-emerald-500" style={{ width: `${paymentHealthPct.toFixed(0)}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t('analytics.paymentHealthDesc')}
          </div>
        </div>
      )}

      {/* ANALYTICS CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART 1: REVENUE VS PROFIT (Combo Chart) */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-[0_20px_60px_rgba(15,23,42,1)]">
          <h3 className="text-xl font-bold text-slate-900 mb-6 dark:text-slate-100">
            {isAdmin ? 'User Growth Over Time' : t('analytics.revenuePerMonth')}
          </h3>

          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-slate-400 dark:text-slate-500">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">{t('analytics.noData')}</div>
                <div className="text-sm">
                  {isAdmin ? 'No user registrations found in the system.' : t('analytics.noTripsForYear')?.replace('{{year}}', selectedYear)}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[300px] w-full" style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                {isAdmin ? (
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800" />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Legend />
                    <Bar dataKey="users" fill="#3b82f6" name="Total Users" />
                  </BarChart>
                ) : (
                  <ComposedChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800" />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#3b82f6" name={t('analytics.revenue')} barSize={20} radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#e2e8f0' }}
                      activeDot={{ r: 6 }}
                      name={t('analytics.profit')}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* CHART 2: PAYMENT STATUS (Donut Chart) */}
        <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-[0_20px_60px_rgba(15,23,42,1)]">
          <h3 className="text-xl font-bold text-slate-900 mb-6 dark:text-slate-100">
            {isAdmin ? 'User Distribution' : t('trips.paymentStatus')}
          </h3>

          {isAdmin ? (
            <div className="flex items-center justify-center h-[300px] text-slate-400">Admin Distribution Chart</div>
          ) : (
            (() => {
              const statusData = filteredTrips.reduce((acc, trip) => {
                const status = trip.payment_status || 'unpaid';
                const amount = getHistoricalValue(trip.sale_price || 0, trip, currency);
                acc[status] = (acc[status] || 0) + amount;
                return acc;
              }, {} as Record<string, number>);

              const pieData = [
                { name: t('trips.paymentStatuses.paid'), value: statusData['paid'] || 0, color: '#10b981' },
                { name: t('trips.paymentStatuses.partial'), value: statusData['partial'] || 0, color: '#f59e0b' },
                { name: t('trips.paymentStatuses.unpaid'), value: statusData['unpaid'] || 0, color: '#ef4444' },
              ].filter((d) => d.value > 0);

              if (pieData.length === 0) {
                return (
                  <div className="flex items-center justify-center h-[300px] text-slate-400 dark:text-slate-500">
                    {t('analytics.noPaymentData')?.replace('{{year}}', selectedYear)}
                  </div>
                );
              }

              return (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(15,23,42,1)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* SECTION: TOP DESTINATIONS */}
      {!isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-[0_20px_60px_rgba(15,23,42,1)]">
            <h3 className="text-xl font-bold text-slate-900 mb-6 dark:text-slate-100">{t('analytics.topDestinations')}</h3>

            {(stats as UserStats).topDestinations?.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">{t('analytics.noDestinations')}</div>
            ) : (
              <div className="h-[300px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <PieChart>
                    <Pie
                      data={(stats as UserStats).topDestinations}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ''} ${(((percent || 0) * 100) as number).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {(stats as UserStats).topDestinations.map((_, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

       {/* YEARLY PERFORMANCE HISTORY TABLE */}
       {!isAdmin && (
        <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm p-6 overflow-hidden dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-[0_20px_60px_rgba(15,23,42,1)]">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2 dark:text-slate-100">
             <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
             {t('analytics.yearlyPerformance')}
          </h3>
          
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm uppercase tracking-wider dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-3 pl-2">{t('analytics.year')}</th>
                  <th className="pb-3">{t('dashboard.trips')}</th>
                  <th className="pb-3">{t('analytics.revenue')}</th>
                  <th className="pb-3">{t('analytics.profit')}</th>
                  <th className="pb-3 pr-2 text-right">{t('analytics.growth')}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200">
                {yearlyStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      {t('analytics.noHistory')}
                    </td>
                  </tr>
                ) : (
                  yearlyStats.map((stat) => {
                     // Check "Growth" specifically for Profit
                     const isPositive = stat.profit_growth_percentage > 0;
                     const isNegative = stat.profit_growth_percentage < 0;
                     
                     return (
                      <tr key={stat.year} className="group hover:bg-slate-50 transition-colors border-b border-slate-200/50 last:border-0 dark:hover:bg-white/5 dark:border-slate-800/50">
                        <td className="py-4 pl-2 font-mono text-sky-600 font-semibold dark:text-sky-300">{stat.year}</td>
                        <td className="py-4 font-medium text-slate-700 dark:text-slate-200">{stat.total_trips}</td>
                        <td className="py-4 text-slate-600 dark:text-slate-300">
                          {format(convert(stat.total_revenue, 'USD', currency), currency)}
                        </td>
                        <td className="py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                          {format(convert(stat.total_profit, 'USD', currency), currency)}
                        </td>
                        <td className="py-4 pr-2 text-right">
                          <div className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full border ${
                            isPositive ? 'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 
                            isNegative ? 'bg-red-100 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' : 
                            'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}>
                            {isPositive && <ArrowUpRight className="w-3 h-3" />}
                            {isNegative && <ArrowDownRight className="w-3 h-3" />}
                            {stat.profit_growth_percentage > 0 ? '+' : ''}{stat.profit_growth_percentage}%
                          </div>
                        </td>
                      </tr>
                     );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Analytics(props: AnalyticsProps) {
  const { isAdmin, profile } = useAuth();

  if (profile?.business_type === 'restaurant' && !isAdmin) {
    return <RestaurantAnalytics />;
  }

  return <AnalyticsContent {...props} />;
}
