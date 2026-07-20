import { RotateCcw } from 'lucide-react';
import { AnalyticsFilters } from '../AnalyticsEngine';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getTripStatusLabel, getPaymentStatusLabel } from '../../../lib/tripStatus';
import { Trip } from '../../../types/trip';

interface DashboardFiltersProps {
  filters: AnalyticsFilters;
  onFilterChange: (key: keyof AnalyticsFilters, value: string) => void;
  onReset: () => void;
  availableYears: string[];
  availableDestinations: string[];
  currentYear: string;
}

export default function DashboardFilters({
  filters,
  onFilterChange,
  onReset,
  availableYears,
  availableDestinations,
  currentYear,
}: DashboardFiltersProps) {
  const { t } = useLanguage();

  const hasActiveFilters =
    filters.year !== currentYear ||
    Boolean(filters.month || filters.tripStatus || filters.paymentStatus || filters.destination);

  const monthLabel = (monthIndex: number) => {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return t(`analytics.months.${months[monthIndex]}`);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {/* Year Filter */}
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="mb-1.5 block">{t('analytics.year')}</span>
          <select
            value={filters.year}
            onChange={(e) => onFilterChange('year', e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50/50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10 dark:border-slate-800/50 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-sky-500/50"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        {/* Month Filter */}
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="mb-1.5 block">{t('analytics.month')}</span>
          <select
            value={filters.month}
            onChange={(e) => onFilterChange('month', e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50/50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10 dark:border-slate-800/50 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-sky-500/50"
          >
            <option value="">{t('analytics.allMonths')}</option>
            {Array.from({ length: 12 }).map((_, index) => (
              <option key={index} value={String(index + 1).padStart(2, '0')}>
                {monthLabel(index)}
              </option>
            ))}
          </select>
        </label>

        {/* Trip Status Filter */}
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="mb-1.5 block">{t('trips.tripStatus')}</span>
          <select
            value={filters.tripStatus}
            onChange={(e) => onFilterChange('tripStatus', e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50/50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10 dark:border-slate-800/50 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-sky-500/50"
          >
            <option value="">{t('analytics.allTripStatuses')}</option>
            {(['active', 'completed', 'cancelled', 'archived'] as Trip['status'][]).map((status) => (
              <option key={status} value={status}>
                {getTripStatusLabel(status, t)}
              </option>
            ))}
          </select>
        </label>

        {/* Payment Status Filter */}
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="mb-1.5 block">{t('trips.paymentStatus')}</span>
          <select
            value={filters.paymentStatus}
            onChange={(e) => onFilterChange('paymentStatus', e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50/50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10 dark:border-slate-800/50 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-sky-500/50"
          >
            <option value="">{t('analytics.allPaymentStatuses')}</option>
            {(['paid', 'partial', 'unpaid'] as Trip['payment_status'][]).map((status) => (
              <option key={status} value={status}>
                {getPaymentStatusLabel(status, t)}
              </option>
            ))}
          </select>
        </label>

        {/* Destination Filter */}
        <label className="min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="mb-1.5 block">{t('trips.destination')}</span>
          <select
            value={filters.destination}
            onChange={(e) => onFilterChange('destination', e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-100 bg-slate-50/50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10 dark:border-slate-800/50 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-sky-500/50"
          >
            <option value="">{t('analytics.allDestinations')}</option>
            {availableDestinations.map((dest) => (
              <option key={dest} value={dest}>
                {dest}
              </option>
            ))}
          </select>
        </label>

        {/* Reset Button */}
        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-850 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <RotateCcw className="h-4 w-4" />
            {t('analytics.resetFilters')}
          </button>
        </div>
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-50 pt-3 text-xs font-semibold text-slate-600 dark:border-slate-800/40 dark:text-slate-400">
          <span>{t('analytics.activeFilters')}:</span>
          {filters.year !== currentYear && (
            <button
              onClick={() => onFilterChange('year', currentYear)}
              className="group inline-flex items-center gap-1 rounded-lg bg-slate-100/60 px-2 py-0.5 hover:bg-slate-200/50 dark:bg-slate-950/50 dark:hover:bg-slate-900"
            >
              <span>{filters.year}</span>
              <span className="text-slate-400 group-hover:text-slate-600">×</span>
            </button>
          )}
          {filters.month && (
            <button
              onClick={() => onFilterChange('month', '')}
              className="group inline-flex items-center gap-1 rounded-lg bg-slate-100/60 px-2 py-0.5 hover:bg-slate-200/50 dark:bg-slate-950/50 dark:hover:bg-slate-900"
            >
              <span>{monthLabel(Number(filters.month) - 1)}</span>
              <span className="text-slate-400 group-hover:text-slate-600">×</span>
            </button>
          )}
          {filters.tripStatus && (
            <button
              onClick={() => onFilterChange('tripStatus', '')}
              className="group inline-flex items-center gap-1 rounded-lg bg-slate-100/60 px-2 py-0.5 hover:bg-slate-200/50 dark:bg-slate-950/50 dark:hover:bg-slate-900"
            >
              <span>{getTripStatusLabel(filters.tripStatus as Trip['status'], t)}</span>
              <span className="text-slate-400 group-hover:text-slate-600">×</span>
            </button>
          )}
          {filters.paymentStatus && (
            <button
              onClick={() => onFilterChange('paymentStatus', '')}
              className="group inline-flex items-center gap-1 rounded-lg bg-slate-100/60 px-2 py-0.5 hover:bg-slate-200/50 dark:bg-slate-950/50 dark:hover:bg-slate-900"
            >
              <span>{getPaymentStatusLabel(filters.paymentStatus as Trip['payment_status'], t)}</span>
              <span className="text-slate-400 group-hover:text-slate-600">×</span>
            </button>
          )}
          {filters.destination && (
            <button
              onClick={() => onFilterChange('destination', '')}
              className="group inline-flex items-center gap-1 rounded-lg bg-slate-100/60 px-2 py-0.5 hover:bg-slate-200/50 dark:bg-slate-950/50 dark:hover:bg-slate-900"
            >
              <span>{filters.destination}</span>
              <span className="text-slate-400 group-hover:text-slate-600">×</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
