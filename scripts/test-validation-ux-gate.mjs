import assert from 'node:assert/strict';
import { createTripSchema } from '../src/lib/schemas.js';
import { checkTripCompleteness } from '../src/lib/tripSmartTools.js';

console.log('[test-validation-ux-gate] Running Review & Validation UX gate...');

// 1. Missing required field in normal trip (service_type: both / hotel)
const invalidForm = {
  destination: 'Paris',
  client_name: 'Test Client',
  start_date: '2026-09-01',
  end_date: '2026-09-05',
  currency: 'EUR',
  sale_price: 1000,
  wholesale_cost: 800,
  amount_paid: 500,
  payment_status: 'partial',
  payment_method: 'cash',
  service_type: 'hotel', // hotel required
  hotel_name: '', // missing hotel name!
};

const validationResult = createTripSchema().safeParse(invalidForm);
assert.equal(validationResult.success, false, 'Validation must fail when hotel name is missing for hotel service type');

const completeness = checkTripCompleteness(invalidForm);
const hotelFinding = completeness.find((f) => f.code === 'hotel');
assert.ok(hotelFinding, 'Completeness check must identify missing hotel finding');
assert.equal(hotelFinding.level, 'error', 'Missing hotel must be marked as error level');

// 2. Ticket-only trip exemption (service_type: ticket)
const ticketOnlyForm = {
  ...invalidForm,
  service_type: 'ticket',
  hotel_name: '', // hotel not required for ticket-only
};

const ticketValidation = createTripSchema().safeParse(ticketOnlyForm);
assert.equal(ticketValidation.success, true, 'Ticket-only trips MUST NOT require hotel name');

console.log('[test-validation-ux-gate] VALIDATION UX GATE PASSED.');
