import { useState, useEffect } from 'react';
import { BookmarkPlus, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { TripFilterPreset } from './tripFiltersState';
import {
  getPaymentStatusDescription,
  getTripStatusDescription,
} from '../../lib/tripStatus';

interface TripFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  presets: TripFilterPreset[];
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  filters?: Record<string, unknown>;
  // ... other props remain the same (implied)
  paymentStatusFilter: string;
  onPaymentStatusFilterChange: (value: string) => void;
  tripStatusFilter: string;
  onTripStatusFilterChange: (value: string) => void;
  yearFilter: string;
  onYearFilterChange: (value: string) => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  destinationFilter: string;
  onDestinationFilterChange: (value: string) => void;
  availableYears: string[];
  availableDestinations: string[];
}

export default function TripFilters({
  searchTerm,
  onSearchChange,
  onClearFilters,
  hasActiveFilters,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  paymentStatusFilter,
  onPaymentStatusFilterChange,
  tripStatusFilter,
  onTripStatusFilterChange,
  yearFilter,
  onYearFilterChange,
  monthFilter,
  onMonthFilterChange,
  destinationFilter,
  onDestinationFilterChange,
  availableYears,
  availableDestinations,
}: TripFiltersProps) {
  const { t } = useLanguage();

  const [localSearch, setLocalSearch] = useState(searchTerm);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Sync local state if parent updates searchTerm externally (e.g. clear filters)
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchChange(localSearch);
    }
  };

  const handleSavePreset = () => {
    if (!onSavePreset(presetName)) return;
    setPresetName('');
    setIsSavingPreset(false);
  };

  const months = [
    { value: '', label: t('trips.allMonths') },
    {
      value: '01',
      label: t('analytics.months.january') || 'January',
    },
    {
      value: '02',
      label: t('analytics.months.february') || 'February',
    },
    {
      value: '03',
      label: t('analytics.months.march') || 'March',
    },
    {
      value: '04',
      label: t('analytics.months.april') || 'April',
    },
    {
      value: '05',
      label: t('analytics.months.may') || 'May',
    },
    {
      value: '06',
      label: t('analytics.months.june') || 'June',
    },
    {
      value: '07',
      label: t('analytics.months.july') || 'July',
    },
    {
      value: '08',
      label: t('analytics.months.august') || 'August',
    },
    {
      value: '09',
      label: t('analytics.months.september') || 'September',
    },
    {
      value: '10',
      label: t('analytics.months.october') || 'October',
    },
    {
      value: '11',
      label: t('analytics.months.november') || 'November',
    },
    {
      value: '12',
      label: t('analytics.months.december') || 'December',
    },
  ];

  // نفس روح التصميم الداكن في الـ navbar / Trips
  const baseInputClasses =
    'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500/70 transition-all shadow-sm ' +
    'dark:bg-slate-950/90 dark:border-slate-800/80 dark:text-slate-100 dark:placeholder-slate-400 dark:shadow-slate-950/60';

  const labelClasses =
    'block text-xs font-semibold tracking-wide text-slate-500 mb-2 dark:text-slate-300';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="rounded-2xl bg-white border border-slate-200 px-3.5 py-2.5 shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/60">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search 
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 cursor-pointer hover:text-sky-500 transition-colors" 
              onClick={() => onSearchChange(localSearch)}
            />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => {
                const value = e.target.value;
                setLocalSearch(value);
                onSearchChange(value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('trips.search')}
              className={`${baseInputClasses} pl-10`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsSavingPreset((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900/70"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>{t('trips.savePreset') || 'Save preset'}</span>
            </button>
            <button
              type="button"
              onClick={onClearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900/70"
            >
              {t('trips.clearFilters') || 'Clear filters'}
            </button>
          </div>
        </div>

        {isSavingPreset && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <label className={labelClasses}>{t('trips.presetName') || 'Preset name'}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={t('trips.presetNamePlaceholder') || 'Example: Unpaid trips'}
                className={baseInputClasses}
              />
              <button
                type="button"
                onClick={handleSavePreset}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
              >
                {t('trips.savePreset') || 'Save preset'}
              </button>
            </div>
          </div>
        )}

        {presets.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <label className={labelClasses}>{t('trips.savedPresets') || 'Saved presets'}</label>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className={baseInputClasses}
              >
                <option value="">{t('trips.choosePreset') || 'Choose a saved preset'}</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!selectedPresetId}
                  onClick={() => onApplyPreset(selectedPresetId)}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {t('trips.applyPreset') || 'Apply'}
                </button>
                <button
                  type="button"
                  disabled={!selectedPresetId}
                  onClick={() => {
                    onDeletePreset(selectedPresetId);
                    setSelectedPresetId('');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('trips.deletePreset') || 'Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('trips.statusLegendTitle') || 'Trip statuses'}
          </p>
          <div className="mt-2 grid gap-2">
            {(['active', 'completed', 'cancelled', 'archived'] as const).map((status) => (
              <div key={status} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {t(`trips.statuses.${status}`) || status}
                </span>
                <span>{getTripStatusDescription(status, t)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('trips.paymentLegendTitle') || 'Payment statuses'}
          </p>
          <div className="mt-2 grid gap-2">
            {(['paid', 'partial', 'unpaid'] as const).map((status) => (
              <div key={status} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {t(`trips.paymentStatuses.${status}`) || status}
                </span>
                <span>{getPaymentStatusDescription(status, t)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {/* Payment status */}
        <div>
          <label className={labelClasses}>{t('trips.paymentStatus')}</label>
          <select
            value={paymentStatusFilter}
            onChange={(e) => onPaymentStatusFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="paid">{t('trips.paymentStatuses.paid')}</option>
            <option value="partial">{t('trips.paymentStatuses.partial')}</option>
            <option value="unpaid">{t('trips.paymentStatuses.unpaid')}</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {paymentStatusFilter
              ? getPaymentStatusDescription(paymentStatusFilter as 'paid' | 'partial' | 'unpaid', t)
              : (t('trips.paymentFilterHelper') || 'Filter by whether the trip is fully paid, partially paid, or unpaid.')}
          </p>
        </div>

        <div>
          <label className={labelClasses}>{t('trips.status')}</label>
          <select
            value={tripStatusFilter}
            onChange={(e) => onTripStatusFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="active">{t('trips.statuses.active')}</option>
            <option value="completed">{t('trips.statuses.completed')}</option>
            <option value="cancelled">{t('trips.statuses.cancelled')}</option>
            <option value="archived">{t('trips.statuses.archived') || 'Archived'}</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {tripStatusFilter
              ? getTripStatusDescription(tripStatusFilter as 'active' | 'completed' | 'cancelled' | 'archived', t)
              : (t('trips.statusFilterHelper') || 'Use this filter to focus on ongoing, completed, cancelled, or archived trips.')}
          </p>
        </div>

        {/* Year Selector - Segmented Control */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label className={labelClasses}>{t('analytics.year')}</label>
          <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-1 shadow-sm overflow-x-auto no-scrollbar dark:bg-slate-950/90 dark:border-slate-800/80 dark:shadow-slate-950/60">
             {availableYears.map((year) => {
               const isActive = yearFilter === year;
               return (
                 <button
                   key={year}
                   onClick={() => onYearFilterChange(year)}
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
        </div>

        {/* Month */}
        <div>
          <label className={labelClasses}>{t('analytics.month')}</label>
          <select
            value={monthFilter}
            onChange={(e) => onMonthFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        {/* Destination */}
        <div>
          <label className={labelClasses}>{t('trips.destination')}</label>
          <select
            value={destinationFilter}
            onChange={(e) => onDestinationFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allDestinations')}</option>
            {availableDestinations.map((destination) => (
              <option key={destination} value={destination}>
                {destination}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
