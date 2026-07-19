import type { Trip, TripPaymentPlanSummary } from '../types/trip';

export interface TripCardPaymentState {
  method: 'card' | 'cash' | 'mixed' | 'legacy';
  hasVisaSchedule: boolean;
  visaProgress: number;
  cashProgress: number;
  processedInstallments: number;
  installmentCount: number;
  scheduledMinor: number;
  remainingVisaMinor: number;
  confirmedCashMinor: number;
  remainingCashMinor: number;
  combinedRemainingMinor: number;
  nextInstallmentMinor: number | null;
  nextInstallmentDate: string | null;
  finalInstallmentDate: string | null;
  statusChip: { key: string; values?: Record<string, number> } | null;
  attention: { key: string; values?: Record<string, number | string> } | null;
}

function differenceInDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getTripCardPaymentState(trip: Pick<Trip,
  'payment_method' | 'payment_status' | 'sale_price' | 'amount_paid' | 'amount_due' | 'start_date' | 'end_date' |
  'status' | 'service_type' | 'hotel_name' | 'flight_number' | 'has_itinerary' | 'payment_plan_summary'
>, today: string): TripCardPaymentState {
  const summary: TripPaymentPlanSummary | null = trip.payment_plan_summary ?? null;
  const hasVisaSchedule = Boolean(summary && summary.source === 'native' && summary.card_total_minor > 0 && summary.installment_count > 0);
  const method = summary?.payment_method ?? trip.payment_method ?? 'legacy';
  const processedInstallments = hasVisaSchedule ? Math.min(summary!.processed_installments, summary!.installment_count) : 0;
  const installmentCount = hasVisaSchedule ? summary!.installment_count : 0;
  const remainingVisaMinor = hasVisaSchedule ? Math.max(0, summary!.remaining_scheduled_minor) : 0;
  const confirmedCashMinor = summary?.cash_paid_minor ?? Math.round((trip.payment_method === 'cash' || trip.payment_method === 'mixed' ? trip.amount_paid : 0) * 100);
  const cashTotalMinor = summary?.cash_total_minor ?? Math.round((trip.payment_method === 'cash' || trip.payment_method === 'mixed' ? trip.sale_price : 0) * 100);
  const remainingCashMinor = Math.max(0, cashTotalMinor - confirmedCashMinor);
  const visaProgress = hasVisaSchedule ? clampPercent(processedInstallments / installmentCount * 100) : 0;
  const cashProgress = cashTotalMinor > 0 ? clampPercent(confirmedCashMinor / cashTotalMinor * 100) : 0;
  const remainingInstallments = Math.max(0, installmentCount - processedInstallments);
  const nextDays = summary?.next_installment_date ? differenceInDays(today, summary.next_installment_date) : null;
  const continuesAfterTrip = Boolean(hasVisaSchedule && summary?.final_installment_date && summary.final_installment_date > trip.end_date && remainingInstallments > 0);
  const tripStartsIn = differenceInDays(today, trip.start_date);

  let statusChip: TripCardPaymentState['statusChip'] = null;
  if (hasVisaSchedule && remainingInstallments === 0) statusChip = { key: 'visaComplete' };
  else if (nextDays === 0) statusChip = { key: 'scheduledToday' };
  else if (nextDays === 1) statusChip = { key: 'paymentTomorrow' };
  else if (nextDays !== null && nextDays > 1 && nextDays <= 7) statusChip = { key: 'paymentInDays', values: { count: nextDays } };
  else if (hasVisaSchedule && remainingInstallments > 0) statusChip = { key: 'installmentsRemaining', values: { count: remainingInstallments } };
  else if (remainingCashMinor > 0) statusChip = { key: 'cashOutstanding' };

  let attention: TripCardPaymentState['attention'] = null;
  if (tripStartsIn >= 0 && tripStartsIn <= 7 && remainingCashMinor > 0) attention = { key: 'cashBeforeTravel' };
  else if (continuesAfterTrip) attention = { key: 'visaAfterTrip', values: { count: remainingInstallments, date: summary!.final_installment_date! } };
  else if (trip.service_type !== 'ticket' && !trip.hotel_name?.trim()) attention = { key: 'missingHotel' };
  else if (trip.service_type !== 'hotel' && !trip.flight_number?.trim()) attention = { key: 'missingFlight' };
  else if (trip.has_itinerary === false) attention = { key: 'missingItinerary' };

  return {
    method, hasVisaSchedule, visaProgress, cashProgress, processedInstallments, installmentCount,
    scheduledMinor: summary?.scheduled_minor_to_date ?? 0,
    remainingVisaMinor, confirmedCashMinor, remainingCashMinor,
    combinedRemainingMinor: hasVisaSchedule || summary ? remainingVisaMinor + remainingCashMinor : Math.round(Math.max(0, trip.amount_due) * 100),
    nextInstallmentMinor: summary?.next_installment_minor ?? null,
    nextInstallmentDate: summary?.next_installment_date ?? null,
    finalInstallmentDate: summary?.final_installment_date ?? null,
    statusChip, attention,
  };
}
