import { useState, useEffect, useCallback, Suspense } from 'react';
import {
  AlertTriangle,
  FileBarChart,
  RefreshCw,
  Lock,
  DollarSign,
  Plane,
  CalendarDays,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { useTravelAnalyticsSummary } from '../../lib/analyticsQueries';
import { AnalyticsFilters } from './AnalyticsEngine';

import RestaurantAnalytics from './RestaurantAnalytics';
import SalesAnalytics from '../market/SalesAnalytics';

// Import Sub-components
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import PaymentHealth from './components/PaymentHealth';
import TrendChart from './components/TrendChart';
import DestinationPerformance from './components/DestinationPerformance';
import AttentionTable from './components/AttentionTable';
import YearOverYearComparison from './components/YearOverYearComparison';
import OutstandingAgingBlock from './components/OutstandingAgingBlock';
import { TravelReportsPanel } from './TravelReportsPanel';
import { Button } from '../travel-ui/Button';

interface AnalyticsProps {
  trips?: Trip[];
  onSelectTrip?: (trip: Trip) => void;
  onOpenTripsWithFilter?: (options: {
    month?: string;
    pendingOnly?: boolean;
    destination?: string;
    tripStatus?: string;
    year?: string;
    paymentStatus?: string;
  }) => void;
}

type DomainTab = 'financial' | 'travel' | 'payments';

interface DomainFilterState {
  financial: AnalyticsFilters;
  travel: AnalyticsFilters;
  payments: AnalyticsFilters;
}

function AnalyticsContent({ trips = [], onSelectTrip, onOpenTripsWithFilter }: AnalyticsProps) {
  const { t, language, direction } = useLanguage();
  const { isAdmin } = useAuth();
  const { currency, isLoading: ratesLoading } = useCurrency();
  const [showTravelReports, setShowTravelReports] = useState(false);
  const [activeTab, setActiveTab] = useState<DomainTab>('financial');
  const currentYear = new Date().getFullYear().toString();
  const formatStoredCurrency = useCallback((value: number | null | undefined, storedCurrency: string) => (
    new Intl.NumberFormat(language === 'en' ? 'en-IL' : `${language}-IL-u-nu-latn`, {
      style: 'currency',
      currency: storedCurrency,
      maximumFractionDigits: 2,
    }).format(value ?? 0)
  ), [language]);

  // Domain-isolated persistent filter state
  const [domainFilters, setDomainFilters] = useState<DomainFilterState>(() => {
    const defaultFilters = { year: currentYear, month: '', tripStatus: '', paymentStatus: '', destination: '' };
    try {
      const saved = sessionStorage.getItem('analytics_domain_filters_v3');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return { financial: defaultFilters, travel: defaultFilters, payments: defaultFilters };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('analytics_domain_filters_v3', JSON.stringify(domainFilters));
    } catch {
      // ignore
    }
  }, [domainFilters]);

  const activeFilters = domainFilters[activeTab];

  const updateFilter = useCallback(
    (key: keyof AnalyticsFilters, value: string) => {
      setDomainFilters((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], [key]: value },
      }));
    },
    [activeTab]
  );

  const resetFilters = useCallback(() => {
    const defaultFilters = { year: currentYear, month: '', tripStatus: '', paymentStatus: '', destination: '' };
    setDomainFilters((prev) => ({
      ...prev,
      [activeTab]: defaultFilters,
    }));
  }, [activeTab, currentYear]);

  // Server-side RPC summary query for current active domain filters
  const summaryQuery = useTravelAnalyticsSummary(activeFilters);

  const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-IL-u-nu-latn' : 'en-US';

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

  const data = summaryQuery.data;
  const isLoading = summaryQuery.isLoading;
  const isError = summaryQuery.isError;
  const canViewFinancials = data?.can_view_financials ?? true;

  const handleSelectTripId = useCallback(
    (tripId: string) => {
      const found = trips.find((t) => t.id === tripId);
      if (found && onSelectTrip) {
        onSelectTrip(found);
      } else if (onOpenTripsWithFilter) {
        onOpenTripsWithFilter({});
      }
    },
    [trips, onSelectTrip, onOpenTripsWithFilter]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
          <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('analytics.loading')}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex min-h-[300px] max-w-md flex-col items-center justify-center text-center p-6 rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20">
        <AlertTriangle className="h-10 w-10 text-rose-500" />
        <h3 className="mt-3 text-base font-bold text-rose-900 dark:text-rose-200">{t('analytics.travelReports.error')}</h3>
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{t('analytics.travelReports.error')}</p>
        <button
          type="button"
          onClick={() => void summaryQuery.refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700"
        >
          <RefreshCw className="h-4 w-4" />
          {t('trips.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 animate-fadeIn" dir={direction}>
      {/* SECTION A: Header Toolbar & Segmented Domain Controls */}
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
              <Button variant="secondary" onClick={() => setShowTravelReports(true)}>
                <FileBarChart className="h-4 w-4" />
                {t('analytics.travelReports.title')}
              </Button>
              <button
                type="button"
                onClick={() => void summaryQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                title={t('analytics.refresh')}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${summaryQuery.isFetching ? 'animate-spin' : ''}`} />
                <span>{t('analytics.refresh')}</span>
              </button>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                {t('analytics.convertedTo', { currency })}
                {ratesLoading && <span className="ms-1 animate-pulse">...</span>}
              </span>
            </div>
          )}
        </div>

        {/* Three Explicit Domain Tabs */}
        {!isAdmin && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setActiveTab('financial')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === 'financial'
                  ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span>{t('dashboard.financialSnapshot')}</span>
              <span className="text-[10px] font-normal text-slate-400">({t('dashboard.subtitles.paymentDate')})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('travel')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === 'travel'
                  ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Plane className="h-4 w-4 text-sky-500" />
              <span>{t('dashboard.travelOperations')}</span>
              <span className="text-[10px] font-normal text-slate-400">({t('dashboard.subtitles.startDate')})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === 'payments'
                  ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <CalendarDays className="h-4 w-4 text-violet-500" />
              <span>{t('dashboard.paymentAttention')}</span>
              <span className="text-[10px] font-normal text-slate-400">({t('dashboard.subtitles.dueDate')})</span>
            </button>
          </div>
        )}

        {/* Financial Visibility Restricted Notice */}
        {!canViewFinancials && (
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-xs font-semibold text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
            <Lock className="h-4 w-4 shrink-0 text-violet-600" />
            <span>
              {t('analytics.financialAccessRestricted')}
            </span>
          </div>
        )}

        {/* Domain-specific Filters Toolbar */}
        {!isAdmin && (
          <DashboardFilters
            filters={activeFilters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            availableYears={data?.available_years || [currentYear]}
            availableDestinations={data?.available_destinations || []}
            currentYear={currentYear}
          />
        )}
      </div>

      {showTravelReports && (
        <TravelReportsPanel
          year={activeFilters.year}
          destination={activeFilters.destination || undefined}
          currency={currency || undefined}
          onClose={() => setShowTravelReports(false)}
        />
      )}

      {data && (
        <div className="space-y-6">
          {data.financial_currency_mode === 'grouped_only' && activeTab !== 'travel' && (
            <section className="border-s-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20" aria-live="polite">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">{t('analytics.groupedCurrencyTitle')}</h2>
                  <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">{t('analytics.groupedCurrencyNotice')}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {data.currency_totals.map((item) => (
                  <article key={item.currency} className="border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-slate-950">
                    <header className="mb-3 flex items-center justify-between gap-3">
                      <strong dir="ltr" className="text-sm text-slate-950 dark:text-white">{item.currency}</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t('analytics.currencyTripCount', { count: item.trip_count })}</span>
                    </header>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
                      {[
                        ['salesValue', item.sales],
                        ['confirmedCash', item.confirmed_cash],
                        ['confirmedVisa', item.confirmed_visa],
                        ['confirmedReceived', item.paid],
                        ['futureScheduledVisa', item.future_scheduled_visa],
                        ['totalUnpaid', item.outstanding],
                      ].map(([key, value]) => (
                        <div key={String(key)}>
                          <dt className="text-slate-500 dark:text-slate-400">{t(`analytics.${key}`)}</dt>
                          <dd dir="ltr" className="mt-1 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatStoredCurrency(value as number | null | undefined, item.currency)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* DOMAIN 1: FINANCIAL PERFORMANCE */}
          {activeTab === 'financial' && data.financial_currency_mode === 'single' && (
            <>
              {/* Financial KPI Cards */}
              <KpiCards
                currentStats={data.financial?.current_stats || data.current_stats}
                prevStats={data.financial?.previous_stats || data.previous_stats}
                currency={currency}
                canViewFinancials={canViewFinancials}
                formatCurrency={formatCurrencyValue}
                formatNumber={formatNumber}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />

              {/* Financial YoY Comparison (by coalesce(payment_date, start_date)) */}
              <YearOverYearComparison
                selectedYear={activeFilters.year}
                month={activeFilters.month}
                currentStats={data.financial?.current_stats || data.current_stats}
                previousStats={data.financial?.previous_stats || data.previous_stats}
                canViewFinancials={canViewFinancials}
                formatCurrency={formatCurrencyValue}
              />

              {/* Financial Revenue & Profit Trend Chart */}
              <TrendChart
                trendData={data.financial?.trend || data.monthly_trend || []}
                year={activeFilters.year}
                month={activeFilters.month}
                currency={currency}
                canViewFinancials={canViewFinancials}
                formatCurrency={formatCurrencyValue}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />

              {/* Sales by Destination */}
              <DestinationPerformance
                destinationStats={data.financial?.destination_sales || data.destination_stats || []}
                canViewFinancials={canViewFinancials}
                currency={currency}
                formatCurrency={formatCurrencyValue}
                formatNumber={formatNumber}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />
            </>
          )}

          {/* DOMAIN 2: TRAVEL OPERATIONS */}
          {activeTab === 'travel' && (
            <>
              {/* Operational Travel Trend Chart (by start_date) */}
              <TrendChart
                trendData={data.travel?.trend || []}
                year={activeFilters.year}
                month={activeFilters.month}
                currency={currency}
                canViewFinancials={false}
                formatCurrency={formatCurrencyValue}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />

              {/* Destination Travel Volume (by start_date) */}
              <DestinationPerformance
                destinationStats={data.travel?.destination_volume || []}
                canViewFinancials={false}
                currency={currency}
                formatCurrency={formatCurrencyValue}
                formatNumber={formatNumber}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />

              {/* Attention Table */}
              <AttentionTable
                attentionItems={data.travel?.attention_items || data.attention_items || []}
                canViewFinancials={canViewFinancials}
                currency={currency}
                formatCurrency={formatCurrencyValue}
                onSelectTrip={handleSelectTripId}
              />
            </>
          )}

          {/* DOMAIN 3: PAYMENT SCHEDULE & AGING */}
          {activeTab === 'payments' && data.financial_currency_mode === 'single' && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <PaymentHealth
                paymentHealth={data.payments?.summary || data.payment_health || {}}
                currentStats={data.current_stats}
                canViewFinancials={canViewFinancials}
                currency={currency}
                formatCurrency={formatCurrencyValue}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />

              <OutstandingAgingBlock
                aging={data.payments?.aging || data.aging_buckets || { current: 0, overdue_1_30: 0, overdue_31_60: 0, overdue_61_plus: 0, future_scheduled: 0, unscheduled_outstanding: 0 }}
                canViewFinancials={canViewFinancials}
                formatCurrency={formatCurrencyValue}
                onOpenTripsWithFilter={onOpenTripsWithFilter}
              />
            </div>
          )}
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
