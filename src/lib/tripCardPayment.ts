import type { Trip, TripPaymentPlanSummary } from '../types/trip';
import { getCanonicalTripPayment } from './tripPaymentSummary';

export interface TripCardPaymentState {
  method: 'card' | 'cash' | 'mixed' | 'legacy';
  hasVisaSchedule: boolean;
  visaProgress: number;
  visaCollectionProgress: number;
  collectionProgress: number;
  visaInstallmentProgress: number;
  cashProgress: number;
  processedInstallments: number;
  installmentCount: number;
  partialInstallments: number;
  scheduledMinor: number;
  visaScheduleTotalMinor: number;
  remainingVisaMinor: number;
  confirmedCashMinor: number;
  effectiveVisaPaidMinor: number;
  confirmedTotalMinor: number;
  remainingCashMinor: number;
  combinedRemainingMinor: number;
  nextInstallmentMinor: number | null;
  nextInstallmentDate: string | null;
  finalInstallmentDate: string | null;
  lastConfirmedVisaAt: string | null;
  lastConfirmedVisaMinor: number | null;
  authoritativePaymentStatus: Trip['payment_status'];
  isFullyPaid: boolean;
  hasReconciliationIssue: boolean;
  statusChip: { key: string; values?: Record<string, number> } | null;
  attention: { key: string; values?: Record<string, number | string> } | null;
  messageKey: 'reconciliationRequired' | 'fullyPaid' | 'cashReceivedVisaScheduled' | 'visaCollectedBySchedule' | 'visaScheduleOnTrack' | null;
}

function differenceInDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getTripCardPaymentState(trip: Pick<Trip,
  'payment_method' | 'payment_status' | 'sale_price' | 'amount_paid' | 'amount_due' | 'start_date' | 'end_date' |
  'status' | 'service_type' | 'hotel_name' | 'payment_plan_summary' | 'cash_paid_amount' | 'card_paid_amount' | 'currency'
>, today: string): TripCardPaymentState {
  const summary: TripPaymentPlanSummary | null = trip.payment_plan_summary ?? null;
  const canonical = getCanonicalTripPayment(trip);
  const hasVisaSchedule = Boolean(summary && summary.source === 'native' && summary.card_total_minor > 0 && summary.installment_count > 0);
  const method = canonical.method;
  const processedInstallments = canonical.effectivePaidInstallmentCount;
  const installmentCount = canonical.installmentCount;
  const partialInstallments = canonical.partialInstallments;
  const remainingVisaMinor = canonical.visaFutureScheduledMinor;
  const confirmedCashMinor = canonical.cashConfirmedMinor;
  const cashTotalMinor = canonical.cashTotalMinor;
  const remainingCashMinor = canonical.cashRemainingMinor;
  const authoritativePaymentStatus = canonical.status;
  const hasReconciliationIssue = ['allocation_mismatch', 'ledger_mismatch', 'legacy_mismatch', 'schedule_mismatch'].includes(canonical.reconciliationState);
  const isFullyPaid = !hasReconciliationIssue
    && canonical.totalUnpaidMinor === 0
    && canonical.confirmedTotalMinor >= canonical.saleTotalMinor;
  const visaProgress = canonical.visaScheduleTotalMinor > 0
    ? clampPercent(canonical.visaScheduledThroughTodayMinor / canonical.visaScheduleTotalMinor * 100)
    : 0;
  const visaCollectionProgress = canonical.visaScheduleTotalMinor > 0
    ? clampPercent(canonical.effectiveVisaPaidMinor / canonical.visaScheduleTotalMinor * 100)
    : 0;
  const collectionProgress = canonical.saleTotalMinor > 0
    ? clampPercent(canonical.confirmedTotalMinor / canonical.saleTotalMinor * 100)
    : 0;
  const visaInstallmentProgress = installmentCount > 0
    ? clampPercent(processedInstallments / installmentCount * 100)
    : 0;
  const cashProgress = cashTotalMinor > 0 ? clampPercent(confirmedCashMinor / cashTotalMinor * 100) : 0;
  const remainingInstallments = Math.max(0, installmentCount - processedInstallments);
  const nextDays = canonical.nextInstallmentDueDate ? differenceInDays(today, canonical.nextInstallmentDueDate) : null;
  const continuesAfterTrip = Boolean(hasVisaSchedule && canonical.finalInstallmentDate && canonical.finalInstallmentDate > trip.end_date && remainingInstallments > 0);
  const tripStartsIn = differenceInDays(today, trip.start_date);

  let statusChip: TripCardPaymentState['statusChip'] = null;
  if (hasVisaSchedule && canonical.visaFutureScheduledMinor === 0) statusChip = { key: 'allInstallmentDatesElapsed' };
  else if (nextDays === 0) statusChip = { key: 'scheduledToday' };
  else if (nextDays === 1) statusChip = { key: 'paymentTomorrow' };
  else if (nextDays !== null && nextDays > 1 && nextDays <= 7) statusChip = { key: 'paymentInDays', values: { count: nextDays } };
  else if (hasVisaSchedule && remainingInstallments > 0) statusChip = { key: 'installmentsRemaining', values: { count: remainingInstallments } };
  else if (remainingCashMinor > 0) statusChip = { key: 'cashOutstanding' };

  const messageKey: TripCardPaymentState['messageKey'] = hasReconciliationIssue
    ? 'reconciliationRequired'
    : isFullyPaid
      ? 'fullyPaid'
      : canonical.cashConfirmedMinor > 0 && canonical.visaFutureScheduledMinor > 0
          ? 'cashReceivedVisaScheduled'
          : hasVisaSchedule
            ? (canonical.effectiveVisaPaidMinor > 0 ? 'visaCollectedBySchedule' : 'visaScheduleOnTrack')
            : null;

  let attention: TripCardPaymentState['attention'] = null;
  if (tripStartsIn >= 0 && tripStartsIn <= 7 && remainingCashMinor > 0) attention = { key: 'cashBeforeTravel' };
  else if (continuesAfterTrip) attention = { key: 'visaAfterTrip', values: { count: remainingInstallments, date: canonical.finalInstallmentDate! } };
  else if (trip.service_type !== 'ticket' && !trip.hotel_name?.trim()) attention = { key: 'missingHotel' };

  return {
    method, hasVisaSchedule, visaProgress, visaCollectionProgress, collectionProgress, visaInstallmentProgress,
    cashProgress, processedInstallments, installmentCount, partialInstallments,
    scheduledMinor: canonical.visaScheduledThroughTodayMinor,
    visaScheduleTotalMinor: canonical.visaScheduleTotalMinor,
    remainingVisaMinor, confirmedCashMinor, remainingCashMinor,
    effectiveVisaPaidMinor: canonical.effectiveVisaPaidMinor,
    confirmedTotalMinor: canonical.confirmedTotalMinor,
    combinedRemainingMinor: canonical.totalUnpaidMinor,
    nextInstallmentMinor: canonical.nextInstallmentExpectedMinor === null
      ? null
      : Math.max(0, canonical.nextInstallmentExpectedMinor - (canonical.nextInstallmentConfirmedMinor ?? 0)),
    nextInstallmentDate: canonical.nextInstallmentDueDate,
    finalInstallmentDate: canonical.finalInstallmentDate,
    lastConfirmedVisaAt: canonical.lastConfirmedVisaAt,
    lastConfirmedVisaMinor: canonical.lastConfirmedVisaMinor,
    authoritativePaymentStatus,
    isFullyPaid,
    hasReconciliationIssue,
    statusChip, attention, messageKey,
  };
}
