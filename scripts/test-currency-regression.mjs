import assert from 'node:assert/strict';
import { formatCurrency } from '../src/utils/localeFormatting.js';
import { toTripInsert, toTripUpdate } from '../src/lib/tripPayload.js';
import { calculateTripFinancials } from '../src/lib/tripFinancials.js';

console.log('[test-currency-regression] Running currency regression gate...');

// 1. Create a new ILS trip with sale price 1 ILS
const newIlsTrip = {
  destination: 'Eilat',
  client_name: 'David ILS',
  client_phone: '0509999999',
  travelers: [],
  travelers_count: 1,
  start_date: '2026-08-10',
  end_date: '2026-08-12',
  currency: 'ILS',
  exchange_rate: 1,
  sale_price: 1,
  wholesale_cost: 0.8,
  amount_paid: 1,
  payment_method: 'cash',
  status: 'active',
};

const ilsInsert = toTripInsert(newIlsTrip, 'user-ils');
assert.equal(ilsInsert.currency, 'ILS', 'Currency must remain ILS');
assert.equal(ilsInsert.sale_price, 1, 'Sale price must remain exactly 1 ILS without USD multiplier');

const ilsFinancials = calculateTripFinancials(newIlsTrip);
assert.equal(ilsFinancials.salePrice, 1, 'Financial sale price must be 1');
assert.equal(ilsFinancials.amountDue, 0, 'Amount due must be 0');

// 2. Format verification
const formattedIls = formatCurrency(1, 'ILS', 'he');
assert.ok(formattedIls.includes('1'), 'Formatted ILS string must contain 1');
assert.ok(!formattedIls.includes('3.05') && !formattedIls.includes('3.7'), 'ILS amount must not be converted or multiplied by exchange rate');

// 3. Re-save & Edit ILS trip verification
const ilsEdit = toTripUpdate({ ...newIlsTrip, sale_price: 1, client_name: 'David ILS Updated' });
assert.equal(ilsEdit.currency, 'ILS');
assert.equal(ilsEdit.sale_price, 1, 'Sale price must remain 1 after editing');

// 4. Real USD trip verification
const usdTrip = {
  ...newIlsTrip,
  currency: 'USD',
  sale_price: 100,
  wholesale_cost: 80,
  amount_paid: 50,
};
const usdInsert = toTripInsert(usdTrip, 'user-usd');
assert.equal(usdInsert.currency, 'USD');
assert.equal(usdInsert.sale_price, 100, 'USD sale price must remain 100');

console.log('[test-currency-regression] CURRENCY REGRESSION GATE PASSED.');
