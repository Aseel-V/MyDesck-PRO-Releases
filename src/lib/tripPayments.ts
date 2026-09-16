import { getBackend } from '../data/backend';
import type { Database } from '../types/database';

export type TripPaymentPlan = Database['public']['Tables']['trip_payment_plans']['Row'];
export type TripInstallment = Database['public']['Tables']['trip_installments']['Row'];
export type TripInstallmentEvent = Database['public']['Tables']['trip_installment_events']['Row'];

export interface TripPaymentPlanInput {
  existingPlanId: string | null;
  method: 'card' | 'cash' | 'mixed';
  currency: string;
  cardTotalMinor: number;
  cashTotalMinor: number;
  installmentCount: number;
  firstDate: string;
  confirmedCashMinor: number;
  paymentDate: string;
}

export async function fetchTripPaymentPlan(tripId: string): Promise<{ plan: TripPaymentPlan | null; installments: TripInstallment[] }> {
  return getBackend().travel.getTripPaymentPlan(tripId);
}

export async function createTripPaymentPlan(input: {
  tripId: string; method: 'card' | 'cash' | 'mixed'; currency: string;
  cardTotalMinor: number; cashTotalMinor: number; installmentCount: number; firstDate: string; notes?: string;
}): Promise<string> {
  return getBackend().travel.createTripPaymentPlan(input);
}

export async function syncTripPaymentPlan(tripId: string, input: TripPaymentPlanInput): Promise<string> {
  const current = await fetchTripPaymentPlan(tripId);
  const plan = current.plan;
  const unchanged = Boolean(plan
    && plan.id === input.existingPlanId
    && plan.payment_method === input.method
    && plan.currency === input.currency
    && plan.card_total_minor === input.cardTotalMinor
    && plan.cash_total_minor === input.cashTotalMinor
    && plan.installment_count === input.installmentCount
    && (plan.first_installment_date || '') === (input.cardTotalMinor > 0 ? input.firstDate : ''));
  const planId = unchanged ? plan!.id : await createTripPaymentPlan({
    tripId,
    method: input.method,
    currency: input.currency,
    cardTotalMinor: input.cardTotalMinor,
    cashTotalMinor: input.cashTotalMinor,
    installmentCount: input.installmentCount,
    firstDate: input.firstDate,
  });
  const currentCashPaid = unchanged ? plan!.cash_paid_minor : 0;
  if (input.cashTotalMinor > 0 && currentCashPaid !== input.confirmedCashMinor) {
    await recordCashPayment(planId, input.confirmedCashMinor, `${input.paymentDate}T12:00:00Z`);
  }
  return planId;
}

export async function recordInstallmentPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
  await getBackend().travel.recordInstallmentPayment(id, paidAmountMinor, paidAt, notes);
}

export async function rescheduleInstallment(id: string, dueDate: string): Promise<void> {
  await getBackend().travel.rescheduleInstallment(id, dueDate);
}

export async function recordCashPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
  await getBackend().travel.recordCashPayment(id, paidAmountMinor, paidAt, notes);
}

export async function recalculateFutureInstallments(id: string, cardTotalMinor: number): Promise<void> {
  await getBackend().travel.recalculateFutureInstallments(id, cardTotalMinor);
}

export async function fetchInstallmentEvents(id: string): Promise<TripInstallmentEvent[]> {
  return getBackend().travel.listInstallmentEvents(id);
}
