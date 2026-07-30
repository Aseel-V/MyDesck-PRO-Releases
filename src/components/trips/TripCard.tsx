import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import {
  AlertTriangle, Archive, ArrowRight, BedDouble, BookTemplate, CalendarDays, CheckCircle2, ChevronDown, ChevronUp,
  Copy, CreditCard, Edit, Eye, FileText, Loader2, MessageCircle, MoreHorizontal, Phone, Plane, Trash2, TrendingUp, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import type { Trip } from '../../types/trip';
import { getTripDuration } from '../../lib/tripDates';
import { calculateTripFinancials } from '../../lib/tripFinancials';
import { getTripCardPaymentState } from '../../lib/tripCardPayment';
import { getTripStatusDescription, getTripStatusLabel } from '../../lib/tripStatus';
import { StatusBadge } from '../travel-ui/StatusBadge';
import { cn } from '../../lib/utils';
import type { VisaPaymentArrival } from '../../lib/visaPaymentArrivals';
import { useAnimatedInteger } from '../../hooks/useAnimatedInteger';

interface TripCardProps {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onDelete: (id: string) => void;
  onOpenPdfPreview: (trip: Trip) => Promise<void>;
  onView: (trip: Trip) => void;
  onDuplicate: (trip: Trip) => void;
  onSaveTemplate: (trip: Trip) => void;
  onOpenSourceTemplate: (trip: Trip) => void;
  onWhatsapp: (trip: Trip) => void;
  onArchive: (trip: Trip) => void;
  isPreparingPdf?: boolean;
  visaArrival?: VisaPaymentArrival;
  onVisaArrivalSeen?: (id: string) => void;
}
export default function TripCard({ trip, onEdit, onDelete, onOpenPdfPreview, onView, onDuplicate, onSaveTemplate, onOpenSourceTemplate, onWhatsapp, onArchive, isPreparingPdf = false, visaArrival, onVisaArrivalSeen }: TripCardProps) {
  const { t, direction, language } = useLanguage();
  const { format } = useCurrency();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const detailsId = useId();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const financials = calculateTripFinancials(trip);
  const duration = getTripDuration(trip.start_date, trip.end_date);
  const payment = getTripCardPaymentState(trip, new Date().toISOString().slice(0, 10));
  const isRtl = direction === 'rtl';
  const locale = language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-IL-u-nu-latn' : 'en-US';
  const money = (minor: number) => format(minor / 100, trip.currency || 'ILS');
  const date = (value: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  const stop = (event: MouseEvent) => event.stopPropagation();
  const animatedVisaConfirmed = useAnimatedInteger(payment.confirmedVisaMinor, visaArrival?.previousVisaConfirmedMinor ?? payment.confirmedVisaMinor, arrivalVisible);
  const animatedConfirmedTotal = useAnimatedInteger(payment.confirmedTotalMinor, visaArrival?.previousConfirmedTotalMinor ?? payment.confirmedTotalMinor, arrivalVisible);
  const animatedUnpaid = useAnimatedInteger(payment.combinedRemainingMinor, visaArrival?.previousUnpaidMinor ?? payment.combinedRemainingMinor, arrivalVisible);
  const animatedConfirmedInstallments = useAnimatedInteger(payment.processedInstallments, visaArrival?.previousConfirmedInstallments ?? payment.processedInstallments, arrivalVisible);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: globalThis.MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuButtonRef.current?.focus(); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  useEffect(() => {
    if (!visaArrival || !cardRef.current || !onVisaArrivalSeen) {
      setArrivalVisible(false);
      return;
    }
    let intersecting = false;
    let seen = false;
    let timer: number | undefined;
    let finishTimer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      if (seen || !intersecting || document.visibilityState !== 'visible') {
        setArrivalVisible(false);
        return;
      }
      setArrivalVisible(true);
      timer = window.setTimeout(() => {
        seen = true;
        setArrivalVisible(false);
        finishTimer = window.setTimeout(() => onVisaArrivalSeen(visaArrival.id), 300);
      }, 2500);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5);
      update();
    }, { threshold: [0, 0.5, 1] });
    const visibility = () => update();
    observer.observe(cardRef.current);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.clearTimeout(timer);
      window.clearTimeout(finishTimer);
    };
  }, [onVisaArrivalSeen, visaArrival]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const menuAction = (action: () => void) => { setMenuOpen(false); action(); };
  const moveMenuFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  };
  const menuItems: Array<{ Icon: LucideIcon; label: string; action: () => void; danger?: boolean }> = [
    { Icon: Copy, label: 'trips.duplicate.title', action: () => onDuplicate(trip) },
    { Icon: BookTemplate, label: 'trips.templates.fromTrip', action: () => onSaveTemplate(trip) },
    { Icon: MessageCircle, label: 'trips.card.prepareWhatsapp', action: () => onWhatsapp(trip) },
    { Icon: Archive, label: 'trips.archive', action: () => onArchive(trip) },
    { Icon: Trash2, label: 'trips.delete', action: () => onDelete(trip.id), danger: true },
  ];
  const progress = (value: number, label: string, color: string) => <div className="h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><div className={cn('h-full rounded-full transition-[width]', color)} style={{ width: `${value}%` }} /></div>;

  return <article ref={cardRef} className={cn('relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border bg-slate-950 text-slate-100 shadow-sm transition-[border-color,background-color,box-shadow] duration-300 hover:shadow-lg', arrivalVisible ? 'border-sky-400 bg-sky-950/35 shadow-[0_0_24px_rgba(56,189,248,0.24)]' : 'border-slate-800')} dir={direction} aria-labelledby={`${detailsId}-title`}>
    <div className="flex flex-1 flex-col p-4 sm:p-5">
      {arrivalVisible && <div aria-hidden="true" className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/15 px-2.5 py-1 text-xs font-semibold text-sky-200"><CreditCard className="h-3.5 w-3.5"/>{t('trips.card.newVisaPayment')}</div>}
      <header className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg font-bold text-sky-400" aria-hidden="true">{trip.destination.trim().charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 id={`${detailsId}-title`} className="min-w-0 break-words text-base font-bold leading-6 text-white sm:text-lg" title={trip.destination}>{trip.destination}</h3>
            <StatusBadge tone={trip.status === 'active' || trip.status === 'completed' ? 'success' : trip.status === 'cancelled' ? 'danger' : 'neutral'} className="shrink-0">{getTripStatusLabel(trip.status, t)}</StatusBadge>
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-300" title={trip.client_name}>{trip.client_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true"/>{t('trips.card.travelers', { count: trip.travelers_count })}</span><span aria-hidden="true">ֲ·</span><span>{t(`trips.serviceTypes.${trip.service_type}`)}</span></div>
          {trip.source_template_name && (trip.source_template_id ? <button type="button" className="mt-1 block max-w-full truncate text-start text-xs text-cyan-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" title={trip.source_template_name} onClick={() => onOpenSourceTemplate(trip)}>{t('trips.card.createdFromTemplate', { name: trip.source_template_name })}</button> : <p className="mt-1 truncate text-xs text-cyan-300" title={trip.source_template_name}>{t('trips.card.createdFromTemplate', { name: trip.source_template_name })}</p>)}
        </div>
      </header>

      {payment.statusChip && <div className="mt-3 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">{t(`trips.card.chips.${payment.statusChip.key}`, payment.statusChip.values)}</div>}
      {payment.attention && <button type="button" onClick={() => onView(trip)} className="mt-3 flex w-full items-start gap-2 border-s-2 border-amber-400 bg-amber-400/10 p-2.5 text-start text-xs text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/><span className="flex-1">{t(`trips.card.alerts.${payment.attention.key}`, payment.attention.values)}</span><span className="font-semibold">{t('trips.card.openDetails')}</span></button>}

      <section className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-slate-900/70 p-3" aria-label={t('trips.dateRange')}>
        <div className="min-w-0"><span className="block text-[11px] font-semibold text-slate-500">{t('trips.startDate')}</span><strong className="mt-1 flex items-center gap-1 text-xs sm:text-sm"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true"/>{date(trip.start_date)}</strong></div>
        <ArrowRight className={cn('h-4 w-4 text-slate-600', isRtl && 'rotate-180')} aria-hidden="true"/>
        <div className="min-w-0 text-end"><span className="block text-[11px] font-semibold text-slate-500">{t('trips.endDate')}</span><strong className="mt-1 block text-xs sm:text-sm">{date(trip.end_date)}</strong></div>
        {duration && <p className="col-span-3 border-t border-slate-800 pt-2 text-center text-xs text-slate-400">{t('trips.nightsCount', { count: duration.nights })} ֲ· {t('trips.daysCount', { count: duration.days })}</p>}
      </section>

      <section className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-800 py-3 sm:grid-cols-4" aria-label={t('trips.card.financialSummary')}>
        {[['salePrice',financials.salePrice,'text-white'],['wholesaleCost',financials.wholesaleCost,'text-slate-300'],['profit',financials.profit,financials.profit >= 0 ? 'text-emerald-400' : 'text-rose-400']].map(([key,value,color]) => <div key={key as string} className="min-w-0"><span className="block text-[11px] text-slate-500">{t(`trips.${key}`)}</span><strong className={cn('block truncate text-sm tabular-nums', color as string)} title={format(value as number, trip.currency)}>{format(value as number, trip.currency)}</strong></div>)}
        <div><span className="block text-[11px] text-slate-500">{t('trips.markupPercentage')}</span><strong className="text-sm tabular-nums text-emerald-400"><TrendingUp className="me-1 inline h-3.5 w-3.5" aria-hidden="true"/>{financials.markupPercentage.toFixed(1)}%</strong></div>
      </section>

      <section className="mt-3 min-h-[20rem] bg-slate-900/70 p-3" aria-label={t('trips.card.paymentSummary')}>
        <div className="flex items-start justify-between gap-3">
          <div><span className="text-[11px] text-slate-500">{t('trips.paymentMethod')}</span><h4 className="text-sm font-bold">{payment.method === 'card' ? t('trips.card.visa') : t(`trips.paymentMethods.${payment.method === 'legacy' ? trip.payment_method || 'cash' : payment.method}`)}</h4></div>
          <span className={cn('inline-flex items-center gap-1 text-end text-xs font-semibold', payment.isFullyPaid ? 'text-emerald-300' : payment.hasReconciliationIssue ? 'text-amber-300' : 'text-slate-300')}>
            {payment.isFullyPaid && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true"/>}{t(`trips.card.messages.${payment.messageKey || 'paymentOpen'}`)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-800 py-3">
          <div><span className="block text-[11px] text-slate-500">{t('trips.card.confirmedReceived')}</span><strong className="block text-base tabular-nums text-emerald-300">{money(animatedConfirmedTotal)}</strong></div>
          <div className="text-end"><span className="block text-[11px] text-slate-500">{t('trips.card.totalUnpaid')}</span><strong className={cn('block text-base tabular-nums', payment.hasReconciliationIssue ? 'text-amber-300' : animatedUnpaid > 0 ? 'text-rose-300' : 'text-emerald-300')}>{payment.hasReconciliationIssue ? t('trips.card.paymentDataNeedsReview') : animatedUnpaid > 0 ? money(animatedUnpaid) : t('trips.card.noOutstandingBalance')}</strong></div>
        </div>
        <div className="mt-3 space-y-1.5"><div className="flex justify-between text-xs"><span>{t('trips.card.collectionProgress')}</span><strong className="tabular-nums">{Math.round(payment.collectionProgress)}%</strong></div>{progress(payment.collectionProgress, t('trips.card.collectionProgress'), payment.isFullyPaid ? 'bg-emerald-400' : 'bg-sky-400')}</div>
        {payment.hasVisaSchedule ? <div className="mt-3 space-y-2.5 border-t border-slate-800 pt-3">
          <div className="flex items-end justify-between gap-3"><div><strong className="block text-xs">{t('trips.card.visaConfirmedCounter', { confirmed: animatedConfirmedInstallments, total: payment.installmentCount })}</strong>{payment.partialInstallments > 0 && <span className="block text-[11px] text-amber-300">{t('trips.card.visaPartialCounter', { count: payment.partialInstallments })}</span>}</div><strong className="tabular-nums text-cyan-300">{Math.round(payment.visaInstallmentProgress)}%</strong></div>
          {progress(payment.visaInstallmentProgress, t('trips.card.visaInstallmentProgress'), 'bg-cyan-400')}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div><span className="block text-slate-500">{t('trips.card.confirmedVisaPayments')}</span><strong className="tabular-nums text-emerald-300">{money(animatedVisaConfirmed)}</strong></div>
            <div className="text-end"><span className="block text-slate-500">{t('trips.card.scheduledUntilToday')}</span><strong className="tabular-nums">{money(payment.scheduledMinor)}</strong></div>
            <div><span className="block text-slate-500">{t('trips.card.overdueUnconfirmed')}</span><strong className={cn('tabular-nums', payment.overdueVisaMinor > 0 && 'text-amber-300')}>{money(payment.overdueVisaMinor)}</strong></div>
            <div className="text-end"><span className="block text-slate-500">{t('trips.card.futureScheduledVisa')}</span><strong className="tabular-nums">{money(payment.remainingVisaMinor)}</strong></div>
          </div>
          {payment.lastConfirmedVisaAt && payment.lastConfirmedVisaMinor !== null && <div className="border-t border-slate-800 pt-2 text-xs"><span className="block text-slate-500">{t('trips.card.lastConfirmedVisa')}</span><strong>{money(payment.lastConfirmedVisaMinor)} · {date(payment.lastConfirmedVisaAt)}</strong></div>}
          {(payment.nextInstallmentDate || payment.finalInstallmentDate) && <div className="flex flex-wrap items-end justify-between gap-2 border-t border-slate-800 pt-2 text-xs">{payment.nextInstallmentDate && payment.nextInstallmentMinor !== null && <div><span className="block text-slate-500">{t('trips.card.nextInstallment')}</span><strong className="text-sm text-white">{money(payment.nextInstallmentMinor)} · {date(payment.nextInstallmentDate)}</strong></div>}{payment.finalInstallmentDate && <div className="text-end"><span className="block text-slate-500">{t('trips.card.finalInstallment')}</span><strong>{date(payment.finalInstallmentDate)}</strong></div>}</div>}
        </div> : <div className="mt-3 space-y-2"><div className="flex flex-wrap justify-between gap-2 text-xs"><span>{t('trips.card.cashConfirmed')}: {money(payment.confirmedCashMinor)}</span><span>{t(`trips.paymentStatuses.${payment.authoritativePaymentStatus}`)} · {Math.round(payment.cashProgress)}%</span></div>{progress(payment.cashProgress, t('trips.card.cashProgressLabel'), payment.combinedRemainingMinor > 0 ? 'bg-amber-400' : 'bg-emerald-400')}</div>}
        {payment.method === 'mixed' && <div className="mt-3 border-t border-slate-800 pt-2"><div className="mb-1 flex justify-between text-xs"><span>{t('trips.card.cashConfirmed')}: {money(payment.confirmedCashMinor)}</span><span>{t('trips.card.cashRemaining')}: {money(payment.remainingCashMinor)}</span></div>{progress(payment.cashProgress, t('trips.card.cashProgressLabel'), 'bg-emerald-400')}</div>}
      </section>

      <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}{t(expanded ? 'trips.card.lessDetails' : 'trips.card.moreDetails')}</button>
      {expanded && <section id={detailsId} className="grid gap-2 border-t border-slate-800 pt-3 text-xs text-slate-300 sm:grid-cols-2">
        <p className="flex items-center gap-2"><BedDouble className="h-4 w-4 text-sky-400"/><span><span className="text-slate-500">{t('trips.hotelName')}:</span> {trip.hotel_name || t('trips.notSpecified')}</span></p>
        <p className="flex items-center gap-2"><Plane className="h-4 w-4 text-cyan-400"/><span><span className="text-slate-500">{t('trips.flightNumber')}:</span> {trip.flight_number || t('trips.notSpecified')}</span></p>
        {trip.client_phone?.trim() && <p className="flex min-w-0 items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-emerald-400"/><span className="truncate"><span className="text-slate-500">{t('trips.clientPhone')}:</span> <span dir="ltr">{trip.client_phone}</span></span></p>}
        <p><span className="text-slate-500">{t('trips.boardBasis')}:</span> {trip.board_basis || t('trips.notSpecified')}</p><p><span className="text-slate-500">{t('trips.itinerary')}:</span> {t(trip.has_itinerary ? 'trips.card.available' : 'trips.card.notAdded')}</p>
        {trip.notes?.trim() && <p className="line-clamp-2 sm:col-span-2" title={trip.notes}><span className="text-slate-500">{t('trips.notes')}:</span> {trip.notes}</p>}
        <p className="sm:col-span-2 text-slate-500">{t('trips.card.lastUpdated')}: {date(trip.updated_at || trip.created_at)}</p>
        <p className="sm:col-span-2 text-slate-500">{getTripStatusDescription(trip.status, t)}</p>
      </section>}
    </div>

    <footer className="mt-auto flex min-w-0 items-center gap-1.5 border-t border-slate-800 bg-slate-900/40 px-2 py-2 sm:gap-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={() => onView(trip)} className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-500 active:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><Eye className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="truncate">{t('trips.card.open')}</span></button>
        <button type="button" onClick={() => onEdit(trip)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-400 px-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300 active:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" aria-label={t('trips.actions.editAria')}><Edit className="h-4 w-4 shrink-0" aria-hidden="true"/><span>{t('trips.actions.edit')}</span></button>
        <button type="button" onClick={() => void onOpenPdfPreview(trip)} disabled={isPreparingPdf} aria-busy={isPreparingPdf} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-sky-700 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-sky-600 active:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60" aria-label={t('trips.actions.pdfAria')}>{isPreparingPdf ? <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true"/> : <FileText className="h-4 w-4 shrink-0" aria-hidden="true"/>}<span className="hidden sm:inline">{t('trips.actions.pdf')}</span>{isPreparingPdf && <span className="sr-only" role="status">{t('trips.actions.pdfLoading')}</span>}</button>
      </div>
      <div ref={menuRef} className="relative shrink-0"><button ref={menuButtonRef} type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-label={t('trips.card.moreActions')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} onClick={(event) => { stop(event); setMenuOpen((value) => !value); }}><MoreHorizontal className="h-5 w-5"/></button>{menuOpen && <div id={menuId} role="menu" onKeyDown={moveMenuFocus} className="absolute bottom-12 end-0 z-30 w-52 border border-slate-700 bg-slate-900 p-1.5 shadow-xl">{menuItems.map(({ Icon, label, action, danger }) => <button key={label} role="menuitem" type="button" onClick={() => menuAction(action)} className={cn('flex min-h-9 w-full items-center gap-2 rounded px-2.5 text-start text-xs text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none', danger && 'text-rose-300')}><Icon className="h-4 w-4"/>{t(label)}</button>)}</div>}</div>
    </footer>
  </article>;
}
