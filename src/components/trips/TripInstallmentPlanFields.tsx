import { useMemo } from 'react';
import { CalendarClock, CreditCard } from 'lucide-react';
import { buildInstallmentSchedule, fromMinorUnits, paymentMethodIncludesInstallments, toMinorUnits, validatePaymentSplit } from '../../lib/tripInstallments';
import type { TripPaymentPlanDraft } from '../../types/trip';
import { cn } from '../../lib/utils';

interface Props {
  method: 'card' | 'cash' | 'mixed' | null | undefined;
  salePrice: number;
  amountPaid: number;
  cashPaid: number;
  currency: string;
  direction: 'rtl' | 'ltr';
  plan: TripPaymentPlanDraft;
  errors?: Partial<Record<'card_total' | 'cash_total' | 'installment_count' | 'first_installment_date', string>>;
  t: (key: string, values?: Record<string, unknown>) => string;
  format: (value: number, currency: string, displayCurrency?: string) => string;
  onChange: <K extends keyof TripPaymentPlanDraft>(field: K, value: TripPaymentPlanDraft[K]) => void;
}

export default function TripInstallmentPlanFields({ method, salePrice, amountPaid, cashPaid, currency, direction, plan, errors, t, format, onChange }: Props) {
  const includesCard = paymentMethodIncludesInstallments(method);
  const cardMinor = toMinorUnits(Math.max(0, Number(plan.card_total) || 0));
  const cashMinor = toMinorUnits(Math.max(0, Number(plan.cash_total) || 0));
  const saleMinor = toMinorUnits(Math.max(0, Number(salePrice) || 0));
  const schedule = useMemo(() => {
    if (!includesCard || cardMinor <= 0 || !plan.first_installment_date) return [];
    try { return buildInstallmentSchedule(cardMinor, Number(plan.installment_count), plan.first_installment_date); }
    catch { return []; }
  }, [cardMinor, includesCard, plan.first_installment_date, plan.installment_count]);
  if (!includesCard) return null;

  const splitValid = method !== 'mixed' || validatePaymentSplit(saleMinor, cardMinor, cashMinor);
  const scheduleTotal = schedule.reduce((sum, item) => sum + item.expectedAmountMinor, 0);
  const firstAmount = schedule[0]?.expectedAmountMinor ?? 0;
  const finalItem = schedule[schedule.length - 1];
  const confirmedCash = Math.max(0, method === 'mixed' ? cashPaid : amountPaid);
  const remainingCash = Math.max(0, Number(plan.cash_total) - confirmedCash);
  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400';
  const errorClass = 'border-rose-500 focus:ring-rose-500';

  return <section className="space-y-4 border-s-2 border-cyan-400 bg-slate-950/70 p-4" dir={direction} aria-labelledby="installment-plan-heading">
    <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-cyan-300" aria-hidden="true"/><div><h3 id="installment-plan-heading" className="text-sm font-bold text-white">{t('trips.installments.formTitle')}</h3><p className="text-xs text-slate-400">{t('trips.installments.formHelp')}</p></div></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-300">{t('trips.installments.cardAmount')}<input type="number" min="0.01" step="0.01" dir="ltr" value={plan.card_total} onChange={(event) => onChange('card_total', Number(event.target.value))} className={cn(inputClass, errors?.card_total && errorClass)} aria-invalid={Boolean(errors?.card_total)}/>{errors?.card_total && <span className="mt-1 block text-xs text-rose-400">{errors.card_total}</span>}</label>
      {method === 'mixed' && <label className="text-xs font-semibold text-slate-300">{t('trips.installments.cashAmount')}<input type="number" min="0" step="0.01" dir="ltr" value={plan.cash_total} onChange={(event) => onChange('cash_total', Number(event.target.value))} className={cn(inputClass, errors?.cash_total && errorClass)} aria-invalid={Boolean(errors?.cash_total)}/>{errors?.cash_total && <span className="mt-1 block text-xs text-rose-400">{errors.cash_total}</span>}</label>}
      <label className="text-xs font-semibold text-slate-300">{t('trips.installments.count')}<input type="number" min="1" max="120" step="1" dir="ltr" value={plan.installment_count} onChange={(event) => onChange('installment_count', Number(event.target.value))} className={cn(inputClass, errors?.installment_count && errorClass)} aria-invalid={Boolean(errors?.installment_count)}/>{errors?.installment_count && <span className="mt-1 block text-xs text-rose-400">{errors.installment_count}</span>}</label>
      <label className="text-xs font-semibold text-slate-300">{t('trips.installments.firstDate')}<input type="date" dir="ltr" required value={plan.first_installment_date} onChange={(event) => onChange('first_installment_date', event.target.value)} className={cn(inputClass, errors?.first_installment_date && errorClass)} aria-invalid={Boolean(errors?.first_installment_date)}/>{errors?.first_installment_date && <span className="mt-1 block text-xs text-rose-400">{errors.first_installment_date}</span>}</label>
    </div>
    {!splitValid && <p className="border-s-2 border-rose-400 bg-rose-500/10 p-2 text-xs text-rose-200" role="alert">{t('trips.installments.splitMismatch')}</p>}
    {method === 'mixed' && <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-400">{t('trips.installments.cashPaid')}</span><strong className="block text-emerald-300">{format(confirmedCash, currency, currency)}</strong></div><div><span className="text-slate-400">{t('trips.installments.cashRemaining')}</span><strong className="block text-amber-300">{format(remainingCash, currency, currency)}</strong></div></div>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="bg-slate-900 p-3"><span className="text-xs text-slate-400">{t('trips.installments.amountEach')}</span><strong className="block text-sm text-white">{format(fromMinorUnits(firstAmount), currency, currency)}</strong></div><div className="bg-slate-900 p-3"><span className="text-xs text-slate-400">{t('trips.installments.finalDate')}</span><strong className="block text-sm text-white">{finalItem?.dueDate || t('trips.notSpecified')}</strong></div></div>
    <div><h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200"><CalendarClock className="h-4 w-4 text-cyan-300" aria-hidden="true"/>{t('trips.installments.schedule')}</h4><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{schedule.map((item) => <div key={item.installmentNumber} className="flex items-center justify-between gap-3 bg-slate-900 p-2.5 text-xs"><span className="text-slate-400">#{item.installmentNumber} · {item.dueDate}</span><strong className="tabular-nums text-white">{format(fromMinorUnits(item.expectedAmountMinor), currency, currency)}</strong></div>)}</div></div>
    {schedule.length > 0 && scheduleTotal !== cardMinor && <p className="text-xs text-rose-400" role="alert">{t('trips.installments.scheduleMismatch')}</p>}
  </section>;
}
