import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, RotateCcw, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { TripSortKey } from '../../lib/tripQueries';
import { cn } from '../../lib/utils';

interface TripSortControlProps {
  sortKey: TripSortKey;
  onChange: (newSortKey: TripSortKey) => void;
  className?: string;
}

export function TripSortControl({ sortKey, onChange, className }: TripSortControlProps) {
  const { t, direction } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isRtl = direction === 'rtl';

  const defaultSortKey: TripSortKey = 'updated_desc';

  const sortGroups: Array<{
    titleKey: string;
    options: Array<{ key: TripSortKey; labelKey: string }>;
  }> = [
    {
      titleKey: 'trips.sortGroups.date',
      options: [
        { key: 'updated_desc', labelKey: 'trips.sortOptions.updatedDesc' },
        { key: 'updated_asc', labelKey: 'trips.sortOptions.updatedAsc' },
        { key: 'created_desc', labelKey: 'trips.sortOptions.createdDesc' },
        { key: 'created_asc', labelKey: 'trips.sortOptions.createdAsc' },
        { key: 'start_date_asc', labelKey: 'trips.sortOptions.startDateAsc' },
        { key: 'start_date_desc', labelKey: 'trips.sortOptions.startDateDesc' },
      ],
    },
    {
      titleKey: 'trips.sortGroups.alphabetical',
      options: [
        { key: 'destination_asc', labelKey: 'trips.sortOptions.destinationAsc' },
        { key: 'destination_desc', labelKey: 'trips.sortOptions.destinationDesc' },
        { key: 'client_name_asc', labelKey: 'trips.sortOptions.clientNameAsc' },
        { key: 'client_name_desc', labelKey: 'trips.sortOptions.clientNameDesc' },
      ],
    },
    {
      titleKey: 'trips.sortGroups.financial',
      options: [
        { key: 'sale_price_desc', labelKey: 'trips.sortOptions.salePriceDesc' },
        { key: 'sale_price_asc', labelKey: 'trips.sortOptions.salePriceAsc' },
        { key: 'profit_desc', labelKey: 'trips.sortOptions.profitDesc' },
        { key: 'profit_asc', labelKey: 'trips.sortOptions.profitAsc' },
        { key: 'remaining_desc', labelKey: 'trips.sortOptions.remainingDesc' },
        { key: 'remaining_asc', labelKey: 'trips.sortOptions.remainingAsc' },
      ],
    },
    {
      titleKey: 'trips.sortGroups.status',
      options: [
        { key: 'overdue_first', labelKey: 'trips.sortOptions.overdueFirst' },
      ],
    },
  ];

  // Flatten options for active label lookup
  const allOptions = sortGroups.flatMap((g) => g.options);
  const currentOption = allOptions.find((opt) => opt.key === sortKey) || allOptions[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (key: TripSortKey) => {
    onChange(key);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block text-start', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t('trips.sortButtonLabel')}
        className={cn(
          'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500',
          sortKey !== defaultSortKey
            ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/80',
        )}
      >
        <ArrowUpDown className="h-4 w-4 text-sky-500 shrink-0" />
        <span className="hidden sm:inline text-slate-500 dark:text-slate-400 font-medium">
          {t('trips.sortLabel')}:
        </span>
        <span className="font-bold truncate max-w-[130px] sm:max-w-[170px]">
          {t(currentOption.labelKey)}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-2 w-72 max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in-50 zoom-in-95 dark:border-slate-800 dark:bg-slate-950',
            isRtl ? 'start-0' : 'end-0',
          )}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-900">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t('trips.sortTitle')}
            </span>
            {sortKey !== defaultSortKey && (
              <button
                type="button"
                onClick={() => handleSelect(defaultSortKey)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
              >
                <RotateCcw className="h-3 w-3" />
                {t('trips.resetSort')}
              </button>
            )}
          </div>

          <div className="py-1 space-y-3">
            {sortGroups.map((group) => (
              <div key={group.titleKey} className="space-y-1">
                <div className="px-3 pt-2 text-[11px] font-bold text-slate-400 uppercase">
                  {t(group.titleKey)}
                </div>
                {group.options.map((option) => {
                  const isSelected = sortKey === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelect(option.key)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors text-start',
                        isSelected
                          ? 'bg-sky-50 text-sky-800 font-bold dark:bg-sky-500/10 dark:text-sky-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900',
                      )}
                    >
                      <span>{t(option.labelKey)}</span>
                      {isSelected && <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
