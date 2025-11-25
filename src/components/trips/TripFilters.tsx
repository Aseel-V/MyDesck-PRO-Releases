import { Search } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface TripFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
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
  statusFilter,
  onStatusFilterChange,
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
    'w-full px-3 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 text-sm text-slate-100 placeholder-slate-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500/70 transition-all shadow-sm shadow-slate-950/60';

  const labelClasses =
    'block text-xs font-semibold tracking-wide text-slate-300 mb-2';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 px-3.5 py-2.5 shadow-md shadow-slate-950/60">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
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
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="paid">{t('trips.paymentStatuses.paid')}</option>
            <option value="partial">{t('trips.paymentStatuses.partial')}</option>
            <option value="unpaid">{t('trips.paymentStatuses.unpaid')}</option>
          </select>
        </div>

        {/* Trip status */}
        <div>
          <label className={labelClasses}>{t('trips.status')}</label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allStatuses')}</option>
            <option value="active">{t('trips.statuses.active')}</option>
            <option value="completed">{t('trips.statuses.completed')}</option>
            <option value="cancelled">{t('trips.statuses.cancelled')}</option>
          </select>
        </div>

        {/* Year */}
        <div>
          <label className={labelClasses}>{t('analytics.year')}</label>
          <select
            value={yearFilter}
            onChange={(e) => onYearFilterChange(e.target.value)}
            className={baseInputClasses}
          >
            <option value="">{t('trips.allYears')}</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
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
