import { useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PeriodStats } from '../AnalyticsEngine';

interface YearOverYearComparisonProps {
  selectedYear: string;
  month: string;
  currentStats: PeriodStats;
  previousStats: PeriodStats;
  previousTripCount: number;
  conversionUnavailable: boolean;
  formatCurrency: (value: number) => string;
}

type ChangeTone = 'positive' | 'negative' | 'neutral';

const toneClass: Record<ChangeTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-300',
  negative: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-700 dark:text-slate-300',
};

const getTone = (value: number): ChangeTone => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';

export default function YearOverYearComparison({
  selectedYear,
  month,
  currentStats,
  previousStats,
  previousTripCount,
  conversionUnavailable,
  formatCurrency,
}: YearOverYearComparisonProps) {
  const { t } = useLanguage();

  const comparison = useMemo(() => {
    if (!/^\d{4}$/.test(selectedYear) || month) return null;

    const currentYear = Number(selectedYear);
    if (!Number.isFinite(currentYear)) return null;

    const previousYear = currentYear - 1;
    const currentProfit = currentStats.totalProfit;
    const previousProfit = previousStats.totalProfit;
    const currentProfitAvailable = currentStats.totalTrips === 0 || currentStats.unknownProfitCount < currentStats.totalTrips;
    const previousProfitAvailable = previousStats.totalTrips > 0 && previousStats.unknownProfitCount < previousStats.totalTrips;

    let profitChange: number | null = null;
    if (
      currentProfitAvailable &&
      previousProfitAvailable &&
      Number.isFinite(currentProfit) &&
      Number.isFinite(previousProfit)
    ) {
      if (previousProfit === 0) {
        profitChange = currentProfit === 0 ? 0 : null;
      } else {
        const calculated = ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100;
        profitChange = Number.isFinite(calculated) ? calculated : null;
      }
    }

    const revenueDifference = currentStats.totalRevenue - previousStats.totalRevenue;

    return {
      currentYear,
      previousYear,
      profitChange,
      revenueDifference: Number.isFinite(revenueDifference) ? revenueDifference : null,
    };
  }, [currentStats, month, previousStats, selectedYear]);

  if (!comparison) return null;

  const { currentYear, previousYear, profitChange, revenueDifference } = comparison;

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
        {t('analytics.yearComparison.comparedWith')} <span dir="ltr" className="tabular-nums">{previousYear}</span>
      </span>

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
    </aside>
  );
}
