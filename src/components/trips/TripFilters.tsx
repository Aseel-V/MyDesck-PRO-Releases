import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface TripFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
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

  // Local state for search input to allow "Enter" to trigger search
  const [localSearch, setLocalSearch] = useState(searchTerm);

  // Sync local state if parent updates searchTerm externally (e.g. clear filters)
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchChange(localSearch);
    }
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
        <div className="relative">
          <Search 
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 cursor-pointer hover:text-sky-500 transition-colors" 
            onClick={() => onSearchChange(localSearch)}
          />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('trips.search')}
            className={`${baseInputClasses} pl-10`}
          />
        </div>
      </div>

      {/* Filters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <option value="archived">Archived</option>
          </select>
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
