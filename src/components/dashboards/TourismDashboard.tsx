import React, { useMemo, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Compass, 
  Briefcase, 
  Users, 
  AlertTriangle,
  ChevronDown,
  Plus,
  TrendingUp,
  Search
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { getEffectiveTripDate, getEffectivePaymentStatus } from '../../lib/tripStatus';
import { Button } from '../travel-ui/Button';
import { StatusBadge } from '../travel-ui/StatusBadge';
import { TravelOperationsDashboard } from './TravelOperationsDashboard';

interface UserProfile {
  full_name?: string | null;
  business_name?: string | null;
}

interface TourismDashboardProps {
  trips: Trip[];
  filteredTrips: Trip[];
  isLoading: boolean;
  profile: UserProfile | null;
  isAdmin: boolean;
  yearFilter: string;
  setYearFilter: (year: string) => void;
  availableYears: string[];
  recentTrips: Trip[];
  alerts: Trip[];
  onDismissAlert: (tripId: string) => void;
  onSelectTrip: (trip: Trip) => void;
  onNavigate: (page: string) => void;
  onCreateTrip: () => void;
  adminStats?: {
    totalUsers: number;
    totalAdmins: number;
    totalRegularUsers: number;
    newUsersThisMonth: number;
  };
}

// Country flags helper for activity feed
const getDestinationFlag = (dest: string): string => {
  const normalized = (dest || '').toLowerCase();
  if (normalized.includes('dubai') || normalized.includes('uae') || normalized.includes('امارات') || normalized.includes('דובאי')) return '🇦🇪';
  if (normalized.includes('turkey') || normalized.includes('antalya') || normalized.includes('istanbul') || normalized.includes('טורקיה') || normalized.includes('تركيا')) return '🇹🇷';
  if (normalized.includes('egypt') || normalized.includes('cairo') || normalized.includes('שארם') || normalized.includes('مصر') || normalized.includes('شארם')) return '🇪🇬';
  if (normalized.includes('greece') || normalized.includes('athens') || normalized.includes('יוון') || normalized.includes('اليونان')) return '🇬🇷';
  if (normalized.includes('italy') || normalized.includes('rome') || normalized.includes('איטליה') || normalized.includes('إإيطاليا')) return '🇮🇹';
  if (normalized.includes('france') || normalized.includes('paris') || normalized.includes('צרפת') || normalized.includes('فرنسا')) return '🇫🇷';
  if (normalized.includes('georgia') || normalized.includes('tbilisi') || normalized.includes('גאורגיה') || normalized.includes('جورجيا')) return '🇬🇪';
  if (normalized.includes('thailand') || normalized.includes('bangkok') || normalized.includes('תאילנד') || normalized.includes('تايلاند')) return '🇹🇭';
  return '✈️';
};

export default function TourismDashboard({
  filteredTrips,
  isLoading,
  profile,
  isAdmin,
  yearFilter,
  setYearFilter,
  availableYears,
  recentTrips,
  alerts,
  onDismissAlert,
  onSelectTrip,
  onNavigate,
  onCreateTrip,
  adminStats
}: TourismDashboardProps) {
  const { t, direction, language } = useLanguage();
  const { convert, currency } = useCurrency();
  const isRtl = direction === 'rtl';
  const chartMargin = isRtl
    ? { top: 5, right: -10, left: 16, bottom: 5 }
    : { top: 5, right: 16, left: -10, bottom: 5 };

  // Toggle for Smart Notification Banner
  const [showBanner, setShowBanner] = useState(true);

  // Personalized greeting helper using user's full name
  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    const name = profile?.full_name || '';
    const key =
      hr < 12
        ? 'dashboard.greetingMorning'
        : hr < 18
          ? 'dashboard.greetingAfternoon'
          : 'dashboard.greetingEvening';
    return t(key, { name });
  }, [profile, t]);

  // Formatter for currency
  const formatCurrency = (val: number) => {
    const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatCompactNumber = (val: number) => {
    const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(val);
  };

  // Calculate KPI Metrics dynamically from filtered dataset
  const stats = useMemo(() => {
    const totalTrips = filteredTrips.length;
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = filteredTrips.filter(t => t.start_date >= todayStr).length;
    const clients = new Set(filteredTrips.map(t => t.client_name)).size;
    const travelers = filteredTrips.reduce((sum, t) => sum + (Number(t.travelers_count) || 0), 0);

    return { totalTrips, upcoming, clients, travelers };
  }, [filteredTrips]);

  // Generate monthly statistics for Stripe-style Area Chart with dynamic locale month formatting
  const monthlyData = useMemo(() => {
    const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';
    const data = Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(2026, i, 1);
      const name = new Intl.DateTimeFormat(locale, { month: 'short' }).format(monthDate);
      return { name, revenue: 0, profit: 0 };
    });

    filteredTrips.forEach((trip) => {
      const dateStr = getEffectiveTripDate(trip);
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      const mIndex = date.getMonth();

      const revRaw = Number(trip.sale_price) || 0;
      const wholesaleRaw = Number(trip.wholesale_cost) || 0;
      
      let profitRaw = revRaw - wholesaleRaw;
      if (trip.profit !== null && trip.profit !== undefined && Number.isFinite(Number(trip.profit))) {
        profitRaw = Number(trip.profit);
      }

      const from = trip.currency || currency;
      const to = currency;
      
      const revConverted = from === to ? revRaw : (convert ? convert(revRaw, from, to) : revRaw);
      const profitConverted = from === to ? profitRaw : (convert ? convert(profitRaw, from, to) : profitRaw);

      if (mIndex >= 0 && mIndex < 12) {
        data[mIndex].revenue += revConverted;
        data[mIndex].profit += profitConverted;
      }
    });

    return data;
  }, [filteredTrips, currency, convert, language]);

  const upcomingTrips = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return filteredTrips
      .filter((trip) => getEffectiveTripDate(trip) >= today)
      .sort((a, b) => getEffectiveTripDate(a).localeCompare(getEffectiveTripDate(b)))
      .slice(0, 5);
  }, [filteredTrips]);

  const financialPosition = useMemo(() => {
    return filteredTrips.reduce(
      (totals, trip) => {
        const from = trip.currency || currency;
        const toDashboardCurrency = (value: number) => from === currency ? value : (convert ? convert(value, from, currency) : value);
        const revenue = Number(trip.sale_price) || 0;
        const paid = Number(trip.amount_paid) || 0;
        const wholesale = Number(trip.wholesale_cost) || 0;
        const profit = trip.profit !== null && trip.profit !== undefined && Number.isFinite(Number(trip.profit))
          ? Number(trip.profit)
          : revenue - wholesale;

        totals.revenue += toDashboardCurrency(revenue);
        totals.collected += toDashboardCurrency(paid);
        totals.outstanding += toDashboardCurrency(Math.max(0, revenue - paid));
        totals.profit += toDashboardCurrency(profit);
        return totals;
      },
      { revenue: 0, collected: 0, outstanding: 0, profit: 0 }
    );
  }, [filteredTrips, currency, convert]);

  // Animation Options
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };

  const ChartTooltip = ({
    active,
    payload,
    label
  }: {
    active?: boolean;
    payload?: Array<{ color?: string; name?: string; value?: number | string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;

    return (
      <div
        dir={direction}
        className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        <p className="mb-2 font-bold text-slate-500 dark:text-slate-400">{label}</p>
        <div className="space-y-1">
          {payload.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(Number(entry.value) || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Shared dashboard section surface. Visual treatment stays intentionally restrained.
  const BentoCard = ({ 
    children, 
    className = ''
  }: { 
    children: React.ReactNode; 
    className?: string;
  }) => (
    <motion.div
      variants={itemVariants}
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </motion.div>
  );

  // Render avatar grouping for visual passenger counts
  const renderTravelersAvatars = (trip: Trip) => {
    const list = trip.travelers || [];
    if (list.length === 0) {
      const count = Number(trip.travelers_count) || 1;
      return (
        <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <div 
              key={i} 
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-[9px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
            >
              {t('dashboard.passengerInitial', { count: i + 1 })}
            </div>
          ))}
          {count > 3 && (
            <div className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              +{count - 3}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
        {list.slice(0, 3).map((traveler, i) => {
          const initials = traveler.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
            || t('dashboard.passengerInitialFallback');
          return (
            <div 
              key={i} 
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title={traveler.full_name}
            >
              {initials}
            </div>
          );
        })}
        {list.length > 3 && (
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            +{list.length - 3}
          </div>
        )}
      </div>
    );
  };

  // Render Shimmer Skeleton loading screen
  if (isLoading) {
    return (
      <div dir={direction} className="space-y-8 text-slate-900 dark:text-slate-100">
        {/* Header Skeleton */}
        <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-center rtl:lg:flex-row-reverse dark:border-slate-800">
          <div className="space-y-2 w-1/3">
            <div className="h-2 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-6 w-48 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-9 w-44 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Bento Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
          {/* Chart Card Skeleton */}
          <div className="flex h-[350px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 rtl:lg:col-start-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-48 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="h-48 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
          </div>

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex h-[105px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="h-6 w-6 rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2 mt-2">
                  <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
          <div className="h-[300px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 rtl:lg:col-start-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 h-6 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              ))}
            </div>
          </div>
          <div className="h-[300px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 h-6 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        dir={direction}
        className="relative mx-auto max-w-[1440px] space-y-6 text-slate-900 dark:text-slate-100"
      >
        <motion.header variants={itemVariants} className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-sm font-medium text-sky-700 dark:text-sky-300">{profile?.business_name || t('appName')}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white">{greeting}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.summaryLine', { upcoming: stats.upcoming, travelers: stats.travelers })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100"><Search size={14} /><span>{t('dashboard.searchEverywhere')}</span><kbd className="hidden rounded border border-slate-200 px-1 text-[10px] sm:inline dark:border-slate-700">{t('dashboard.searchShortcut')}</kbd></button>
            <div className="relative"><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="min-h-9 appearance-none rounded-xl border border-slate-300 bg-white py-2 ps-3 pe-8 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-slate-400" /></div>
            <Button onClick={onCreateTrip} variant="primary" size="sm"><Plus size={15} />{t('dashboard.newTrip')}</Button>
          </div>
        </motion.header>
        <TravelOperationsDashboard
          alerts={alerts}
          recentTrips={recentTrips}
          upcomingTrips={upcomingTrips}
          monthlyData={monthlyData}
          financialPosition={financialPosition}
          direction={direction}
          language={language}
          currency={currency}
          showBanner={showBanner}
          t={t}
          itemVariants={itemVariants}
          formatCurrency={formatCurrency}
          formatCompactNumber={formatCompactNumber}
          onDismissBanner={() => setShowBanner(false)}
          onDismissAlert={onDismissAlert}
          onSelectTrip={onSelectTrip}
          onNavigate={onNavigate}
          onCreateTrip={onCreateTrip}
          renderTravelers={renderTravelersAvatars}
        />
      </motion.div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      dir={direction}
      className="relative mx-auto max-w-[1600px] space-y-8 text-slate-900 dark:text-slate-100"
    >
      {/* 1. Smart Notification Banner */}
      {showBanner && (
        <motion.div 
          variants={itemVariants}
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="font-semibold">
              {t('dashboard.alertBannerText')}
            </span>
          </div>
          <button 
            onClick={() => setShowBanner(false)}
            aria-label={t('dashboard.dismissBanner')}
            className="rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            &times;
          </button>
        </motion.div>
      )}

      {/* Alert stack */}
      {alerts.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          {alerts.map(trip => {
            const tripDate = new Date(getEffectiveTripDate(trip));
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            tripDate.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((tripDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

            return (
              <div 
                key={trip.id}
                className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-colors md:flex-row md:items-center rtl:md:flex-row-reverse dark:border-amber-900/70 dark:bg-amber-950/20"
              >
                <div className="flex items-center gap-3">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                      {t('notifications.paymentReminder')}
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-100">
                        {daysUntil === 0 
                          ? t('notifications.today') 
                          : t('notifications.inDays', { count: daysUntil })}
                      </span>
                    </h4>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {t('notifications.paymentDueMessage', {
                        clientName: trip.client_name,
                        destination: trip.destination
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                  <button 
                    onClick={() => onSelectTrip(trip)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-300 sm:flex-none dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
                  >
                    {t('notifications.viewTrip')}
                  </button>
                  <button 
                    onClick={() => onDismissAlert(trip.id)}
                    aria-label={t('dashboard.dismissAlert')}
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-amber-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    &times;
                  </button>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* SECTION A: Smart Header */}
      <motion.div 
        variants={itemVariants} 
        className="flex flex-col items-start justify-between gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end rtl:lg:flex-row-reverse dark:border-slate-800"
      >
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            {isAdmin ? t('admin.overview') : (profile?.business_name || t('appName'))}
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            {greeting}
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {!isAdmin && (
              <>
                {t('dashboard.summaryLine', {
                  upcoming: stats.upcoming,
                  travelers: stats.travelers
                })}
              </>
            )}
          </p>
        </div>

        {/* Filters, Search, and Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end rtl:lg:justify-start">
          
          {/* Command Palette Search Trigger Button */}
          <button 
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900 sm:w-44 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">{t('dashboard.searchEverywhere')}</span>
            </span>
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{t('dashboard.searchShortcut')}</kbd>
          </button>

          {!isAdmin && (
            <div className="relative">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="cursor-pointer appearance-none rounded-xl border border-slate-300 bg-white py-2 ps-3 pe-8 text-xs font-semibold text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
          )}

          {!isAdmin && (
            <Button
              onClick={onCreateTrip}
              variant="primary"
              size="sm"
            >
              <Plus size={14} />
              <span>{t('dashboard.newTrip')}</span>
            </Button>
          )}
        </div>
      </motion.div>

      {/* SECTION B: Bento Grid Layout */}
      {isAdmin && adminStats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                  <Users size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('admin.totalUsers')}
                </p>
                <p className="text-2xl font-bold leading-none text-slate-950 dark:text-white">{adminStats.totalUsers}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('admin.platformRegistrations')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                  <Briefcase size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('admin.administrators')}
                </p>
                <p className="text-2xl font-black text-violet-400 leading-none">{adminStats.totalAdmins}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('admin.systemManagers')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Users size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('admin.regularUsers')}
                </p>
                <p className="text-2xl font-black text-emerald-400 leading-none">{adminStats.totalRegularUsers}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('admin.standardTenants')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('admin.newThisMonth')}
                </p>
                <p className="text-2xl font-black text-amber-400 leading-none">{adminStats.newUsersThisMonth}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('admin.joinedThisMonth')}
                </p>
              </div>
            </div>
          </BentoCard>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12" dir={direction}>
        
        {/* Left Side: Stripe-style Area Chart (Double width) */}
        <div className="xl:col-span-8">
          <BentoCard className="flex h-full min-h-[350px] flex-col justify-between">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row rtl:sm:flex-row-reverse sm:justify-between sm:items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {t('analytics.businessInsights')}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {t('analytics.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs rtl:flex-row-reverse">
                    <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    {t('analytics.revenue')}
                  </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                    {t('analytics.profit')}
                  </span>
                </div>
              </div>

              {/* Area curves chart */}
              <div className="h-[250px] w-full min-w-0 mt-6">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={monthlyData} margin={chartMargin}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} className="dark:opacity-30" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                      reversed={isRtl}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                      orientation={isRtl ? 'right' : 'left'}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => formatCompactNumber(Number(val))}
                    />
                    <Tooltip 
                      useTranslate3d={true}
                      content={<ChartTooltip />}
                      wrapperStyle={{ direction }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRev)" 
                      name={t('analytics.revenue')}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#0ea5e9" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorProfit)" 
                      name={t('analytics.profit')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Right Side: KPI Grid Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:col-span-4 xl:grid-cols-2 xl:content-start">
          
          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                  <Briefcase size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('dashboard.totalBookings')}
                </p>
                <p className="text-2xl font-bold leading-none text-slate-950 dark:text-white">{stats.totalTrips}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('dashboard.totalManagedRecords')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Compass size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('dashboard.upcoming')}
                </p>
                <p className="text-2xl font-black text-emerald-400 leading-none">{stats.upcoming}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('dashboard.departuresPending')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  <Users size={18} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('dashboard.activeClients')}
                </p>
                <p className="text-2xl font-black text-amber-400 leading-none">{stats.clients}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  {t('dashboard.uniqueClientsDesc')}
                </p>
              </div>
            </div>
          </BentoCard>

        </div>
      </div>

      {/* SECTION C: Recent Trips Feed & Operations Quick links */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3" dir={direction}>
        
        {/* Activity Feed (Double width) */}
        <div className="lg:col-span-2 rtl:lg:col-start-2">
          <BentoCard className="flex h-full flex-col justify-between">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row rtl:sm:flex-row-reverse sm:justify-between sm:items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {t('dashboard.liveActivityFeed')}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {t('dashboard.realtimeStatus')}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('trips')}
                  className="text-xs font-semibold text-sky-700 transition-colors hover:underline dark:text-sky-300"
                >
                  {t('dashboard.viewAll')}
                </button>
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 w-full bg-slate-800/40 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : recentTrips.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('dashboard.noTripsYet')}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentTrips.map((trip) => {
                    const status = getEffectivePaymentStatus(trip);
                    const steps = [
                      { label: t('trips.steps.flights'), completed: true },
                      { label: t('trips.steps.hotel'), completed: Number(trip.wholesale_cost) > 0 },
                      { label: t('trips.steps.paid'), completed: status === 'paid' }
                    ];
                    
                    return (
                      <div 
                        key={trip.id} 
                        onClick={() => onSelectTrip(trip)}
                        className="group flex cursor-pointer flex-col items-start justify-between gap-4 rounded-xl px-2 py-4 transition-colors hover:bg-slate-50 lg:flex-row lg:items-center rtl:lg:flex-row-reverse dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          {/* Flag visual cue */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg dark:border-slate-700 dark:bg-slate-800">
                            {getDestinationFlag(trip.destination)}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-300">
                              {trip.destination}
                            </h4>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {trip.client_name} {t('dashboard.metaSeparator')} <span className="text-[10px] text-slate-400 dark:text-slate-500">{trip.start_date}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row rtl:sm:flex-row-reverse items-start sm:items-center gap-4 lg:gap-6 w-full lg:w-auto justify-between lg:justify-end rtl:lg:justify-start">
                          
                          {/* Progress step pipeline indicators */}
                          <div className="flex items-center gap-1.5 mt-1 sm:mt-0 rtl:flex-row-reverse">
                            {steps.map((step, idx) => (
                              <React.Fragment key={idx}>
                                <div className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    step.completed ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'
                                  }`} />
                                  <span className={`text-[8px] font-bold uppercase tracking-wider ${
                                    step.completed ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'
                                  }`}>
                                    {step.label}
                                  </span>
                                </div>
                                {idx < steps.length - 1 && (
                                  <span className={`w-3 h-[1px] ${
                                    step.completed && steps[idx + 1].completed ? 'bg-sky-400' : 'bg-slate-200 dark:bg-slate-700'
                                  }`} />
                                )}
                              </React.Fragment>
                            ))}
                          </div>

                          {/* Travelers avatar group representation */}
                          <div className="flex items-center gap-2">
                            <span className="hidden text-[10px] font-medium text-slate-500 dark:text-slate-400 md:inline">
                              {t('dashboard.travelersCountLabel', { count: trip.travelers_count })}
                            </span>
                            {renderTravelersAvatars(trip)}
                          </div>

                          {/* Pulsed status Badge Capsule */}
                          <div className="flex items-center gap-3.5 shrink-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {formatCurrency(Number(trip.sale_price) || 0)}
                            </span>
                            <StatusBadge tone={status === 'paid' ? 'success' : status === 'partial' ? 'warning' : 'danger'} className="gap-1.5 text-[10px] uppercase tracking-wider">
                              {status === 'paid' 
                                ? t('trips.paymentStatuses.paid') 
                                : status === 'partial' 
                                  ? t('trips.paymentStatuses.partial') 
                                  : t('trips.paymentStatuses.unpaid')}
                            </StatusBadge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </BentoCard>
        </div>

        {/* Fast Action Panels */}
        <div className="space-y-4">
          <BentoCard className="flex h-full flex-col justify-between">
            <div className="space-y-4">
              <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('dashboard.systemShortcuts')}
                </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {t('dashboard.navigateFeatures')}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => onNavigate('trips')}
                  className="inline-flex w-full items-center justify-between rounded-xl bg-sky-600 px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-sky-500"
                >
                  <span>{t('dashboard.openBookingDesk')}</span>
                  <span className="text-[10px] bg-sky-500/25 px-2 py-0.5 rounded-md text-sky-200">{t('dashboard.newTripShortcut')}</span>
                </button>

                <button
                  onClick={() => onNavigate('analytics')}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                >
                  <span>{t('dashboard.intelligencePanel')}</span>
                  <span className="text-[10px] text-slate-500">{t('dashboard.biConsole')}</span>
                </button>

                <button
                  onClick={() => onNavigate('settings')}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                >
                  <span>{t('dashboard.platformSettings')}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{t('dashboard.manageProfiles')}</span>
                </button>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
      </>
      )}
    </motion.div>
  );
}
