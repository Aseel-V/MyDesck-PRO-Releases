import { useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { analyticsDifference, analyticsPercentageChange, PeriodAggregateStats } from '../../../lib/analyticsQueries';

interface YearOverYearComparisonProps {
  selectedYear: string;
  month: string;
  currentStats: PeriodAggregateStats;
  previousStats: PeriodAggregateStats;
  canViewFinancials?: boolean;
  conversionUnavailable?: boolean;
  formatCurrency: (value: number) => string;
}

type ChangeTone = 'positive' | 'negative' | 'neutral';

const toneClass: Record<ChangeTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-300',
  negative: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-700 dark:text-slate-300',
};

const getTone = (value: number): ChangeTone => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');

export default function YearOverYearComparison({
  selectedYear,
  month,
  currentStats,
  previousStats,
  canViewFinancials = true,
  conversionUnavailable,
  formatCurrency,
}: YearOverYearComparisonProps) {
  const { t } = useLanguage();

  const comparison = useMemo(() => {
    const currentYearNum = Number(selectedYear);
    if (!Number.isFinite(currentYearNum)) return null;

    const previousYearNum = currentYearNum - 1;
    const currentProfit = currentStats.total_profit;
    const previousProfit = previousStats.total_profit;

    let profitChange: number | null = null;
    if (canViewFinancials && currentProfit !== null && previousProfit !== null && previousProfit !== 0 && Number.isFinite(currentProfit) && Number.isFinite(previousProfit)) {
      profitChange = analyticsPercentageChange(currentProfit, previousProfit);
    }

    const revenueDifference = canViewFinancials
      ? analyticsDifference(currentStats.total_revenue, previousStats.total_revenue)
      : null;
    const tripDifference = analyticsDifference(currentStats.total_trips, previousStats.total_trips);

    return {
      currentYear: currentYearNum,
      previousYear: previousYearNum,
      profitChange,
      revenueDifference: Number.isFinite(revenueDifference) ? revenueDifference : null,
      tripDifference: tripDifference !== null && Number.isFinite(tripDifference) ? tripDifference : null,
      previousTripCount: previousStats.total_trips,
    };
  }, [canViewFinancials, currentStats, previousStats, selectedYear]);

  if (!comparison) return null;

  const { currentYear, previousYear, profitChange, revenueDifference, tripDifference, previousTripCount } = comparison;

  if (tripDifference === null || previousTripCount === null) {
    return (
      <aside
        aria-label={t('analytics.yearComparison.accessibleLabel', { currentYear, previousYear })}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400"
      >
        {t('analytics.yearComparison.unavailable')}
      </aside>
    );
  }

  if (previousTripCount === 0) {
    return (
      <aside
        aria-label={t('analytics.yearComparison.accessibleLabel', { currentYear, previousYear })}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400"
      >
        {t('analytics.yearComparison.noPreviousData', { year: previousYear })}
      </aside>
    );
  }

  if (conversionUnavailable) {
    return (
      <aside
        aria-label={t('analytics.yearComparison.accessibleLabel', { currentYear, previousYear })}
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400"
      >
        {t('analytics.yearComparison.unavailable')}
      </aside>
    );
  }

  const formatSignedPercent = (value: number) => {
    if (value === 0) return '0.0%';
    return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
  };

  const formatSignedCurrency = (value: number) => {
    if (value === 0) return formatCurrency(0);
    return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
  };

  return (
    <aside
      aria-label={t('analytics.yearComparison.accessibleLabel', { currentYear, previousYear })}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/50"
    >
      <span className="font-medium text-slate-500 dark:text-slate-400">
        {month
          ? `${t('analytics.yearComparison.comparedWith') || 'Compared with'} ${previousYear}-${month}`
          : `${t('analytics.yearComparison.comparedWith') || 'Compared with'} ${previousYear}`}
      </span>

      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-slate-600 dark:text-slate-400">{t('dashboard.trips')}</span>
        <span dir="ltr" className={`font-bold tabular-nums ${toneClass[getTone(tripDifference)]}`}>
          {tripDifference >= 0 ? `+${tripDifference}` : tripDifference}
        </span>
      </span>

      {canViewFinancials && (
        <>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-600 dark:text-slate-400">{t('analytics.yearComparison.profitChange')}</span>
            {profitChange === null ? (
              <span aria-label={t('analytics.yearComparison.valueUnavailable')} className="font-semibold text-slate-500">—</span>
            ) : (
              <span dir="ltr" className={`font-bold tabular-nums ${toneClass[getTone(profitChange)]}`}>
                {formatSignedPercent(profitChange)}
              </span>
            )}
          </span>

          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-600 dark:text-slate-400">{t('analytics.yearComparison.salesDifference')}</span>
            {revenueDifference === null ? (
              <span aria-label={t('analytics.yearComparison.valueUnavailable')} className="font-semibold text-slate-500">—</span>
            ) : (
              <span dir="ltr" className={`font-bold tabular-nums ${toneClass[getTone(revenueDifference)]}`}>
                {formatSignedCurrency(revenueDifference)}
              </span>
            )}
          </span>
        </>
      )}
    </aside>
  );
}
