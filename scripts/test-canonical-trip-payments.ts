import assert from 'node:assert/strict';
import { getCanonicalTripPayment } from '../src/lib/tripPaymentSummary';
import { getTripCardPaymentState } from '../src/lib/tripCardPayment';
import { createTripCsv, type TripExportLabels } from '../src/lib/tripExport';
import { aggregateSalesByCurrency } from '../src/lib/travelReports';
import { normalizeAnalyticsResponse } from '../src/lib/analyticsQueries';
import type { Trip, TripPaymentPlanSummary } from '../src/types/trip';

const labels: TripExportLabels = {
  destination: 'Destination', client: 'Client', clientPhone: 'Phone', start: 'Start', end: 'End',
  status: 'Status', paymentStatus: 'Payment status', currency: 'Currency', salesValue: 'Sales value',
  salePrice: 'Sales value', confirmedCash: 'Confirmed Cash', confirmedVisa: 'Confirmed Visa',
  visaInstallments: 'Visa installments', confirmedReceived: 'Confirmed received', futureVisa: 'Future Visa', totalUnpaid: 'Total unpaid',
} as TripExportLabels;

function trip(summary: Partial<TripPaymentPlanSummary>, overrides: Partial<Trip> = {}): Trip {
  return {
    id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222',
    destination: 'Test', client_name: 'Client', client_phone: null, travelers: [], travelers_count: 1,
    itinerary: [], start_date: '2026-01-01', end_date: '2026-01-02', currency: 'ILS', exchange_rate: 1,
    wholesale_cost: 4000, sale_price: 5000, profit: 1000, profit_percentage: 25, payments: [],
    payment_status: 'unpaid', amount_paid: 0, amount_due: 5000, payment_date: null, payment_method: 'cash',
    card_paid_amount: 0, cash_paid_amount: 0, payment_plan_summary: {
      plan_id: '33333333-3333-4333-8333-333333333333', source: 'native', payment_source: 'native',
      reconciliation_state: 'aligned', payment_method: 'cash', currency: 'ILS', sale_total_minor: 500000,
      cash_total_minor: 500000, cash_confirmed_minor: 0, cash_remaining_minor: 500000,
      visa_schedule_total_minor: 0, visa_confirmed_minor: 0, visa_scheduled_through_today_minor: 0,
      visa_overdue_unconfirmed_minor: 0, visa_future_scheduled_minor: 0, currently_due_unconfirmed_minor: 0,
      confirmed_total_minor: 0, total_unpaid_minor: 500000, installment_count: 0, confirmed_installments: 0,
      next_installment_due_date: null, next_installment_expected_minor: null, next_installment_confirmed_minor: null,
      final_installment_date: null, derived_payment_status: 'unpaid', card_total_minor: 0, cash_paid_minor: 0,
      processed_installments: 0, scheduled_minor_to_date: 0, remaining_scheduled_minor: 0,
      next_installment_minor: null, next_installment_date: null, authoritative_paid_minor: 0,
      authoritative_remaining_minor: 500000, authoritative_payment_status: 'unpaid', combined_remaining_minor: 500000,
      ...summary,
    },
    attachments: [], notes: '', service_type: 'both', hotel_name: null, room_type: {}, board_basis: null,
    booking_reference: null, trip_type: null, airline_name: null, flight_number: null, ticket_class: null,
    departure_airport: null, arrival_airport: null, departure_datetime: null, arrival_datetime: null,
    return_flight_number: null, return_departure_airport: null, return_arrival_airport: null,
    return_departure_datetime: null, return_arrival_datetime: null, ticket_cost_ils: null, ticket_notes: null,
    wholesale_original_amount: 4000, wholesale_currency: 'ILS', sale_original_amount: 5000, sale_currency: 'ILS',
    status: 'active', export_to_pdf: false, checklist_flight: false, checklist_hotel: false, checklist_payment: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Trip;
}

function expectTotals(value: Trip, confirmed: number, unpaid: number, status: 'paid' | 'partial' | 'unpaid') {
  const canonical = getCanonicalTripPayment(value);
  const card = getTripCardPaymentState(value, '2026-02-15');
  assert.equal(canonical.confirmedTotalMinor, confirmed);
  assert.equal(canonical.totalUnpaidMinor, unpaid);
  assert.equal(canonical.status, status);
  assert.equal(card.confirmedTotalMinor, confirmed);
  assert.equal(card.combinedRemainingMinor, unpaid);
  assert.equal(card.authoritativePaymentStatus, status);
}

// A: fully paid Cash.
const cashPaid = trip({ cash_confirmed_minor: 500000, cash_remaining_minor: 0, confirmed_total_minor: 500000,
  total_unpaid_minor: 0, derived_payment_status: 'paid', authoritative_paid_minor: 500000,
  authoritative_remaining_minor: 0, authoritative_payment_status: 'paid', combined_remaining_minor: 0 });
expectTotals(cashPaid, 500000, 0, 'paid');

// B: partially paid Cash.
const cashPartial = trip({ cash_confirmed_minor: 200000, cash_remaining_minor: 300000, confirmed_total_minor: 200000,
  total_unpaid_minor: 300000, derived_payment_status: 'partial' });
expectTotals(cashPartial, 200000, 300000, 'partial');

// C: Visa schedule automatically collects two elapsed installments without receipt writes.
const visaNone = trip({ payment_method: 'card', cash_total_minor: 0, cash_remaining_minor: 0,
  visa_schedule_total_minor: 500000, card_total_minor: 500000, visa_scheduled_through_today_minor: 200000,
  effective_visa_paid_minor: 200000, visa_confirmed_minor: 200000, effective_paid_installment_count: 2,
  confirmed_total_minor: 200000, total_unpaid_minor: 300000, derived_payment_status: 'partial',
  visa_overdue_unconfirmed_minor: 0, currently_due_unconfirmed_minor: 0,
  visa_future_scheduled_minor: 300000, installment_count: 5 }, { payment_method: 'card' });
expectTotals(visaNone, 200000, 300000, 'partial');
assert.equal(getCanonicalTripPayment(visaNone).visaScheduledThroughTodayMinor, 200000);

// D: Visa only with one elapsed date.
const visaPartial = trip({ payment_method: 'card', cash_total_minor: 0, cash_remaining_minor: 0,
  visa_schedule_total_minor: 500000, card_total_minor: 500000, effective_visa_paid_minor: 100000,
  confirmed_total_minor: 100000, total_unpaid_minor: 400000, derived_payment_status: 'partial' }, { payment_method: 'card' });
expectTotals(visaPartial, 100000, 400000, 'partial');

// E: Mixed before the first Visa date: confirmed Cash only.
const mixedCash = trip({ payment_method: 'mixed', cash_total_minor: 300000, cash_confirmed_minor: 300000,
  cash_remaining_minor: 0, visa_schedule_total_minor: 200000, card_total_minor: 200000,
  visa_scheduled_through_today_minor: 100000, visa_future_scheduled_minor: 100000,
  confirmed_total_minor: 300000, total_unpaid_minor: 200000, derived_payment_status: 'partial' }, { payment_method: 'mixed' });
expectTotals(mixedCash, 300000, 200000, 'partial');

// F: Mixed when one Visa due date has elapsed.
const mixedReceipt = trip({ ...mixedCash.payment_plan_summary!, effective_visa_paid_minor: 100000, visa_confirmed_minor: 100000,
  visa_future_scheduled_minor: 100000, confirmed_total_minor: 400000, total_unpaid_minor: 100000 }, { payment_method: 'mixed' });
expectTotals(mixedReceipt, 400000, 100000, 'partial');

// G: every client-side consumer sees the same persisted summary after serialization/reload.
const reloaded = JSON.parse(JSON.stringify(mixedReceipt)) as Trip;
expectTotals(reloaded, 400000, 100000, 'partial');
const csv = createTripCsv([reloaded], labels);
assert.match(csv, /"4000"/);
assert.match(csv, /"1000"/);
assert.deepEqual(aggregateSalesByCurrency([reloaded]).map(({ paid, outstanding }) => ({ paid, outstanding })), [{ paid: 4000, outstanding: 1000 }]);

// H: old trips without a native plan use a visible compatibility fallback.
const legacy = trip({}, { payment_plan_summary: null, amount_paid: 2000, cash_paid_amount: 2000, amount_due: 3000, payment_status: 'partial' });
const legacySummary = getCanonicalTripPayment(legacy);
assert.equal(legacySummary.source, 'legacy_fallback');
assert.equal(legacySummary.confirmedTotalMinor, 200000);
assert.equal(legacySummary.totalUnpaidMinor, 300000);

// I: native records win when legacy aggregates conflict, while the diagnostic remains visible.
const conflict = trip({ cash_confirmed_minor: 100000, cash_remaining_minor: 400000, confirmed_total_minor: 100000,
  total_unpaid_minor: 400000, reconciliation_state: 'legacy_mismatch', derived_payment_status: 'partial' },
{ amount_paid: 5000, amount_due: 0, payment_status: 'paid' });
const conflictSummary = getCanonicalTripPayment(conflict);
assert.equal(conflictSummary.confirmedTotalMinor, 100000);
assert.equal(conflictSummary.totalUnpaidMinor, 400000);
assert.equal(conflictSummary.reconciliationState, 'legacy_mismatch');

// Mixed currencies are never collapsed into the selected display currency.
const normalized = normalizeAnalyticsResponse({ current_stats: {}, previous_stats: {} }, {
  currency_mode: 'grouped_only', summary: {}, currency_totals: [
    { currency: 'ILS', trip_count: 1, sales: 5000, paid: 4000, outstanding: 1000 },
    { currency: 'USD', trip_count: 1, sales: 5000, paid: 0, outstanding: 5000 },
  ],
});
assert.equal(normalized.financial_currency_mode, 'grouped_only');
assert.equal(normalized.current_stats.total_revenue, null);
assert.equal(normalized.currency_totals.length, 2);

console.log('Canonical Travel Mode payment scenarios passed.');
