import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTripCardPaymentState } from '../src/lib/tripCardPayment';
import { mapVisaPaymentArrival } from '../src/lib/visaPaymentArrivals';
import type { Trip, TripPaymentPlanSummary } from '../src/types/trip';

const summary = (overrides: Partial<TripPaymentPlanSummary>): TripPaymentPlanSummary => ({
  plan_id: '11111111-1111-4111-8111-111111111111', source: 'native', payment_source: 'native', reconciliation_state: 'aligned',
  payment_method: 'card', currency: 'ILS', sale_total_minor: 500000, card_total_minor: 500000, cash_total_minor: 0,
  cash_paid_minor: 0, cash_confirmed_minor: 0, cash_remaining_minor: 0, visa_schedule_total_minor: 500000,
  effective_visa_paid_minor: 200000, visa_confirmed_minor: 200000, visa_scheduled_through_today_minor: 200000, visa_overdue_unconfirmed_minor: 0,
  visa_future_scheduled_minor: 300000, confirmed_total_minor: 200000, total_unpaid_minor: 300000,
  currently_due_unconfirmed_minor: 0, installment_count: 5, effective_paid_installment_count: 2, confirmed_installments: 2, partial_installments: 0,
  processed_installments: 2, scheduled_minor_to_date: 200000, remaining_scheduled_minor: 300000,
  next_installment_due_date: '2026-02-01', next_installment_expected_minor: 100000, next_installment_confirmed_minor: 0,
  next_installment_minor: 100000, next_installment_date: '2026-02-01', final_installment_date: '2026-05-01',
  derived_payment_status: 'partial', authoritative_payment_status: 'partial', authoritative_paid_minor: 200000,
  authoritative_remaining_minor: 300000, combined_remaining_minor: 300000,
  ...overrides,
});

const trip = (payment: TripPaymentPlanSummary, overrides: Partial<Trip> = {}): Trip => ({
  id: '22222222-2222-4222-8222-222222222222', user_id: '33333333-3333-4333-8333-333333333333',
  destination: 'Rome', client_name: 'Test', travelers: [], travelers_count: 1, itinerary: [],
  start_date: '2026-03-01', end_date: '2026-03-03', currency: 'ILS', exchange_rate: 1,
  wholesale_cost: 4000, sale_price: 5000, profit: 1000, profit_percentage: 20, payments: [],
  payment_status: 'unpaid', amount_paid: 0, amount_due: 5000, payment_method: payment.payment_method,
  payment_plan_summary: payment, service_type: 'ticket', status: 'active', has_itinerary: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
} as Trip);

const cash = getTripCardPaymentState(trip(summary({ payment_method: 'cash', card_total_minor: 0, visa_schedule_total_minor: 0,
  cash_total_minor: 500000, cash_paid_minor: 500000, cash_confirmed_minor: 500000, confirmed_total_minor: 500000,
  total_unpaid_minor: 0, combined_remaining_minor: 0, installment_count: 0, visa_scheduled_through_today_minor: 0,
  visa_overdue_unconfirmed_minor: 0, visa_future_scheduled_minor: 0, derived_payment_status: 'paid', authoritative_payment_status: 'paid' }),
  { payment_method: 'cash', payment_status: 'paid', amount_paid: 5000, amount_due: 0 }), '2026-02-15');
assert.equal(cash.isFullyPaid, true);
assert.equal(cash.collectionProgress, 100);
assert.equal(cash.messageKey, 'fullyPaid');

const visaNone = getTripCardPaymentState(trip(summary({})), '2026-02-15');
assert.equal(visaNone.effectiveVisaPaidMinor, 200000);
assert.equal(visaNone.processedInstallments, 2, 'elapsed due dates are automatically collected');
assert.equal(visaNone.visaInstallmentProgress, 40);
assert.equal(visaNone.messageKey, 'visaCollectedBySchedule');

const visaPartial = getTripCardPaymentState(trip(summary({ confirmed_installments: 2, processed_installments: 2,
  effective_paid_installment_count: 2, partial_installments: 0, effective_visa_paid_minor: 200000, visa_confirmed_minor: 200000, confirmed_total_minor: 200000, total_unpaid_minor: 300000,
  combined_remaining_minor: 250000, derived_payment_status: 'partial', authoritative_payment_status: 'partial' })), '2026-02-15');
assert.equal(visaPartial.processedInstallments, 2);
assert.equal(visaPartial.partialInstallments, 0);
assert.equal(visaPartial.visaInstallmentProgress, 40);
assert.equal(visaPartial.effectiveVisaPaidMinor, 200000, 'amount progress follows elapsed schedule dates');

const mixed = getTripCardPaymentState(trip(summary({ payment_method: 'mixed', card_total_minor: 200000,
  cash_total_minor: 300000, cash_paid_minor: 300000, cash_confirmed_minor: 300000, visa_schedule_total_minor: 200000,
  effective_visa_paid_minor: 100000, visa_confirmed_minor: 100000, confirmed_total_minor: 400000, total_unpaid_minor: 100000,
  combined_remaining_minor: 100000, effective_paid_installment_count: 1, confirmed_installments: 1, processed_installments: 1,
  visa_scheduled_through_today_minor: 100000, visa_overdue_unconfirmed_minor: 0, visa_future_scheduled_minor: 100000 }),
  { payment_method: 'mixed', amount_paid: 4000, amount_due: 1000 }), '2026-02-15');
assert.equal(mixed.confirmedCashMinor, 300000);
assert.equal(mixed.effectiveVisaPaidMinor, 100000);
assert.equal(mixed.collectionProgress, 80);
assert.equal(mixed.messageKey, 'cashReceivedVisaScheduled');

const mismatch = getTripCardPaymentState(trip(summary({ reconciliation_state: 'ledger_mismatch' })), '2026-02-15');
assert.equal(mismatch.hasReconciliationIssue, true);
assert.equal(mismatch.messageKey, 'reconciliationRequired');

const arrival = mapVisaPaymentArrival({ id: 'event', trip_id: 'trip', created_at: '2026-07-29T12:00:00Z', params: {
  destination: 'Rome', currency: 'ILS', amountMinor: 100000, previousVisaConfirmedMinor: 0, visaConfirmedMinor: 100000,
  previousConfirmedTotalMinor: 300000, confirmedTotalMinor: 400000, previousUnpaidMinor: 200000, totalUnpaidMinor: 100000,
  previousConfirmedInstallments: 0, confirmedInstallments: 1, partialInstallments: 0, installmentCount: 5,
} });
assert.equal(arrival?.confirmedInstallments, 1);
assert.equal(arrival?.amountMinor, 100000);

const cardSource = readFileSync('src/components/trips/TripCard.tsx', 'utf8');
const tripsSource = readFileSync('src/components/trips/Trips.tsx', 'utf8');
const animationSource = readFileSync('src/hooks/useAnimatedInteger.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260813120000_automatic_visa_schedule_collection.sql', 'utf8');
for (const contract of ['h-full min-w-0', 'items-stretch', '2xl:grid-cols-3', 'mt-auto', 'min-h-11']) {
  assert.ok(cardSource.includes(contract) || tripsSource.includes(contract), `card layout must retain ${contract}`);
}
for (const contract of ['IntersectionObserver', 'intersectionRatio >= 0.5', "document.visibilityState !== 'visible'", '2500', 'onVisaArrivalSeen']) assert.ok(cardSource.includes(contract));
for (const contract of ['prefers-reduced-motion: reduce', 'requestAnimationFrame', 'duration = 650']) assert.ok(animationSource.includes(contract));
for (const contract of [
  "i.due_date <= b.today", "AT TIME ZONE 'Asia/Jerusalem'", 'effective_visa_paid_minor',
  "'visa-schedule:' || i.trip_id || ':' || i.id || ':' || i.due_date",
  'ON CONFLICT (user_id, dedupe_key) DO NOTHING', "SELECT 4",
]) assert.ok(migration.includes(contract), `migration must retain ${contract}`);
assert.ok(migration.includes("(i.due_date::timestamp AT TIME ZONE 'Asia/Jerusalem') > rollout_at"), 'historical installments must be suppressed by rollout baseline');

console.log('Trip card payment clarity, layout, and Visa arrival contracts passed.');
