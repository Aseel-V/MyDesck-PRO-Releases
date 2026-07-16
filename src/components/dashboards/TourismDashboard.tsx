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
        className="rounded-xl border border-slate-800 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-xl backdrop-blur-md"
      >
        <p className="mb-2 font-bold text-slate-400">{label}</p>
        <div className="space-y-1">
          {payload.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}
              </span>
              <span className="font-semibold text-slate-100">
                {formatCurrency(Number(entry.value) || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Reusable BentoCard Component with Slate theme boundaries and RTL mirrored glows
  const BentoCard = ({ 
    children, 
    className = '', 
    glowColor = 'from-sky-500/10 to-indigo-500/10'
  }: { 
    children: React.ReactNode; 
    className?: string;
    glowColor?: string;
  }) => (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl transition-all ${className}`}
    >
      {/* Radial ambient glow - RTL mirrored */}
      <div className={`absolute -top-16 end-[-4rem] w-32 h-32 bg-gradient-to-tr ${glowColor} blur-3xl opacity-40 rounded-full pointer-events-none`} />
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
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/15 border border-sky-500/30 text-[9px] font-bold text-sky-400"
            >
              {t('dashboard.passengerInitial', { count: i + 1 })}
            </div>
          ))}
          {count > 3 && (
            <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold text-slate-400">
              +{count - 3}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
        {list.slice(0, 3).map((traveler: any, i: number) => {
          const initials = traveler.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'P';
          return (
            <div 
              key={i} 
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold text-slate-200" 
              title={traveler.full_name}
            >
              {initials}
            </div>
          );
        })}
        {list.length > 3 && (
          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-[9px] font-bold text-slate-400">
            +{list.length - 3}
          </div>
        )}
      </div>
    );
  };

  // Render Shimmer Skeleton loading screen
  if (isLoading) {
    return (
      <div dir={direction} className="space-y-6 bg-slate-950 text-slate-50 p-1 rounded-3xl min-h-screen">
        {/* Header Skeleton */}
        <div className="flex flex-col lg:flex-row rtl:lg:flex-row-reverse justify-between items-start lg:items-center gap-4 bg-slate-900/20 border border-slate-800/40 p-6 rounded-3xl animate-pulse">
          <div className="space-y-2 w-1/3">
            <div className="h-2 w-16 bg-slate-800 rounded animate-pulse" />
            <div className="h-6 w-48 bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-32 bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="h-8 w-44 bg-slate-800 rounded-xl animate-pulse" />
        </div>

        {/* Bento Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
          {/* Chart Card Skeleton */}
          <div className="lg:col-span-2 rtl:lg:col-start-2 rounded-3xl border border-slate-800/60 bg-slate-900/20 p-6 h-[350px] animate-pulse flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="h-4 w-32 bg-slate-800 rounded" />
                <div className="h-3 w-48 bg-slate-800 rounded" />
              </div>
              <div className="h-4 w-16 bg-slate-800 rounded" />
            </div>
            <div className="h-48 w-full bg-slate-800/30 rounded-2xl" />
          </div>

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-3xl border border-slate-800/60 bg-slate-900/20 p-6 h-[105px] animate-pulse flex flex-col justify-between">
                <div className="h-6 w-6 bg-slate-800 rounded-lg" />
                <div className="space-y-2 mt-2">
                  <div className="h-3 w-20 bg-slate-800 rounded" />
                  <div className="h-4 w-12 bg-slate-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
          <div className="lg:col-span-2 rtl:lg:col-start-2 rounded-3xl border border-slate-800/60 bg-slate-900/20 p-6 h-[300px] animate-pulse">
            <div className="h-6 w-32 bg-slate-800 rounded mb-6" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-slate-800/40 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/20 p-6 h-[300px] animate-pulse">
            <div className="h-6 w-32 bg-slate-800 rounded mb-6" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-slate-800/40 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      dir={direction}
      className="space-y-6 bg-slate-950 text-slate-50 p-1 rounded-3xl min-h-screen relative"
    >
      {/* 1. Smart Notification Banner */}
      {showBanner && (
        <motion.div 
          variants={itemVariants}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 shadow-sm"
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
            className="p-1 rounded hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 transition-colors"
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
                className="relative overflow-hidden bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col md:flex-row rtl:md:flex-row-reverse gap-4 items-start md:items-center justify-between transition-all hover:bg-amber-500/15"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                      {t('notifications.paymentReminder')}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200">
                        {daysUntil === 0 
                          ? t('notifications.today') 
                          : t('notifications.inDays', { count: daysUntil })}
                      </span>
                    </h4>
                    <p className="text-sm text-slate-300 mt-1">
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
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors"
                  >
                    {t('notifications.viewTrip')}
                  </button>
                  <button 
                    onClick={() => onDismissAlert(trip.id)}
                    aria-label={t('dashboard.dismissAlert')}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-lg transition-colors"
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
        className="flex flex-col lg:flex-row rtl:lg:flex-row-reverse justify-between items-start lg:items-center gap-4 bg-slate-900/30 border border-slate-800/50 backdrop-blur-md p-6 rounded-3xl"
      >
        <div className="space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-sky-400">
            {isAdmin ? t('admin.overview') : (profile?.business_name || t('appName'))}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 leading-tight">
            {greeting}
          </h1>
          <p className="text-xs text-slate-400 font-medium">
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-850 w-full sm:w-44 justify-between cursor-pointer"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Search size={14} className="text-slate-500 shrink-0" />
              <span className="truncate">{t('dashboard.searchEverywhere')}</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-850 border border-slate-700 text-[9px] text-slate-400 font-bold leading-none">{t('dashboard.searchShortcut')}</kbd>
          </button>

          {!isAdmin && (
            <div className="relative">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-800/80 rounded-xl ps-3 pe-8 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50 cursor-pointer transition-all"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 end-2 flex items-center pointer-events-none text-slate-500">
                <ChevronDown size={14} />
              </div>
            </div>
          )}

          {!isAdmin && (
            <button
              onClick={onCreateTrip}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 border border-sky-400/80 rounded-xl shadow-[0_10px_25px_rgba(56,189,248,0.3)] hover:shadow-sky-500/40 transition-all"
            >
              <Plus size={14} />
              <span>{t('dashboard.newTrip')}</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* SECTION B: Bento Grid Layout */}
      {isAdmin && adminStats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <BentoCard glowColor="from-sky-500/10 to-blue-500/5">
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
                <p className="text-2xl font-black text-white leading-none">{adminStats.totalUsers}</p>
                <p className="text-[10px] text-slate-505">
                  {t('admin.platformRegistrations')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard glowColor="from-violet-500/10 to-purple-500/5">
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
                <p className="text-[10px] text-slate-505">
                  {t('admin.systemManagers')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard glowColor="from-emerald-500/10 to-teal-500/5">
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
                <p className="text-[10px] text-slate-505">
                  {t('admin.standardTenants')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard glowColor="from-amber-500/10 to-orange-500/5">
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
                <p className="text-[10px] text-slate-505">
                  {t('admin.joinedThisMonth')}
                </p>
              </div>
            </div>
          </BentoCard>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
        
        {/* Left Side: Stripe-style Area Chart (Double width) */}
        <div className="lg:col-span-2 rtl:lg:col-start-2">
          <BentoCard glowColor="from-sky-500/10 to-blue-500/5" className="h-full flex flex-col justify-between min-h-[350px]">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row rtl:sm:flex-row-reverse sm:justify-between sm:items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    {t('analytics.performanceOverview')}
                  </h3>
                  <p className="text-[11px] text-slate-505 mt-0.5">
                    {t('analytics.monthlyRevenueProfit')}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs rtl:flex-row-reverse">
                  <span className="flex items-center gap-1 text-slate-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    {t('analytics.revenue')}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400 font-semibold">
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} className="opacity-40" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748b" 
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                      reversed={isRtl}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#64748b" 
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
          
          <BentoCard glowColor="from-sky-500/10 to-indigo-500/5">
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
                <p className="text-2xl font-black text-white leading-none">{stats.totalTrips}</p>
                <p className="text-[10px] text-slate-505">
                  {t('dashboard.totalManagedRecords')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard glowColor="from-emerald-500/10 to-teal-500/5">
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
                <p className="text-[10px] text-slate-505">
                  {t('dashboard.departuresPending')}
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard glowColor="from-amber-500/10 to-orange-500/5">
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
                <p className="text-[10px] text-slate-505">
                  {t('dashboard.uniqueClientsDesc')}
                </p>
              </div>
            </div>
          </BentoCard>

        </div>
      </div>

      {/* SECTION C: Recent Trips Feed & Operations Quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" dir={direction}>
        
        {/* Activity Feed (Double width) */}
        <div className="lg:col-span-2 rtl:lg:col-start-2">
          <BentoCard glowColor="from-violet-500/10 to-indigo-500/5" className="h-full flex flex-col justify-between">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row rtl:sm:flex-row-reverse sm:justify-between sm:items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    {t('dashboard.liveActivityFeed')}
                  </h3>
                  <p className="text-[11px] text-slate-505 mt-0.5">
                    {t('dashboard.realtimeStatus')}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('trips')}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-350 hover:underline transition-all"
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
                <div className="text-sm text-slate-550 py-10 text-center">
                  {t('dashboard.noTripsYet')}
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
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
                        className="py-4 flex flex-col lg:flex-row rtl:lg:flex-row-reverse justify-between items-start lg:items-center gap-4 hover:bg-slate-800/20 px-2 rounded-xl transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          {/* Flag visual cue */}
                          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-lg shadow-inner group-hover:scale-105 transition-transform shrink-0">
                            {getDestinationFlag(trip.destination)}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-100 group-hover:text-sky-400 transition-colors">
                              {trip.destination}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {trip.client_name} {t('dashboard.metaSeparator')} <span className="text-[10px] text-slate-500">{trip.start_date}</span>
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
                                    step.completed ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'bg-slate-800'
                                  }`} />
                                  <span className={`text-[8px] font-bold uppercase tracking-wider ${
                                    step.completed ? 'text-slate-350' : 'text-slate-505'
                                  }`}>
                                    {step.label}
                                  </span>
                                </div>
                                {idx < steps.length - 1 && (
                                  <span className={`w-3 h-[1px] ${
                                    step.completed && steps[idx + 1].completed ? 'bg-sky-500/45' : 'bg-slate-800'
                                  }`} />
                                )}
                              </React.Fragment>
                            ))}
                          </div>

                          {/* Travelers avatar group representation */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-550 font-medium hidden md:inline">
                              {t('dashboard.travelersCountLabel', { count: trip.travelers_count })}
                            </span>
                            {renderTravelersAvatars(trip)}
                          </div>

                          {/* Pulsed status Badge Capsule */}
                          <div className="flex items-center gap-3.5 shrink-0">
                            <span className="text-xs font-bold text-slate-200">
                              {formatCurrency(Number(trip.sale_price) || 0)}
                            </span>
                            <span className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : status === 'partial'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                status === 'paid'
                                  ? 'bg-emerald-400'
                                  : status === 'partial'
                                    ? 'bg-amber-400'
                                    : 'bg-rose-400'
                              } inline-block`} />
                              {status === 'paid' 
                                ? t('trips.paymentStatuses.paid') 
                                : status === 'partial' 
                                  ? t('trips.paymentStatuses.partial') 
                                  : t('trips.paymentStatuses.unpaid')}
                            </span>
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
          <BentoCard glowColor="from-indigo-500/10 to-purple-500/5" className="h-full flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  {t('dashboard.systemShortcuts')}
                </h3>
                <p className="text-[11px] text-slate-550 mt-0.5">
                  {t('dashboard.navigateFeatures')}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => onNavigate('trips')}
                  className="w-full text-xs font-bold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-white shadow-[0_4px_14px_rgba(56,189,248,0.3)] hover:shadow-sky-400/40 transition-all border border-sky-400/20"
                >
                  <span>{t('dashboard.openBookingDesk')}</span>
                  <span className="text-[10px] bg-sky-500/25 px-2 py-0.5 rounded-md text-sky-200">{t('dashboard.newTripShortcut')}</span>
                </button>

                <button
                  onClick={() => onNavigate('analytics')}
                  className="w-full text-xs font-bold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 text-slate-200 hover:text-white transition-all shadow-sm"
                >
                  <span>{t('dashboard.intelligencePanel')}</span>
                  <span className="text-[10px] text-slate-500">{t('dashboard.biConsole')}</span>
                </button>

                <button
                  onClick={() => onNavigate('settings')}
                  className="w-full text-xs font-bold inline-flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 text-slate-200 hover:text-white transition-all shadow-sm"
                >
                  <span>{t('dashboard.platformSettings')}</span>
                  <span className="text-[10px] text-slate-505">{t('dashboard.manageProfiles')}</span>
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
