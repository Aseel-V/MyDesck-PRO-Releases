import { supabase } from './supabase';
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
  const { data: plan, error } = await supabase.from('trip_payment_plans').select('*').eq('trip_id', tripId).is('deleted_at', null).neq('status', 'cancelled').maybeSingle();
  if (error) throw error;
  if (!plan) return { plan: null, installments: [] };
  const { data: installments, error: installmentError } = await supabase.from('trip_installments').select('*').eq('payment_plan_id', plan.id).order('installment_number');
  if (installmentError) throw installmentError;
  return { plan, installments: installments || [] };
}

export async function createTripPaymentPlan(input: {
  tripId: string; method: 'card' | 'cash' | 'mixed'; currency: string;
  cardTotalMinor: number; cashTotalMinor: number; installmentCount: number; firstDate: string; notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_trip_payment_plan', {
    p_trip_id: input.tripId, p_payment_method: input.method, p_currency: input.currency,
    p_card_total_minor: input.cardTotalMinor, p_cash_total_minor: input.cashTotalMinor,
    p_installment_count: input.installmentCount, p_first_installment_date: input.firstDate,
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return data;
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
  const { error } = await supabase.rpc('record_trip_installment_payment', {
    p_installment_id: id, p_paid_amount_minor: paidAmountMinor, p_paid_at: paidAt, p_notes: notes || null,
  });
  if (error) throw error;
}

export async function rescheduleInstallment(id: string, dueDate: string): Promise<void> {
  const { error } = await supabase.rpc('reschedule_trip_installment', { p_installment_id: id, p_due_date: dueDate });
  if (error) throw error;
}

export async function recordCashPayment(id: string, paidAmountMinor: number, paidAt: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('record_trip_cash_payment', { p_payment_plan_id: id, p_paid_amount_minor: paidAmountMinor, p_paid_at: paidAt, p_notes: notes || null });
  if (error) throw error;
}

export async function recalculateFutureInstallments(id: string, cardTotalMinor: number): Promise<void> {
  const { error } = await supabase.rpc('recalculate_future_trip_installments', { p_payment_plan_id: id, p_new_card_total_minor: cardTotalMinor });
  if (error) throw error;
}

export async function fetchInstallmentEvents(id: string): Promise<TripInstallmentEvent[]> {
  const { data, error } = await supabase.from('trip_installment_events').select('*').eq('installment_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
