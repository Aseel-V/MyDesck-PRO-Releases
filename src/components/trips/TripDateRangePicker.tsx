import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarRange, Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../../lib/utils';
import { getTripDuration, toDateInputValue, toDateOnlyTimestamp } from '../../lib/tripDates';

interface TripDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  hasError?: boolean;
}

const VIEWPORT_GAP = 12;
const POPOVER_GAP = 8;
const LONG_TRIP_NIGHTS = 90;
const FAR_PAST_YEARS = 10;

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

function dateFromValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

export default function TripDateRangePicker({
  startDate,
  endDate,
  onChange,
  hasError = false,
}: TripDateRangePickerProps) {
  const { t, language, direction } = useLanguage();
  const locale = language === 'ar' ? 'ar-EG' : language === 'he' ? 'he-IL' : 'en-US';
  const isRtl = direction === 'rtl';
  const [isOpen, setIsOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [hoveredDate, setHoveredDate] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({
    position: 'fixed',
    insetBlockStart: 0,
    insetInlineStart: 0,
    visibility: 'hidden',
    zIndex: 10000,
  });
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = startDate ? dateFromValue(startDate) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => createCalendarDays(visibleMonth), [visibleMonth]);
  const startTimestamp = toDateOnlyTimestamp(draftStart);
  const endTimestamp = toDateOnlyTimestamp(draftEnd);
  const hoverTimestamp = toDateOnlyTimestamp(hoveredDate);
  const previewEndTimestamp = endTimestamp ?? (
    startTimestamp !== null && hoverTimestamp !== null && hoverTimestamp >= startTimestamp
      ? hoverTimestamp
      : null
  );
  const duration = useMemo(() => getTripDuration(draftStart, draftEnd), [draftEnd, draftStart]);

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(2024, 0, 7 + index);
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    }),
    [locale]
  );

  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, month) =>
      new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month, 1))
    ),
    [locale]
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const visibleYear = visibleMonth.getFullYear();
    const minimum = Math.min(currentYear - 150, visibleYear);
    const maximum = Math.max(currentYear + 150, visibleYear);
    return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  }, [visibleMonth]);

  useEffect(() => {
    if (isOpen) return;
    setDraftStart(startDate);
    setDraftEnd(endDate);
  }, [endDate, isOpen, startDate]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const positionPopover = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const scale = Math.min(
        1,
        (viewportWidth - VIEWPORT_GAP * 2) / width,
        (viewportHeight - VIEWPORT_GAP * 2) / height
      );
      const renderedWidth = width * scale;
      const renderedHeight = height * scale;
      const idealInlineStart = isRtl ? triggerRect.right - renderedWidth : triggerRect.left;
      const inlineStart = Math.min(
        Math.max(idealInlineStart, VIEWPORT_GAP),
        viewportWidth - renderedWidth - VIEWPORT_GAP
      );
      const below = triggerRect.bottom + POPOVER_GAP;
      const above = triggerRect.top - renderedHeight - POPOVER_GAP;
      const hasRoomBelow = below + renderedHeight <= viewportHeight - VIEWPORT_GAP;
      const hasRoomAbove = above >= VIEWPORT_GAP;
      const blockStart = hasRoomBelow
        ? below
        : hasRoomAbove
          ? above
          : Math.max(VIEWPORT_GAP, Math.min(below, viewportHeight - renderedHeight - VIEWPORT_GAP));

      const logicalInlineStart = isRtl
        ? viewportWidth - inlineStart - renderedWidth
        : inlineStart;

      setPopoverStyle({
        position: 'fixed',
        insetBlockStart: blockStart,
        insetInlineStart: logicalInlineStart,
        width,
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: isRtl ? 'top right' : 'top left',
        visibility: 'visible',
        zIndex: 10000,
      });
    };

    const frame = window.requestAnimationFrame(positionPopover);
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [direction, isOpen, isRtl, locale, visibleMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const focusValue = draftStart || toDateInputValue(new Date());
    const frame = window.requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusValue}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftStart, isOpen]);

  const formatSelectedDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      .format(dateFromValue(value));

  const rangeLabel = startDate && endDate
    ? t('trips.dateRangeSelected', {
        start: formatSelectedDate(startDate),
        end: formatSelectedDate(endDate),
      })
    : startDate
      ? t('trips.dateRangeSelectEnd', { start: formatSelectedDate(startDate) })
      : t('trips.dateRangePlaceholder');

  const openCalendar = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const initial = startDate ? dateFromValue(startDate) : new Date();
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setHoveredDate('');
    setInlineError('');
    setVisibleMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setPopoverStyle((current) => ({ ...current, visibility: 'hidden' }));
    setIsOpen(true);
  };

  const selectDate = (date: Date) => {
    const value = toDateInputValue(date);
    const selectedTimestamp = toDateOnlyTimestamp(value)!;

    setInlineError('');
    setHoveredDate('');

    if (!draftStart || draftEnd || startTimestamp === null) {
      setDraftStart(value);
      setDraftEnd('');
      return;
    }

    if (selectedTimestamp < startTimestamp) {
      setInlineError(t('trips.invalidEndDate'));
      return;
    }

    setDraftEnd(value);
    onChange(draftStart, value);
  };

  const clearRange = () => {
    setDraftStart('');
    setDraftEnd('');
    setHoveredDate('');
    setInlineError('');
    onChange('', '');
  };

  const confirmRange = () => {
    if (!draftStart || !draftEnd) {
      setInlineError(t(draftStart ? 'trips.chooseEndDate' : 'trips.chooseStartDate'));
      return;
    }
    onChange(draftStart, draftEnd);
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const focusDate = (date: Date) => {
    const value = toDateInputValue(date);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    window.requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLButtonElement>(`[data-calendar-date="${value}"]`)
        ?.focus({ preventScroll: true });
    });
  };

  const handleDayKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) => {
    let dayOffset = 0;
    if (event.key === 'ArrowLeft') dayOffset = isRtl ? 1 : -1;
    if (event.key === 'ArrowRight') dayOffset = isRtl ? -1 : 1;
    if (event.key === 'ArrowUp') dayOffset = -7;
    if (event.key === 'ArrowDown') dayOffset = 7;

    if (dayOffset !== 0) {
      event.preventDefault();
      const target = new Date(date);
      target.setDate(date.getDate() + dayOffset);
      focusDate(target);
      return;
    }

    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const target = new Date(date);
      target.setMonth(date.getMonth() + (event.key === 'PageUp' ? -1 : 1));
      focusDate(target);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target = new Date(date);
      const offset = event.key === 'Home' ? -date.getDay() : 6 - date.getDay();
      target.setDate(date.getDate() + offset);
      focusDate(target);
    }
  };

  const todayValue = toDateInputValue(new Date());
  const todayTimestamp = toDateOnlyTimestamp(todayValue)!;
  const farPastBoundary = new Date();
  farPastBoundary.setFullYear(farPastBoundary.getFullYear() - FAR_PAST_YEARS);
  const isFarPast = startTimestamp !== null && startTimestamp < toDateOnlyTimestamp(toDateInputValue(farPastBoundary))!;
  const isLongTrip = duration !== null && duration.nights > LONG_TRIP_NIGHTS;

  const calendar = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t('trips.dateRangeCalendar')}
      aria-modal="false"
      dir={direction}
      style={popoverStyle}
      className="w-[calc(100vw-1.5rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/25 dark:border-slate-700 dark:bg-slate-900 dark:shadow-slate-950/70"
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label={t('trips.previousMonth')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="sr-only" htmlFor="trip-calendar-month">{t('trips.selectMonth')}</label>
          <select
            id="trip-calendar-month"
            value={visibleMonth.getMonth()}
            onChange={(event) => setVisibleMonth((current) => new Date(current.getFullYear(), Number(event.target.value), 1))}
            className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {monthLabels.map((label, month) => <option key={label} value={month}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="trip-calendar-year">{t('trips.selectYear')}</label>
          <select
            id="trip-calendar-year"
            value={visibleMonth.getFullYear()}
            onChange={(event) => setVisibleMonth((current) => new Date(Number(event.target.value), current.getMonth(), 1))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label={t('trips.nextMonth')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400" aria-hidden="true">
        {weekdayLabels.map((label, index) => <span key={`${label}-${index}`} className="py-1">{label}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const value = toDateInputValue(date);
          const timestamp = toDateOnlyTimestamp(value)!;
          const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
          const isStart = startTimestamp === timestamp;
          const isEnd = endTimestamp === timestamp;
          const isSameDay = isStart && isEnd;
          const isBetween = startTimestamp !== null && previewEndTimestamp !== null
            && timestamp > startTimestamp && timestamp < previewEndTimestamp;
          const isPreview = endTimestamp === null && previewEndTimestamp !== null
            && timestamp > startTimestamp! && timestamp <= previewEndTimestamp;
          const isInvalidEndCandidate = startTimestamp !== null && endTimestamp === null && timestamp < startTimestamp;
          const isToday = timestamp === todayTimestamp;

          return (
            <button
              key={value}
              type="button"
              data-calendar-date={value}
              onClick={() => selectDate(date)}
              onKeyDown={(event) => handleDayKeyDown(event, date)}
              onPointerEnter={() => setHoveredDate(value)}
              onFocus={() => setHoveredDate(value)}
              onPointerLeave={() => setHoveredDate('')}
              aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}
              aria-pressed={isStart || isEnd}
              className={cn(
                'relative h-8 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
                isBetween && !isPreview && 'bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100',
                isPreview && !isStart && 'bg-cyan-50 text-cyan-950 dark:bg-cyan-950/60 dark:text-cyan-100',
                isStart && !isSameDay && 'rounded-s-lg bg-sky-600 font-bold text-white shadow-sm',
                isEnd && !isSameDay && 'rounded-e-lg bg-sky-600 font-bold text-white shadow-sm',
                isSameDay && 'rounded-lg bg-sky-600 font-bold text-white shadow-sm',
                !isStart && !isEnd && !isBetween && !isPreview && 'rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800',
                isInvalidEndCandidate && 'text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40',
                !isCurrentMonth && !isStart && !isEnd && !isBetween && !isPreview && 'text-slate-400 dark:text-slate-500',
                isCurrentMonth && !isStart && !isEnd && !isBetween && !isPreview && !isInvalidEndCandidate && 'text-slate-700 dark:text-slate-200',
                isToday && !isStart && !isEnd && 'ring-1 ring-inset ring-cyan-500'
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 min-h-12 border-t border-slate-200 pt-2 dark:border-slate-700" aria-live="polite">
        {inlineError ? (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{inlineError}</span>
          </p>
        ) : duration && draftStart && draftEnd ? (
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white">
              {formatSelectedDate(draftStart)} {t('trips.rangeSeparator')} {formatSelectedDate(draftEnd)}
            </p>
            <p>{t('trips.daysCount', { count: duration.days })} · {t('trips.nightsCount', { count: duration.nights })}</p>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {draftStart ? t('trips.chooseEndDate') : t('trips.chooseStartDate')}
          </p>
        )}
        {!inlineError && (isLongTrip || isFarPast) && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t(isLongTrip ? 'trips.longTripWarning' : 'trips.oldTripWarning')}</span>
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={clearRange}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('trips.clearDateRange')}
        </button>
        <button
          type="button"
          onClick={confirmRange}
          disabled={!draftStart || !draftEnd}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {t('trips.confirmDateRange')}
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="md:col-span-2 xl:col-span-3" dir={direction}>
      <label className="mb-2 block text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-300">
        {t('trips.dateRange')} *
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={openCalendar}
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
      {calendar}
    </div>
  );
}
