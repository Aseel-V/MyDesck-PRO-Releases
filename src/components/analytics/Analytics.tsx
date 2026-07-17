import { useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, UserPlus, Shield, AlertTriangle, type LucideIcon } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { supabase } from '../../lib/supabase';

import RestaurantAnalytics from './RestaurantAnalytics';
import SalesAnalytics from '../market/SalesAnalytics';

// Import Pure Logic
import {
  AnalyticsFilters,
  filterTrips,
  getPreviousPeriodFilters,
  calculateStats,
  getTripDateObj,
  generateBusinessInsights,
  calculateDestinationStats,
  getAttentionRequiredTrips,
} from './AnalyticsEngine';

// Import Sub-components
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import PaymentHealth from './components/PaymentHealth';
import BusinessInsights from './components/BusinessInsights';
import TrendChart from './components/TrendChart';
import DestinationPerformance from './components/DestinationPerformance';
import BreakdownBlocks from './components/BreakdownBlocks';
import AttentionTable from './components/AttentionTable';
import YearOverYearComparison from './components/YearOverYearComparison';

interface UserProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  role: 'user' | 'admin';
  created_at: string;
  business_name?: string | null;
  business_type?: string | null;
  subscription_status?: 'trial' | 'active' | 'expired' | 'suspended' | 'past_due';
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

interface AnalyticsProps {
  trips: Trip[];
  onSelectTrip?: (trip: Trip) => void;
  onOpenTripsWithFilter?: (options: { month?: string; pendingOnly?: boolean }) => void;
}


function AnalyticsContent({ trips, onSelectTrip, onOpenTripsWithFilter }: AnalyticsProps) {
  const { t, language, direction } = useLanguage();
  const { isAdmin } = useAuth();
  const { convert, currency, rates, isLoading: ratesLoading, isStale } = useCurrency();

  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear().toString();

  const [filters, setFilters] = useState<AnalyticsFilters>({
    year: currentYear,
    month: '',
    tripStatus: '',
    paymentStatus: '',
    destination: '',
  });

  const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-IL-u-nu-latn' : 'en-US';
  const isRtl = direction === 'rtl';

  const formatNumber = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }).format(value),
    [locale]
  );

  const formatCurrencyValue = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value),
    [currency, locale]
  );

  // Years derived from any trip containing a valid date
  const availableYears = useMemo(() => {
    const years = new Set<string>([currentYear]);
    trips.forEach((trip) => {
      const date = getTripDateObj(trip);
      if (date) years.add(date.getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [trips, currentYear]);

  useEffect(() => {
    if (!availableYears.includes(filters.year)) {
      setFilters((prev) => ({ ...prev, year: availableYears[0] || currentYear }));
    }
  }, [availableYears, currentYear, filters.year]);

  // Destinations derived from all trips
  const availableDestinations = useMemo(() => {
    const destinations = new Set<string>();
    trips.forEach((trip) => {
      if (trip.destination?.trim()) destinations.add(trip.destination.trim());
    });
    return Array.from(destinations).sort((a, b) => a.localeCompare(b, language));
  }, [trips, language]);

  // Filter current period dataset
  const filteredTrips = useMemo(() => {
    return filterTrips(trips, filters, currentYear);
  }, [trips, filters, currentYear]);

  // Filter previous comparison period dataset
  const prevFilteredTrips = useMemo(() => {
    const prevFilters = getPreviousPeriodFilters(filters);
    return filterTrips(trips, prevFilters, currentYear);
  }, [trips, filters, currentYear]);

  // Calculate stats for current and previous period
  const currentStats = useMemo(() => {
    return calculateStats(filteredTrips, currency, rates, convert);
  }, [filteredTrips, currency, rates, convert]);

  const prevStats = useMemo(() => {
    return calculateStats(prevFilteredTrips, currency, rates, convert);
  }, [prevFilteredTrips, currency, rates, convert]);

  // Fetch profiles for platform admin view
  useEffect(() => {
    const loadData = async () => {
      if (!isAdmin) return;
      setLoading(true);
      try {
        const [usersResponse, businessResponse] = await Promise.all([
          supabase.from('user_profiles').select('*'),
          supabase
            .from('business_profiles')
            .select('user_id, business_name, business_type, subscription_status, trial_start_date, is_suspended'),
        ]);

        if (usersResponse.error) throw usersResponse.error;
        if (businessResponse.error) throw businessResponse.error;

        const users = usersResponse.data || [];
        const businesses = businessResponse.data || [];
        const businessMap = new Map(businesses.map((business) => [business.user_id, business]));

        setUserProfiles(
          users.map((user) => {
            const business = businessMap.get(user.user_id);
            return {
              user_id: user.user_id,
              email: user.email,
              full_name: user.full_name,
              phone_number: user.phone_number,
              role: user.role,
              created_at: user.created_at,
              business_name: business?.business_name || null,
              business_type: business?.business_type || null,
              subscription_status: business?.subscription_status || 'trial',
              trial_start_date: business?.trial_start_date || undefined,
              is_suspended: business?.is_suspended ?? user.is_suspended,
            };
          })
        );
      } catch (error) {
        console.error('Error fetching user profiles:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  const getMonthsSinceFirstUser = (profiles: UserProfile[]) => {
    if (profiles.length === 0) return 1;
    const firstUser = [...profiles].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const firstDate = new Date(firstUser.created_at);
    const now = new Date();
    const months =
      (now.getFullYear() - firstDate.getFullYear()) * 12 + (now.getMonth() - firstDate.getMonth());
    return Math.max(1, months + 1);
  };

  const adminStats = useMemo<AdminStats>(() => {
    const totalUsers = userProfiles.length;
    const totalAdmins = userProfiles.filter((profile) => profile.role === 'admin').length;
    const totalRegularUsers = userProfiles.filter((profile) => profile.role === 'user').length;
    const now = new Date();
    const newUsersThisMonth = userProfiles.filter((profile) => {
      const createdDate = new Date(profile.created_at);
      return createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear();
    }).length;

    return {
      totalUsers,
      totalAdmins,
      totalRegularUsers,
      newUsersThisMonth,
      averageUsersPerMonth: totalUsers > 0 ? totalUsers / getMonthsSinceFirstUser(userProfiles) : 0,
    };
  }, [userProfiles]);

  const adminMonthlyData = useMemo(() => {
    if (!isAdmin) return [];
    const monthMap = new Map<string, { month: string; users: number; admins: number; regularUsers: number }>();
    userProfiles.forEach((profile) => {
      const date = new Date(profile.created_at);
      if (Number.isNaN(date.getTime())) return;
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(month) || { month, users: 0, admins: 0, regularUsers: 0 };
      monthMap.set(month, {
        month,
        users: existing.users + 1,
        admins: existing.admins + (profile.role === 'admin' ? 1 : 0),
        regularUsers: existing.regularUsers + (profile.role === 'user' ? 1 : 0),
      });
    });
    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [userProfiles, isAdmin]);

  const currencyUnavailable = useMemo(() => {
    const needsConversion = filteredTrips.some((trip) => (trip.currency || currency) !== currency);
    return needsConversion && !rates && !ratesLoading;
  }, [filteredTrips, currency, rates, ratesLoading]);

  const yearComparisonCurrencyUnavailable = useMemo(() => {
    const needsConversion = [...filteredTrips, ...prevFilteredTrips]
      .some((trip) => (trip.currency || currency) !== currency);
    return needsConversion && !rates;
  }, [currency, filteredTrips, prevFilteredTrips, rates]);

  const updateFilter = (key: keyof AnalyticsFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      year: currentYear,
      month: '',
      tripStatus: '',
      paymentStatus: '',
      destination: '',
    });
  };

  // Compile insights dynamically using pure engine calculations
  const businessInsights = useMemo(() => {
    const destStats = calculateDestinationStats(filteredTrips, currency, rates, convert);
    const attentionItems = getAttentionRequiredTrips(filteredTrips, currency, rates, convert);
    const upcomingCount = filteredTrips.filter((t) => {
      const start = getTripDateObj(t);
      return start && start >= new Date();
    }).length;

    return generateBusinessInsights(currentStats, prevStats, destStats, attentionItems, upcomingCount);
  }, [filteredTrips, currentStats, prevStats, currency, rates, convert]);

  const StatCard = ({
    icon: Icon,
    label,
    value,
    description,
    accent = 'text-sky-550',
  }: {
    icon: LucideIcon;
    label: string;
    value: string | number;
    description: string;
    accent?: string;
  }) => (
    <div className="flex min-h-[140px] flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-3.5 break-words text-2xl font-black leading-tight text-slate-850 dark:text-slate-100 sm:text-3xl">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
      </div>
      <p className="mt-4 break-words text-xs text-slate-400 dark:text-slate-550">{description}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
          <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('analytics.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 animate-fadeIn" dir={direction}>
      {/* SECTION A: Header & Toolbar */}
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-bold tracking-[0.16em] text-sky-700 dark:text-sky-300">
              {isAdmin ? t('analytics.platformInsights') : t('analytics.businessInsights')}
            </p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-100 sm:text-4xl">
              {isAdmin ? t('analytics.adminTitle') : t('analytics.title')}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isAdmin ? t('analytics.adminSubtitle') : t('analytics.subtitle')}
            </p>
          </div>

          {!isAdmin && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                {t('analytics.convertedTo', { currency })}
                {ratesLoading && <span className="ms-1 animate-pulse">...</span>}
              </span>
              {isStale && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {t('analytics.staleRatesWarning')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filters Toolbar */}
        {!isAdmin && (
          <DashboardFilters
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            availableYears={availableYears}
            availableDestinations={availableDestinations}
            currentYear={currentYear}
          />
        )}
      </div>

      {/* Warning on unavailable rates */}
      {!isAdmin && currencyUnavailable && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold text-sm">{t('analytics.currencyUnavailableTitle')}</p>
            <p className="text-xs mt-1 leading-relaxed">{t('analytics.currencyUnavailableDescription', { currency })}</p>
          </div>
        </div>
      )}

      {/* Platform Admin view OR Tourism business view */}
      {isAdmin ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label={t('analytics.totalUsers')} value={formatNumber(adminStats.totalUsers)} description={t('analytics.allRegisteredUsers')} />
            <StatCard icon={UserPlus} label={t('analytics.newUsers')} value={formatNumber(adminStats.newUsersThisMonth)} description={t('analytics.thisMonth')} accent="text-emerald-500" />
            <StatCard icon={Shield} label={t('analytics.admins')} value={formatNumber(adminStats.totalAdmins)} description={t('analytics.administrators')} accent="text-violet-500" />
            <StatCard icon={Users} label={t('analytics.regularUsers')} value={formatNumber(adminStats.totalRegularUsers)} description={t('analytics.standardAccounts')} accent="text-amber-500" />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
            <h3 className="mb-4 text-lg font-bold text-slate-850 dark:text-slate-100">
              {t('analytics.userGrowthOverTime')}
            </h3>
            {adminMonthlyData.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center text-center text-slate-400">
                <p>{t('analytics.noUserRegistrations')}</p>
              </div>
            ) : (
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adminMonthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800/40" />
                    <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} reversed={isRtl} />
                    <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} orientation={isRtl ? 'right' : 'left'} />
                    <Tooltip cursor={{ fill: 'rgba(14,165,233,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="users" fill="#0ea5e9" name={t('analytics.totalUsers')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION B: 8 Main KPI Cards */}
          <KpiCards
            currentStats={currentStats}
            prevStats={prevStats}
            currency={currency}
            formatCurrency={formatCurrencyValue}
            formatNumber={formatNumber}
          />

          <YearOverYearComparison
            selectedYear={filters.year}
            month={filters.month}
            currentStats={currentStats}
            previousStats={prevStats}
            previousTripCount={prevFilteredTrips.length}
            conversionUnavailable={yearComparisonCurrencyUnavailable}
            formatCurrency={formatCurrencyValue}
          />

          {/* SECTION C: Main Revenue & Profit Trend Chart */}
          <TrendChart
            filteredTrips={filteredTrips}
            year={filters.year}
            month={filters.month}
            currency={currency}
            formatCurrency={formatCurrencyValue}
            rates={rates}
            convert={convert}
          />

          {/* SECTION D: Operational Insights & Payment Health (Side-by-side) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <PaymentHealth
              filteredTrips={filteredTrips}
              currentStats={currentStats}
              currency={currency}
              formatCurrency={formatCurrencyValue}
              rates={rates}
              convert={convert}
              onOpenTripsWithFilter={onOpenTripsWithFilter}
            />

            <BusinessInsights insights={businessInsights} />
          </div>

          {/* SECTION E: Destination Performance ranked table & Horizontal Bar Chart */}
          <DestinationPerformance
            filteredTrips={filteredTrips}
            currency={currency}
            formatCurrency={formatCurrencyValue}
            formatNumber={formatNumber}
            rates={rates}
            convert={convert}
          />

          {/* SECTION F: Breakdown Blocks & Actionable Attention required Table */}
          <BreakdownBlocks filteredTrips={filteredTrips} />

          <AttentionTable
            filteredTrips={filteredTrips}
            currency={currency}
            formatCurrency={formatCurrencyValue}
            rates={rates}
            convert={convert}
            onSelectTrip={onSelectTrip}
          />
        </div>
      )}
    </div>
  );
}

export default function Analytics(props: AnalyticsProps) {
  const { isAdmin, profile } = useAuth();

  if (!isAdmin) {
    if (profile?.business_type === 'restaurant') {
      return (
        <Suspense fallback={<div className="h-20 animate-pulse bg-slate-100 rounded-2xl dark:bg-slate-900" />}>
          <RestaurantAnalytics />
        </Suspense>
      );
    }
    if (profile?.business_type && profile.business_type !== 'tourism') {
      return (
        <Suspense fallback={<div className="h-20 animate-pulse bg-slate-100 rounded-2xl dark:bg-slate-900" />}>
          <SalesAnalytics />
        </Suspense>
      );
    }
  }

  return <AnalyticsContent {...props} />;
}
