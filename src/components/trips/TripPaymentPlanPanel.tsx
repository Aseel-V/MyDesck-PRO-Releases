import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, MessageCircle, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { buildInstallmentSchedule, fromMinorUnits, getInstallmentDisplayStatus, summarizeInstallments, toMinorUnits, validatePaymentSplit } from '../../lib/tripInstallments';
import { createTripPaymentPlan, fetchTripPaymentPlan, recalculateFutureInstallments, recordCashPayment, recordInstallmentPayment, rescheduleInstallment, type TripInstallment } from '../../lib/tripPayments';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';
import { TripWhatsappDialog } from './TripWhatsappDialog';

interface Props { trip: Trip; onClose: () => void }

export function TripPaymentPlanPanel({ trip, onClose }: Props) {
  const { t, direction, language } = useLanguage();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['trip-payment-plan', trip.id], queryFn: () => fetchTripPaymentPlan(trip.id) });
  const [method, setMethod] = useState<'card' | 'cash' | 'mixed'>(trip.payment_method || 'card');
  const [cardTotal, setCardTotal] = useState(method === 'cash' ? 0 : trip.sale_price);
  const [cashTotal, setCashTotal] = useState(method === 'card' ? 0 : trip.sale_price);
  const [count, setCount] = useState(3);
  const [firstDate, setFirstDate] = useState(new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashPaid, setCashPaid] = useState('');
  const [recalculatedCardTotal, setRecalculatedCardTotal] = useState('');
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ['trip-payment-plan', trip.id] });
  const money = (minor: number) => new Intl.NumberFormat(language === 'en' ? 'en-IL' : `${language}-IL-u-nu-latn`, { style: 'currency', currency: trip.currency }).format(fromMinorUnits(minor));
  const totalMinor = toMinorUnits(trip.sale_price);
  const cardMinor = toMinorUnits(cardTotal || 0);
  const cashMinor = toMinorUnits(cashTotal || 0);
  const splitValid = validatePaymentSplit(totalMinor, cardMinor, cashMinor);
  const preview = useMemo(() => {
    try { return cardMinor > 0 ? buildInstallmentSchedule(cardMinor, count, firstDate) : []; }
    catch { return []; }
  }, [cardMinor, count, firstDate]);
  const create = useMutation({
    mutationFn: () => createTripPaymentPlan({ tripId: trip.id, method, currency: trip.currency, cardTotalMinor: cardMinor, cashTotalMinor: cashMinor, installmentCount: cardMinor ? count : 0, firstDate }),
    onSuccess: () => { refresh(); toast.success(t('trips.installments.saved')); },
    onError: () => toast.error(t('trips.installments.saveFailed')),
  });
  const payment = useMutation({
    mutationFn: ({ item, amount }: { item: TripInstallment; amount: number }) => recordInstallmentPayment(item.id, amount, `${actionDate}T12:00:00Z`),
    onSuccess: () => { setEditing(null); refresh(); toast.success(t('trips.installments.paymentSaved')); },
    onError: () => toast.error(t('trips.installments.saveFailed')),
  });
  const reschedule = useMutation({ mutationFn: ({ id, date }: { id: string; date: string }) => rescheduleInstallment(id, date), onSuccess: () => { setEditing(null); refresh(); } });
  const cashPayment = useMutation({ mutationFn: () => recordCashPayment(query.data!.plan!.id, toMinorUnits(Number(cashPaid)), `${actionDate}T12:00:00Z`), onSuccess: () => { refresh(); toast.success(t('trips.installments.paymentSaved')); }, onError: () => toast.error(t('trips.installments.saveFailed')) });
  const recalculate = useMutation({ mutationFn: () => recalculateFutureInstallments(query.data!.plan!.id, toMinorUnits(Number(recalculatedCardTotal))), onSuccess: () => { refresh(); toast.success(t('trips.installments.recalculated')); }, onError: () => toast.error(t('trips.installments.recalculateFailed')) });
  const today = new Date().toISOString().slice(0, 10);
  const installmentSummary = query.data?.plan ? summarizeInstallments(query.data.installments, today) : null;
  const summary = query.data?.plan && installmentSummary ? {
    ...installmentSummary,
    expectedMinor: query.data.plan.card_total_minor + query.data.plan.cash_total_minor,
    paidMinor: query.data.plan.card_paid_minor + query.data.plan.cash_paid_minor,
    remainingMinor: query.data.plan.card_total_minor + query.data.plan.cash_total_minor - query.data.plan.card_paid_minor - query.data.plan.cash_paid_minor,
  } : null;

  return <div className="fixed inset-0 z-[115] overflow-y-auto bg-slate-950/75 p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="payment-plan-title">
    <div className="mx-auto my-4 w-full max-w-5xl rounded-lg bg-white shadow-2xl dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"><div><h2 id="payment-plan-title" className="font-bold">{t('trips.installments.title')}</h2><p className="text-sm text-slate-500">{trip.client_name} · {trip.destination}</p></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => setShowWhatsapp(true)} aria-label={t('trips.card.prepareWhatsapp')}><MessageCircle/></Button><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('trips.close')}><X/></Button></div></header>
      <main className="space-y-5 p-4">
        {query.data?.plan ? <>
          {query.data.plan.source === 'legacy' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{t('trips.installments.legacySummary')}</p>}
          {summary && <div className="grid grid-cols-2 gap-2 md:grid-cols-6">{[
            ['total',summary.expectedMinor],['paid',summary.paidMinor],['remaining',summary.remainingMinor],['overdue',summary.overdueMinor],
          ].map(([key,value]) => <div key={key} className="border-s-2 border-sky-500 bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t(`trips.installments.${key}`)}</span><strong className="block tabular-nums">{money(value as number)}</strong></div>)}<div className="border-s-2 border-cyan-500 bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t('trips.installments.completed')}</span><strong className="block">{summary.completed}/{summary.total}</strong></div><div className="border-s-2 border-cyan-500 bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{t('trips.installments.next')}</span><strong className="block text-sm">{summary.next?.due_date || t('trips.notSpecified')}</strong></div></div>}
          {query.data.plan.cash_total_minor > 0 && <section className="grid gap-3 border-s-2 border-emerald-500 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] dark:bg-slate-800"><label className="text-sm">{t('trips.installments.cashPaid')}<input type="number" min="0" step="0.01" value={cashPaid || fromMinorUnits(query.data.plan.cash_paid_minor)} onChange={(e) => setCashPaid(e.target.value)} className="mt-1 h-9 w-full rounded border bg-transparent px-2"/></label><label className="text-sm">{t('trips.installments.paymentDate')}<input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="mt-1 h-9 w-full rounded border bg-transparent px-2"/></label><Button className="self-end" variant="primary" onClick={() => cashPayment.mutate()}>{t('trips.installments.recordCash')}</Button></section>}
          {query.data.plan.source === 'native' && query.data.installments.some((item) => item.paid_amount_minor === 0) && <section className="flex flex-wrap items-end gap-3 border-s-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-500/10"><label className="min-w-48 flex-1 text-sm">{t('trips.installments.newCardTotal')}<input type="number" min="0" step="0.01" value={recalculatedCardTotal} onChange={(e) => setRecalculatedCardTotal(e.target.value)} className="mt-1 h-9 w-full rounded border bg-transparent px-2"/></label><Button disabled={!recalculatedCardTotal || recalculate.isPending} onClick={() => { if (window.confirm(t('trips.installments.confirmRecalculate'))) recalculate.mutate(); }}>{t('trips.installments.recalculate')}</Button></section>}
          {query.data.installments.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 text-start text-slate-500 dark:border-slate-700">{['number','dueDate','expected','paid','status','paymentDate','action'].map((key) => <th key={key} className="p-3 text-start">{t(`trips.installments.${key}`)}</th>)}</tr></thead><tbody>{query.data.installments.map((item) => { const status = getInstallmentDisplayStatus(item, today); return <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800"><td className="p-3">{item.installment_number}</td><td className="p-3 tabular-nums">{item.due_date}</td><td className="p-3 tabular-nums">{money(item.expected_amount_minor)}</td><td className="p-3 tabular-nums">{money(item.paid_amount_minor)}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{t(`trips.installments.status.${status}`)}</span></td><td className="p-3">{item.paid_at?.slice(0,10) || '-'}</td><td className="p-3">{editing === item.id ? <div className="flex min-w-[280px] gap-2"><input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-9 w-24 rounded border px-2 dark:bg-slate-950"/><input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="h-9 rounded border px-2 dark:bg-slate-950"/><Button size="icon" variant="primary" aria-label={t('trips.save')} onClick={() => payment.mutate({ item, amount: toMinorUnits(Number(paidAmount)) })}><Check className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={t('trips.cancel')} onClick={() => setEditing(null)}><X className="h-4 w-4"/></Button></div> : <div className="flex gap-1"><Button size="sm" onClick={() => { setEditing(item.id); setPaidAmount(String(fromMinorUnits(item.expected_amount_minor))); }}>{t('trips.installments.recordPayment')}</Button>{item.paid_amount_minor > 0 && <Button size="icon" variant="ghost" aria-label={t('trips.installments.undo')} onClick={() => payment.mutate({ item, amount: 0 })}><RotateCcw className="h-4 w-4"/></Button>}{item.paid_amount_minor === 0 && <Button size="icon" variant="ghost" aria-label={t('trips.installments.reschedule')} onClick={() => { const date = window.prompt(t('trips.installments.newDate'), item.due_date); if (date && window.confirm(t('trips.installments.confirmReschedule', { date }))) reschedule.mutate({ id: item.id, date }); }}><CalendarClock className="h-4 w-4"/></Button>}</div>}</td></tr>; })}</tbody></table></div>}
        </> : <section className="space-y-4"><div className="grid grid-cols-3 gap-2">{(['card','cash','mixed'] as const).map((value) => <Button key={value} variant={method === value ? 'primary' : 'secondary'} onClick={() => { setMethod(value); setCardTotal(value === 'cash' ? 0 : trip.sale_price); setCashTotal(value === 'card' ? 0 : value === 'cash' ? trip.sale_price : 0); }}>{t(`trips.paymentMethods.${value}`)}</Button>)}</div><div className="grid gap-3 sm:grid-cols-2">{method !== 'cash' && <label className="text-sm">{t('trips.installments.cardTotal')}<input type="number" min="0" step="0.01" value={cardTotal} onChange={(e) => setCardTotal(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3"/></label>}{method !== 'card' && <label className="text-sm">{t('trips.installments.cashTotal')}<input type="number" min="0" step="0.01" value={cashTotal} onChange={(e) => setCashTotal(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3"/></label>}{cardMinor > 0 && <><label className="text-sm">{t('trips.installments.count')}<input type="number" min="1" max="120" value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3"/></label><label className="text-sm">{t('trips.installments.firstDate')}<input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-transparent px-3"/></label></>}</div>{!splitValid && <p className="text-sm text-rose-600">{t('trips.installments.splitMismatch')}</p>}{preview.length > 0 && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{preview.map((item) => <div key={item.installmentNumber} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>#{item.installmentNumber} · {money(item.expectedAmountMinor)}</strong><span className="block text-slate-500">{item.dueDate}</span></div>)}</div>}<Button variant="primary" disabled={!splitValid || create.isPending || (cardMinor > 0 && preview.length !== count)} onClick={() => create.mutate()}>{t('trips.installments.create')}</Button></section>}
      </main>
    </div>
    {showWhatsapp && <TripWhatsappDialog trip={trip} initialType={query.data?.plan?.card_total_minor ? 'visa_installment' : 'cash_balance'} onClose={() => setShowWhatsapp(false)}/>}
  </div>;
}
