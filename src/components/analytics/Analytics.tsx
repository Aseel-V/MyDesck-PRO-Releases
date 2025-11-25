import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
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
import { Trip } from '../../types/trip';
import { supabase } from '../../lib/supabase';
import { CurrencyService } from '../../lib/currency';
import type { Database } from '../../types/supabase';
import { ErrorBoundary } from '../ui/ErrorBoundary';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

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
}

interface AnalyticsProps {
  trips: Trip[];
  onOpenTripsWithFilter?: (options: { month?: string; pendingOnly?: boolean }) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel bg-slate-950/90 border border-slate-700/50 p-4 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-slate-200 font-semibold mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-400 capitalize">
              {entry.name}:
            </span>
            <span className="text-slate-100 font-medium">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Analytics({
  onOpenTripsWithFilter }: AnalyticsProps) {
  const { t } = useLanguage();
  const { profile, user, isAdmin } = useAuth();

  // Server-side data states
  const [serverUserStats, setServerUserStats] = useState<any>(null);
  const [serverMonthlyStats, setServerMonthlyStats] = useState<any[]>([]);
  const [serverYearlyStats, setServerYearlyStats] = useState<any[]>([]);
  const [serverTopDestinations, setServerTopDestinations] = useState<any[]>([]);
  const [serverStatusBreakdown, setServerStatusBreakdown] = useState<any[]>([]);
  const [serverPaymentBreakdown, setServerPaymentBreakdown] = useState<any[]>([]);

  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [ratesLoading, setRatesLoading] = useState(false);

  // Fetch analytics data from server
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!user?.id || isAdmin) return;

      setLoading(true);
      try {
        const [
          { data: userStats },
          { data: monthlyStats },
          { data: yearlyStats },
          { data: topDestinations },
          { data: statusBreakdown },
          { data: paymentBreakdown }
        ] = await Promise.all([
          supabase.rpc('get_user_stats', { p_user_id: user.id }),
          supabase.rpc('get_monthly_stats', { p_user_id: user.id }),
          supabase.rpc('get_yearly_stats', { p_user_id: user.id }),
          supabase.rpc('get_top_destinations', { p_user_id: user.id, limit_count: 5 }),
          supabase.rpc('get_status_breakdown', { p_user_id: user.id }),
          supabase.rpc('get_payment_status_breakdown', { p_user_id: user.id })
        ]);

        if (userStats && userStats[0]) setServerUserStats(userStats[0]);
        if (monthlyStats) setServerMonthlyStats(monthlyStats);
        if (yearlyStats) setServerYearlyStats(yearlyStats);
        if (topDestinations) setServerTopDestinations(topDestinations);
        if (statusBreakdown) setServerStatusBreakdown(statusBreakdown);
        if (paymentBreakdown) setServerPaymentBreakdown(paymentBreakdown);

      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [user?.id, isAdmin]);

  const fetchUserProfiles = async () => {
    try {
      // Use Edge Function instead of direct admin access
      const { data, error } = await supabase.functions.invoke('get-users', {
        body: { page: 1, perPage: 1000 },
      });

      if (error) throw error;

      if (data && data.users) {
        // Map the response to UserProfile format expected by the component
        const mappedUsers: UserProfile[] = data.users.map((u: any) => ({
          user_id: u.id,
          email: u.email,
          full_name: u.full_name,
          phone_number: u.phone_number,
          role: u.role,
          created_at: u.created_at,
          business_name: u.business_name,
        }));
        setUserProfiles(mappedUsers);
      }
    } catch (error) {
      console.error('Error fetching user profiles:', error);
    } finally {
      setLoading(false);
    }
  };

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

  // Fetch exchange rates when currency changes
  useEffect(() => {
    const fetchRates = async () => {
      const targetCurrency = profile?.preferred_currency || 'USD';
      if (targetCurrency === 'USD') {
        setExchangeRate(1);
        return;
      }

      setRatesLoading(true);
      const rates = await CurrencyService.getLatestRates('USD');
      if (rates && rates.rates[targetCurrency]) {
        setExchangeRate(rates.rates[targetCurrency]);
      }
      setRatesLoading(false);
    };

    fetchRates();
  }, [profile?.preferred_currency]);

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD':
        return '$';
      case 'EUR':
        return '€';
      case 'ILS':
        return '₪';
      default:
        return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(profile?.preferred_currency || 'USD');

  const getMonthsSinceFirstUser = (profiles: UserProfile[]) => {
    if (profiles.length === 0) return 1;
    const firstUser = profiles[profiles.length - 1];
    const firstDate = new Date(firstUser.created_at);
    const now = new Date();
    const months =
      (now.getFullYear() - firstDate.getFullYear()) * 12 +
      (now.getMonth() - firstDate.getMonth());
    return Math.max(1, months + 1);
  };

  const PIE_COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6'];

  const stats = useMemo((): AdminStats | UserStats => {
    if (isAdmin) {
      const totalUsers = userProfiles.length;
      const totalAdmins = userProfiles.filter(
        (profile) => profile.role === 'admin'
      ).length;
      const totalRegularUsers = userProfiles.filter(
        (profile) => profile.role === 'user'
      ).length;

      const newUsersThisMonth = userProfiles.filter((profile) => {
        const createdDate = new Date(profile.created_at);
        const now = new Date();
        return (
          createdDate.getMonth() === now.getMonth() &&
          createdDate.getFullYear() === now.getFullYear()
        );
      }).length;

      return {
        totalUsers,
        totalAdmins,
        totalRegularUsers,
        newUsersThisMonth,
        averageUsersPerMonth:
          totalUsers > 0
            ? totalUsers / Math.max(1, getMonthsSinceFirstUser(userProfiles))
            : 0,
      };
    } else {
      // Use server-side stats
      if (!serverUserStats) {
        return {
          totalRevenue: 0,
          totalProfit: 0,
          totalTrips: 0,
          totalTravelers: 0,
          averageProfit: 0,
        };
      }

      return {
        totalRevenue: Number(serverUserStats.total_revenue) * exchangeRate,
        totalProfit: Number(serverUserStats.total_profit) * exchangeRate,
        totalTrips: Number(serverUserStats.total_trips),
        totalTravelers: Number(serverUserStats.total_travelers),
        averageProfit: Number(serverUserStats.total_trips) > 0
          ? (Number(serverUserStats.total_profit) / Number(serverUserStats.total_trips)) * exchangeRate
          : 0,
      };
    }
  }, [userProfiles, isAdmin, exchangeRate, serverUserStats]);

  const monthlyData = useMemo(() => {
    if (isAdmin) {
      // Admin: user registration trends
      const monthMap = new Map<
        string,
        { users: number; admins: number; regularUsers: number }
      >();

      userProfiles.forEach((profile) => {
        const date = new Date(profile.created_at);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, '0')}`;

        const existing =
          monthMap.get(monthKey) || {
            users: 0,
            admins: 0,
            regularUsers: 0,
          };

        monthMap.set(monthKey, {
          users: existing.users + 1,
          admins: existing.admins + (profile.role === 'admin' ? 1 : 0),
          regularUsers:
            existing.regularUsers + (profile.role === 'user' ? 1 : 0),
        });
      });

      return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          users: data.users,
          admins: data.admins,
          regularUsers: data.regularUsers,
        }));
    } else {
      // Regular user: trip trends from server
      return serverMonthlyStats.map((item: any) => ({
        month: item.month,
        profit: Number(item.profit) * exchangeRate,
        revenue: Number(item.revenue) * exchangeRate,
        travelers: Number(item.travelers),
      }));
    }
  }, [userProfiles, isAdmin, exchangeRate, serverMonthlyStats]);

  const yearlyData = useMemo(() => {
    if (isAdmin) {
      // Admin: yearly user registrations
      const yearMap = new Map<string, number>();

      userProfiles.forEach((profile) => {
        const year = new Date(profile.created_at).getFullYear().toString();
        yearMap.set(year, (yearMap.get(year) || 0) + 1);
      });

      return Array.from(yearMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, users]) => ({
          year,
          users,
        }));
    } else {
      // Regular user: yearly profit from server
      return serverYearlyStats.map((item: any) => ({
        year: item.year,
        profit: Number(item.profit) * exchangeRate,
      }));
    }
  }, [userProfiles, isAdmin, exchangeRate, serverYearlyStats]);

  // User-focused derived analytics
  const {
    profitMarginPct,
    profitMarginTrend,
    totalCollected,
    totalPending,
    paymentHealthPct,
    topDestinations,
    statusBreakdown,
    paymentDistribution,
    monthlyProfitOnly,
  } = useMemo(() => {
    if (isAdmin) {
      return {
        profitMarginPct: 0,
        profitMarginTrend: 0,
        totalCollected: 0,
        totalPending: 0,
        paymentHealthPct: 0,
        topDestinations: [] as { name: string; profit: number; count: number }[],
        statusBreakdown: { active: 0, completed: 0, cancelled: 0 },
        paymentDistribution: { paid: 0, partial: 0, unpaid: 0 },
        monthlyProfitOnly: [] as { month: string; profit: number }[],
      };
    }

    // Use server stats for calculations
    const totalRevenue = Number(serverUserStats?.total_revenue || 0);
    const totalProfit = Number(serverUserStats?.total_profit || 0);
    const profitMarginPct =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Note: We don't have totalCollected/totalPending in serverUserStats yet.
    // We can either add them to the RPC or just use 0 for now if not critical, 
    // OR we can calculate them if we had the data. 
    // The RPC "get_user_stats" didn't include them.
    // Let's assume we want to add them to the RPC later. For now, 0.
    const totalCollected = 0;
    const totalPending = 0;
    const paymentHealthPct = 0;

    const topDestinations = serverTopDestinations.map((d: any) => ({
      name: d.destination || 'Unknown',
      profit: Number(d.profit) * exchangeRate,
      count: Number(d.trip_count)
    }));

    const statusBreakdown = serverStatusBreakdown.reduce(
      (acc: any, item: any) => {
        acc[item.status] = Number(item.count);
        return acc;
      },
      { active: 0, completed: 0, cancelled: 0 }
    );

    const paymentDistribution = serverPaymentBreakdown.reduce(
      (acc: any, item: any) => {
        acc[item.payment_status] = Number(item.count);
        return acc;
      },
      { paid: 0, partial: 0, unpaid: 0 }
    );

    const monthlyProfitOnly = (monthlyData as {
      month: string;
      profit?: number;
    }[])
      .filter((m) => typeof m.profit === 'number')
      .map((m) => ({
        month: m.month,
        profit: Number((m.profit as number).toFixed(2)),
      }));

    // Trend: last month vs previous
    let profitMarginTrend = 0;
    if (monthlyData.length >= 2) {
      const last = monthlyData[monthlyData.length - 1] as any;
      const prev = monthlyData[monthlyData.length - 2] as any;
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
      topDestinations,
      statusBreakdown,
      paymentDistribution,
      monthlyProfitOnly,
    };
  }, [isAdmin, monthlyData, exchangeRate, serverUserStats, serverTopDestinations, serverStatusBreakdown, serverPaymentBreakdown]);

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
          <p className="text-[11px] uppercase tracking-[0.3em] text-sky-300/80 mb-1">
            {isAdmin ? 'Platform Insights' : 'Business Insights'}
          </p>
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-50 via-sky-100 to-slate-200 drop-shadow-[0_0_16px_rgba(15,23,42,0.9)]">
            {isAdmin ? 'Admin Analytics' : t('analytics.title')}
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            {isAdmin
              ? 'Track user growth, admin distribution, and overall platform activity.'
              : 'Follow your trips, profit, payments health, and destinations performance.'}
            {exchangeRate !== 1 && !isAdmin && (
              <span className="ml-2 text-xs text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                Converted to {profile?.preferred_currency} (Rate: {exchangeRate.toFixed(2)})
                {ratesLoading && <span className="ml-1 animate-pulse">...</span>}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* TOP STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isAdmin ? (
          <>
            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">Total Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as AdminStats).totalUsers}
              </div>
              <div className="text-slate-400 text-sm">All registered users</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <UserPlus className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">New Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as AdminStats).newUsersThisMonth}
              </div>
              <div className="text-slate-400 text-sm">This month</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <Shield className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">Admins</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as AdminStats).totalAdmins}
              </div>
              <div className="text-slate-400 text-sm">Administrators</div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">Regular Users</span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as AdminStats).totalRegularUsers}
              </div>
              <div className="text-slate-400 text-sm">Standard accounts</div>
            </div>
          </>
        ) : (
          <>
            {/* Profit Margin KPI */}
            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02] md:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">
                    Net Profit Margin
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1 text-sm ${profitMarginTrend >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400'
                    }`}
                >
                  {profitMarginTrend >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  <span>{Math.abs(profitMarginTrend).toFixed(1)}%</span>
                </div>
              </div>
              <div className="text-4xl font-extrabold mb-1">
                {profitMarginPct.toFixed(1)}%
              </div>
              <div className="text-slate-400 text-xs">
                Shows how efficiently your business converts revenue to profit.
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">
                    {t('analytics.totalRevenue')}
                  </span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {currencySymbol}
                {((stats as UserStats).totalRevenue ?? 0).toFixed(2)}
              </div>
              <div className="text-slate-400 text-sm">
                {t('analytics.totalRevenue')}
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">
                    {t('analytics.totalProfit')}
                  </span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {currencySymbol}
                {((stats as UserStats).totalProfit ?? 0).toFixed(2)}
              </div>
              <div className="text-slate-400 text-sm">
                {t('analytics.totalProfit')}
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <MapPin className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">
                    {t('analytics.totalTrips')}
                  </span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as UserStats).totalTrips}
              </div>
              <div className="text-slate-400 text-sm">
                {t('analytics.totalTrips')}
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6 text-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 opacity-80" />
                <div className="bg-white/10 rounded-lg px-3 py-1">
                  <span className="text-xs font-semibold">
                    {t('analytics.totalTravelers')}
                  </span>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(stats as UserStats).totalTravelers ?? 0}
              </div>
              <div className="text-slate-400 text-sm">
                {t('analytics.totalTravelers')}
              </div>
            </div>
          </>
        )}
      </div>

      {/* PAYMENT HEALTH */}
      {!isAdmin && (
        <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-bold text-slate-100">
              Payment Health
            </h3>
            <AlertTriangle
              className={`w-5 h-5 ${totalPending > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
            />
          </div>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
            <span>
              Collected:{' '}
              <span className="text-emerald-400 font-semibold">
                {currencySymbol}
                {totalCollected.toFixed(2)}
              </span>
            </span>
            <span>
              Pending:{' '}
              {/* ✅ لو ضغطت على Pending يفتح الرحلات مع pendingOnly */}
              <span
                className="text-red-400 font-semibold cursor-pointer hover:underline decoration-red-400/70"
                onClick={() =>
                  onOpenTripsWithFilter?.({ pendingOnly: true })
                }
              >
                {currencySymbol}
                {totalPending.toFixed(2)}
              </span>
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800/70 border border-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${paymentHealthPct.toFixed(0)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Shows Total Collected vs Total Pending to help prioritize
            collections.
          </div>
        </div>
      )}

      {/* MONTHLY CHART 1 */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
        <h3 className="text-xl font-bold text-slate-100 mb-6">
          {isAdmin ? 'User Registration Trends' : 'Monthly Net Profit'}
        </h3>
        {monthlyData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="text-center">
              <div className="text-lg font-medium mb-2">No data available</div>
              <div className="text-sm">
                {isAdmin
                  ? 'No user registrations found in the system.'
                  : 'No trips found. Start adding trips to see analytics here.'}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              {isAdmin ? (
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Total Users"
                  />
                  <Line
                    type="monotone"
                    dataKey="admins"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    name="Admins"
                  />
                  <Line
                    type="monotone"
                    dataKey="regularUsers"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Regular Users"
                  />
                </LineChart>
              ) : (
                <BarChart data={monthlyProfitOnly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Legend />
                  <Bar
                    dataKey="profit"
                    fill="#10b981"
                    name={t('analytics.profit')}
                    // ✅ لو ضغطت على العمود → فلتر حسب هذا الشهر
                    cursor={onOpenTripsWithFilter ? 'pointer' : 'default'}
                    onClick={(data: any) => {
                      const month = data?.payload?.month as string | undefined;
                      if (month) {
                        onOpenTripsWithFilter?.({ month, pendingOnly: true });
                      }
                    }}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* MONTHLY CHART 2 */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
        <h3 className="text-xl font-bold text-slate-100 mb-6">
          {isAdmin ? 'User Growth Over Time' : t('analytics.revenuePerMonth')}
        </h3>
        {monthlyData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="text-center">
              <div className="text-lg font-medium mb-2">No data available</div>
              <div className="text-sm">
                {isAdmin
                  ? 'No user registrations found in the system.'
                  : 'No trips found. Start adding trips to see analytics here.'}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              {isAdmin ? (
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(2,6,23,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Total Users"
                  />
                </LineChart>
              ) : (
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(2,6,23,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name={t('analytics.revenue')}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* BOTTOM GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
          <h3 className="text-xl font-bold text-slate-100 mb-6">
            {isAdmin ? 'User Types Distribution' : t('analytics.profitPerYear')}
          </h3>
          <div className="h-[300px] w-full">
            <ErrorBoundary>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                {isAdmin ? (
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="admins" fill="#8b5cf6" name="Admins" />
                    <Bar
                      dataKey="regularUsers"
                      fill="#10b981"
                      name="Regular Users"
                    />
                  </BarChart>
                ) : (
                  <BarChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis
                      dataKey="year"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="profit"
                      fill="#8b5cf6"
                      name={t('analytics.profit')}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </ErrorBoundary>
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
          <h3 className="text-xl font-bold text-slate-100 mb-6">
            {isAdmin ? 'Monthly User Growth' : 'Top Destinations (by Profit)'}
          </h3>
          <div className="h-[300px] w-full">
            <ErrorBoundary>
              {isAdmin ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#f97316"
                      strokeWidth={2}
                      name="New Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={topDestinations} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis
                      type="number"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="profit" fill="#8b5cf6" name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* DISTRIBUTIONS */}
      {!isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
            <h3 className="text-xl font-bold text-slate-100 mb-6">
              Trip Status Breakdown
            </h3>
            <div className="h-[300px] w-full">
              <ErrorBoundary>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Active', value: statusBreakdown.active },
                        { name: 'Completed', value: statusBreakdown.completed },
                        { name: 'Cancelled', value: statusBreakdown.cancelled },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label
                    >
                      {['Active', 'Completed', 'Cancelled'].map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ErrorBoundary>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] p-6">
            <h3 className="text-xl font-bold text-slate-100 mb-6">
              Payment Status Distribution
            </h3>
            <div className="h-[300px] w-full">
              <ErrorBoundary>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Paid', value: paymentDistribution.paid },
                        { name: 'Partial', value: paymentDistribution.partial },
                        { name: 'Unpaid', value: paymentDistribution.unpaid },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label
                    >
                      {['Paid', 'Partial', 'Unpaid'].map((_, index) => (
                        <Cell
                          key={`cell2-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2,6,23,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#e2e8f0',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
