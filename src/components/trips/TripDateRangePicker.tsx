import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../../lib/utils';
import { toDateInputValue, toDateOnlyTimestamp } from '../../lib/tripDates';

interface TripDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  hasError?: boolean;
}

function createCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
}

export default function TripDateRangePicker({
  startDate,
  endDate,
  onChange,
  hasError = false,
}: TripDateRangePickerProps) {
  const { t, language, direction } = useLanguage();
  const locale = language === 'ar' ? 'ar-EG' : language === 'he' ? 'he-IL' : 'en-US';
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => createCalendarDays(visibleMonth), [visibleMonth]);
  const startTimestamp = toDateOnlyTimestamp(startDate);
  const endTimestamp = toDateOnlyTimestamp(endDate);

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(2024, 0, 7 + index);
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    }),
    [locale]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !startDate) return;
    const start = new Date(`${startDate}T00:00:00`);
    setVisibleMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  }, [isOpen, startDate]);

  const formatSelectedDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T00:00:00`));

  const rangeLabel = startDate && endDate
    ? t('trips.dateRangeSelected', {
        start: formatSelectedDate(startDate),
        end: formatSelectedDate(endDate),
      })
    : startDate
      ? t('trips.dateRangeSelectEnd', { start: formatSelectedDate(startDate) })
      : t('trips.dateRangePlaceholder');

  const selectDate = (date: Date) => {
    const value = toDateInputValue(date);
    const selectedTimestamp = toDateOnlyTimestamp(value)!;

    if (!startDate || endDate || startTimestamp === null) {
      onChange(value, '');
      return;
    }

    if (selectedTimestamp < startTimestamp) {
      onChange(value, startDate);
    } else {
      onChange(startDate, value);
    }
    setIsOpen(false);
  };

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div ref={containerRef} className="relative md:col-span-2 xl:col-span-3" dir={direction}>
      <label className="mb-2 block text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-300">
        {t('trips.dateRange')} *
      </label>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-invalid={hasError}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 text-start text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/80 dark:bg-slate-950/90',
          hasError ? 'border-rose-500/50' : 'border-slate-200 dark:border-slate-800/80',
          startDate ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
        )}
      >
        <CalendarRange className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" dir="auto">{rangeLabel}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={t('trips.dateRangeCalendar')}
          className="absolute z-40 mt-2 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-slate-950/60"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label={t('trips.previousMonth')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {direction === 'rtl' ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visibleMonth)}
            </p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label={t('trips.nextMonth')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {direction === 'rtl' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400" aria-hidden="true">
            {weekdayLabels.map((label, index) => <span key={`${label}-${index}`} className="py-1">{label}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-y-1">
            {days.map((date) => {
              const value = toDateInputValue(date);
              const timestamp = toDateOnlyTimestamp(value)!;
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isStart = startTimestamp === timestamp;
              const isEnd = endTimestamp === timestamp;
              const isBetween = startTimestamp !== null && endTimestamp !== null && timestamp > startTimestamp && timestamp < endTimestamp;
              const isToday = value === toDateInputValue(new Date());

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}
                  aria-pressed={isStart || isEnd}
                  className={cn(
                    'relative h-9 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                    isBetween && 'bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-100',
                    (isStart || isEnd) && 'rounded-lg bg-sky-600 font-bold text-white shadow-sm hover:bg-sky-700',
                    !isStart && !isEnd && !isBetween && 'rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800',
                    !isCurrentMonth && !isStart && !isEnd && 'text-slate-300 dark:text-slate-600',
                    isCurrentMonth && !isStart && !isEnd && !isBetween && 'text-slate-700 dark:text-slate-200',
                    isToday && !isStart && !isEnd && 'ring-1 ring-inset ring-sky-400'
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {endDate ? t('trips.dateRangeComplete') : startDate ? t('trips.chooseEndDate') : t('trips.chooseStartDate')}
          </p>
        </div>
      )}
    </div>
  );
}
