import assert from 'node:assert/strict';
import { calculateTripFinancials } from '../src/lib/tripFinancials.js';
import { buildInstallmentSchedule } from '../src/lib/tripInstallments.js';
import { toTripInsert, toTripUpdate, toTripPaymentPlanInput } from '../src/lib/tripPayload.js';

console.log('[test-trip-smoke-suite] Running Create & Edit Trip smoke test suite...');

// 1. Create & Edit Cash Trip
const cashForm = {
  destination: 'Rome',
  client_name: 'Bob Cash',
  client_phone: '0520000000',
  travelers: [],
  travelers_count: 2,
  start_date: '2026-09-10',
  end_date: '2026-09-15',
  currency: 'EUR',
  sale_price: 1200,
  wholesale_cost: 900,
  amount_paid: 1200,
  payment_method: 'cash',
  status: 'active',
};

const cashInsert = toTripInsert(cashForm, 'user-1');
assert.equal(cashInsert.destination, 'Rome');
assert.equal(cashInsert.sale_price, 1200);
const cashFinancials = calculateTripFinancials(cashForm);
assert.equal(cashFinancials.profit, 300);
assert.equal(cashFinancials.amountDue, 0);
console.log('✓ Cash trip create & financial calculation verified');

// 2. Create & Edit Visa Trip
const visaForm = {
  destination: 'Tokyo',
  client_name: 'Carol Visa',
  client_phone: '0530000000',
  travelers: [],
  travelers_count: 1,
  start_date: '2026-10-01',
  end_date: '2026-10-10',
  currency: 'USD',
  sale_price: 3000,
  wholesale_cost: 2400,
  amount_paid: 1000,
  payment_method: 'card',
  status: 'active',
  payment_plan: {
    plan_id: null,
    card_total: 3000,
    cash_total: 0,
    installment_count: 3,
    first_installment_date: '2026-10-01',
  },
};

const visaPlan = toTripPaymentPlanInput(visaForm);
assert.equal(visaPlan.cardTotalMinor, 300000);
const visaSchedule = buildInstallmentSchedule(300000, 3, '2026-10-01');
assert.equal(visaSchedule.length, 3);
assert.equal(visaSchedule.reduce((s, i) => s + i.expectedAmountMinor, 0), 300000);
console.log('✓ Visa trip create & installment schedule verified');

// 3. Create & Edit Mixed Trip
const mixedForm = {
  destination: 'Madrid',
  client_name: 'Dave Mixed',
  client_phone: '0540000000',
  travelers: [],
  travelers_count: 2,
  start_date: '2026-11-01',
  end_date: '2026-11-07',
  currency: 'EUR',
  sale_price: 2000,
  wholesale_cost: 1500,
  amount_paid: 500,
  cash_paid_amount: 500,
  payment_method: 'mixed',
  status: 'active',
  payment_plan: {
    plan_id: null,
    card_total: 1500,
    cash_total: 500,
    installment_count: 5,
    first_installment_date: '2026-11-01',
  },
};

const mixedPlan = toTripPaymentPlanInput(mixedForm);
assert.equal(mixedPlan.cardTotalMinor, 150000);
assert.equal(mixedPlan.cashTotalMinor, 50000);
assert.equal(mixedPlan.confirmedCashMinor, 50000);
assert.throws(
  () => toTripPaymentPlanInput({ ...mixedForm, payment_plan: { ...mixedForm.payment_plan, cash_total: 499 } }),
  /PAYMENT_PLAN_SPLIT_MISMATCH/,
);
console.log('✓ Mixed trip create & split payment plan verified');

// 4. Edit Cash to Mixed
const editedForm = {
  ...cashForm,
  destination: 'Rome & Florence',
  sale_price: 1500,
  amount_paid: 500,
  payment_method: 'mixed',
  payment_plan: {
    plan_id: 'plan-123',
    card_total: 1000,
    cash_total: 500,
    installment_count: 2,
    first_installment_date: '2026-09-10',
  },
};

const editedUpdate = toTripUpdate(editedForm);
assert.equal(editedUpdate.destination, 'Rome & Florence');
assert.equal(editedUpdate.sale_price, 1500);
console.log('✓ Edit trip persistence verified');

console.log('[test-trip-smoke-suite] ALL SMOKE TESTS PASSED.');
