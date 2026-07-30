import type { Trip } from '../types/trip';

export type CanonicalPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface CanonicalTripPayment {
  source: 'native' | 'legacy_fallback';
  reconciliationState: string;
  method: 'card' | 'cash' | 'mixed' | 'legacy';
  currency: string;
  saleTotalMinor: number;
  cashTotalMinor: number;
  cashConfirmedMinor: number;
  cashRemainingMinor: number;
  visaScheduleTotalMinor: number;
  visaConfirmedMinor: number;
  visaScheduledThroughTodayMinor: number;
  visaOverdueUnconfirmedMinor: number;
  visaFutureScheduledMinor: number;
  confirmedTotalMinor: number;
  totalUnpaidMinor: number;
  currentlyDueUnconfirmedMinor: number;
  installmentCount: number;
  confirmedInstallments: number;
  partialInstallments: number;
  nextInstallmentDueDate: string | null;
  nextInstallmentExpectedMinor: number | null;
  nextInstallmentConfirmedMinor: number | null;
  lastConfirmedVisaAt: string | null;
  lastConfirmedVisaMinor: number | null;
  finalInstallmentDate: string | null;
  status: CanonicalPaymentStatus;
}

const finiteMinor = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
};

export function getCanonicalTripPayment(trip: Pick<Trip,
  'sale_price' | 'amount_paid' | 'amount_due' | 'payment_status' | 'payment_method' |
  'cash_paid_amount' | 'card_paid_amount' | 'currency' | 'payment_plan_summary'
>): CanonicalTripPayment {
  const summary = trip.payment_plan_summary;
  const saleTotalMinor = finiteMinor(summary?.sale_total_minor ?? Number(trip.sale_price || 0) * 100);
  const source = summary?.payment_source === 'native' || summary?.source === 'native' ? 'native' : 'legacy_fallback';
  const cashTotalMinor = finiteMinor(summary?.cash_total_minor ?? (
    trip.payment_method === 'card'
      ? 0
      : trip.payment_method === 'mixed'
        ? Math.max(0, Number(trip.sale_price || 0) - Number(trip.card_paid_amount || 0)) * 100
        : Number(trip.sale_price || 0) * 100
  ));
  const visaScheduleTotalMinor = finiteMinor(summary?.visa_schedule_total_minor ?? summary?.card_total_minor ?? (
    trip.payment_method === 'card'
      ? Number(trip.sale_price || 0) * 100
      : trip.payment_method === 'mixed'
        ? Number(trip.card_paid_amount || 0) * 100
        : 0
  ));
  const cashConfirmedMinor = finiteMinor(summary?.cash_confirmed_minor ?? summary?.cash_paid_minor ?? (
    trip.payment_method === 'cash' || trip.payment_method === 'mixed'
      ? Number(trip.cash_paid_amount ?? trip.amount_paid ?? 0) * 100
      : 0
  ));
  const visaConfirmedMinor = finiteMinor(summary?.visa_confirmed_minor ?? (
    source === 'legacy_fallback' && (trip.payment_method === 'card' || trip.payment_method === 'mixed')
      ? (trip.payment_method === 'card'
          ? Number(trip.amount_paid || 0)
          : Math.max(0, Number(trip.amount_paid || 0) - Number(trip.cash_paid_amount || 0))) * 100
      : 0
  ));
  const confirmedTotalMinor = Math.min(
    saleTotalMinor,
    finiteMinor(summary?.confirmed_total_minor ?? summary?.authoritative_paid_minor ?? cashConfirmedMinor + visaConfirmedMinor),
  );
  const totalUnpaidMinor = finiteMinor(
    summary?.total_unpaid_minor ?? summary?.authoritative_remaining_minor ?? saleTotalMinor - confirmedTotalMinor,
  );
  const status: CanonicalPaymentStatus = summary?.derived_payment_status
    ?? summary?.authoritative_payment_status
    ?? (confirmedTotalMinor <= 0 ? 'unpaid' : totalUnpaidMinor <= 0 ? 'paid' : 'partial');

  return {
    source,
    reconciliationState: summary?.reconciliation_state ?? (source === 'native' ? 'aligned' : 'legacy_fallback'),
    method: summary?.payment_method ?? trip.payment_method ?? 'legacy',
    currency: summary?.currency ?? trip.currency,
    saleTotalMinor,
    cashTotalMinor,
    cashConfirmedMinor: Math.min(cashTotalMinor, cashConfirmedMinor),
    cashRemainingMinor: finiteMinor(summary?.cash_remaining_minor ?? cashTotalMinor - cashConfirmedMinor),
    visaScheduleTotalMinor,
    visaConfirmedMinor: Math.min(visaScheduleTotalMinor, visaConfirmedMinor),
    visaScheduledThroughTodayMinor: finiteMinor(summary?.visa_scheduled_through_today_minor ?? summary?.scheduled_minor_to_date),
    visaOverdueUnconfirmedMinor: finiteMinor(summary?.visa_overdue_unconfirmed_minor),
    visaFutureScheduledMinor: finiteMinor(summary?.visa_future_scheduled_minor ?? summary?.remaining_scheduled_minor),
    confirmedTotalMinor,
    totalUnpaidMinor,
    currentlyDueUnconfirmedMinor: finiteMinor(summary?.currently_due_unconfirmed_minor),
    installmentCount: finiteMinor(summary?.installment_count),
    confirmedInstallments: finiteMinor(summary?.confirmed_installments ?? summary?.processed_installments),
    partialInstallments: finiteMinor(summary?.partial_installments),
    nextInstallmentDueDate: summary?.next_installment_due_date ?? summary?.next_installment_date ?? null,
    nextInstallmentExpectedMinor: summary?.next_installment_expected_minor ?? summary?.next_installment_minor ?? null,
    nextInstallmentConfirmedMinor: summary?.next_installment_confirmed_minor ?? null,
    lastConfirmedVisaAt: summary?.last_confirmed_visa_at ?? null,
    lastConfirmedVisaMinor: summary?.last_confirmed_visa_minor ?? null,
    finalInstallmentDate: summary?.final_installment_date ?? null,
    status,
  };
}

export const fromPaymentMinor = (value: number): number => value / 100;
