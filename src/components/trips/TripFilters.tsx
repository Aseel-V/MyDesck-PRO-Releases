import { useState, useEffect } from 'react';
import { BookmarkPlus, Search, Trash2, X } from 'lucide-react';
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
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';

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
    { value: '01', label: t('analytics.months.january') },
    { value: '02', label: t('analytics.months.february') },
    { value: '03', label: t('analytics.months.march') },
    { value: '04', label: t('analytics.months.april') },
    { value: '05', label: t('analytics.months.may') },
    { value: '06', label: t('analytics.months.june') },
    { value: '07', label: t('analytics.months.july') },
    { value: '08', label: t('analytics.months.august') },
    { value: '09', label: t('analytics.months.september') },
    { value: '10', label: t('analytics.months.october') },
    { value: '11', label: t('analytics.months.november') },
    { value: '12', label: t('analytics.months.december') },
  ];

  // نفس روح التصميم الداكن في الـ navbar / Trips
  const baseInputClasses =
    'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500/70 transition-all shadow-sm ' +
    'dark:bg-slate-950/90 dark:border-slate-800/80 dark:text-slate-100 dark:placeholder-slate-400 dark:shadow-slate-950/60';
  const activeInputClasses =
    'border-sky-400 bg-sky-50 text-sky-950 ring-1 ring-sky-200 dark:border-sky-500/70 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30';

  const labelClasses =
    'block text-xs font-semibold tracking-wide text-slate-500 mb-2 dark:text-slate-300';
  const getInputClasses = (isActive: boolean) =>
    isActive ? `${baseInputClasses} ${activeInputClasses}` : baseInputClasses;

  const activeFilters = [
    paymentStatusFilter
      ? {
          key: 'payment',
          label: t('trips.paymentStatus'),
          value: t(`trips.paymentStatuses.${paymentStatusFilter}`),
          onClear: () => onPaymentStatusFilterChange(''),
        }
      : null,
    tripStatusFilter
      ? {
          key: 'status',
          label: t('trips.status'),
          value: t(`trips.statuses.${tripStatusFilter}`),
          onClear: () => onTripStatusFilterChange(''),
        }
      : null,
    monthFilter
      ? {
          key: 'month',
          label: t('analytics.month'),
          value: months.find((month) => month.value === monthFilter)?.label || monthFilter,
          onClear: () => onMonthFilterChange(''),
        }
      : null,
    destinationFilter
      ? {
          key: 'destination',
          label: t('trips.destination'),
          value: destinationFilter,
          onClear: () => onDestinationFilterChange(''),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onClear: () => void }>;

  return (
    <div className="space-y-4" dir={direction}>
      {/* Search */}
      <div className="rounded-2xl bg-white border border-slate-200 px-3.5 py-2.5 shadow-sm dark:bg-slate-950/95 dark:border-slate-800/90 dark:shadow-md dark:shadow-slate-950/60">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search 
              className={`absolute top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 cursor-pointer hover:text-sky-500 transition-colors ${isRtl ? 'right-3.5' : 'left-3.5'}`}
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
              aria-label={t('trips.search')}
              className={`${getInputClasses(Boolean(searchTerm))} ${isRtl ? 'pr-10' : 'pl-10'}`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsSavingPreset((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900/70"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>{t('trips.savePreset')}</span>
            </button>
            <button
              type="button"
              onClick={onClearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900/70"
            >
              {t('trips.clearFilters')}
            </button>
          </div>
        </div>

        {isSavingPreset && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <label className={labelClasses}>{t('trips.presetName')}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={t('trips.presetNamePlaceholder')}
                className={baseInputClasses}
              />
              <button
                type="button"
                onClick={handleSavePreset}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
              >
                {t('trips.savePreset')}
              </button>
            </div>
          </div>
        )}

        {presets.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <label className={labelClasses}>{t('trips.savedPresets')}</label>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className={baseInputClasses}
              >
                <option value="">{t('trips.choosePreset')}</option>
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
                  {t('trips.applyPreset')}
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
                  <span>{t('trips.deletePreset')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 overflow-visible">
        {/* Payment status */}
        <div>
          <label className={labelClasses}>{t('trips.paymentStatus')}</label>
          <select
            value={paymentStatusFilter}
            onChange={(e) => onPaymentStatusFilterChange(e.target.value)}
            aria-label={t('trips.paymentStatus')}
            className={getInputClasses(Boolean(paymentStatusFilter))}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="paid">{t('trips.paymentStatuses.paid')}</option>
            <option value="partial">{t('trips.paymentStatuses.partial')}</option>
            <option value="unpaid">{t('trips.paymentStatuses.unpaid')}</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {paymentStatusFilter
              ? getPaymentStatusDescription(paymentStatusFilter as 'paid' | 'partial' | 'unpaid', t)
              : t('trips.paymentFilterHelper')}
          </p>
        </div>

        <div>
          <label className={labelClasses}>{t('trips.status')}</label>
          <select
            value={tripStatusFilter}
            onChange={(e) => onTripStatusFilterChange(e.target.value)}
            aria-label={t('trips.status')}
            className={getInputClasses(Boolean(tripStatusFilter))}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="active">{t('trips.statuses.active')}</option>
            <option value="completed">{t('trips.statuses.completed')}</option>
            <option value="cancelled">{t('trips.statuses.cancelled')}</option>
            <option value="archived">{t('trips.statuses.archived')}</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {tripStatusFilter
              ? getTripStatusDescription(tripStatusFilter as 'active' | 'completed' | 'cancelled' | 'archived', t)
              : t('trips.statusFilterHelper')}
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
                   type="button"
                   key={year}
                   onClick={() => onYearFilterChange(year)}
                   aria-pressed={isActive}
                   aria-label={`${t('analytics.year')}: ${year}`}
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
            aria-label={t('analytics.month')}
            className={getInputClasses(Boolean(monthFilter))}
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
            aria-label={t('trips.destination')}
            className={getInputClasses(Boolean(destinationFilter))}
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

      {activeFilters.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-500/30 dark:bg-sky-500/10"
          aria-label={t('trips.activeFilters')}
        >
          <span className="text-xs font-semibold text-sky-800 dark:text-sky-200">
            {t('trips.activeFilters')}
          </span>
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-sky-500/30 dark:bg-slate-950/70 dark:text-slate-100"
            >
              <span className="min-w-0 truncate">
                {filter.label}: {filter.value}
              </span>
              <button
                type="button"
                onClick={filter.onClear}
                aria-label={`${t('trips.clearFilters')}: ${filter.label}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
