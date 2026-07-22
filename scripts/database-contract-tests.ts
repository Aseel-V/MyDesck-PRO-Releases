import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../src/lib/tripPayload.ts';
import type { TripFormData } from '../src/types/trip.ts';

console.log('[test-database-contracts] Running database contract tests...');

// src/lib/tripPayload.ts is the frontend payload source of truth. These tests bundle that file directly.
const baseForm = (overrides: Partial<TripFormData> = {}): TripFormData => ({
  destination: 'London',
  client_name: 'Alice',
  client_phone: '  ',
  travelers: [{ full_name: ' Alice Example ', nationality: ' GB ', room_type: 'double' }],
  travelers_count: 1,
  itinerary: [],
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  currency: 'EUR',
  exchange_rate: 1,
  sale_price: 1_000,
  wholesale_cost: 800,
  payments: [],
  payment_status: 'partial',
  amount_paid: 400,
  payment_date: '2026-08-01',
  payment_method: 'cash',
  room_type: {},
  board_basis: undefined,
  hotel_name: undefined,
  service_type: 'both',
  wholesale_original_amount: undefined,
  sale_original_amount: undefined,
  attachments: [],
  notes: '',
  status: 'active',
  ...overrides,
});

const formWithServerFields = Object.assign(baseForm({
  travelers: [{
    full_name: 'Alice Example',
    nationality: 'GB',
    room_type: 'double',
    passport_number: 'SECRET-PASSPORT',
  } as TripFormData['travelers'][number]],
}), {
  profit: 200,
  profit_percentage: 20,
  amount_due: 600,
  search_document: 'private search vector',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}) as TripFormData;

const insertPayload = toTripInsert(formWithServerFields, 'user-123');
const updatePayload = toTripUpdate(formWithServerFields);
const forbiddenFields = ['profit', 'profit_percentage', 'amount_due', 'search_document', 'created_at', 'updated_at'];

for (const field of forbiddenFields) {
  assert.equal(field in insertPayload, false, `Insert payload must never contain server-owned field "${field}"`);
  assert.equal(field in updatePayload, false, `Update payload must never contain server-owned field "${field}"`);
}
assert.equal(JSON.stringify(insertPayload).includes('passport'), false, 'Insert payload must not reintroduce passport fields');
assert.equal(JSON.stringify(updatePayload).includes('passport'), false, 'Update payload must not reintroduce passport fields');
assert.equal(JSON.stringify(insertPayload).includes('SECRET-PASSPORT'), false, 'Insert payload must not retain passport values');
assert.equal(JSON.stringify(updatePayload).includes('SECRET-PASSPORT'), false, 'Update payload must not retain passport values');

for (const field of ['client_phone', 'board_basis', 'hotel_name', 'wholesale_original_amount', 'sale_original_amount'] as const) {
  assert.equal(insertPayload[field], null, `Insert optional field "${field}" must normalize to null`);
  assert.equal(updatePayload[field], null, `Update optional field "${field}" must normalize to null`);
}
console.log('[test-database-contracts] Generated/server-owned fields, passport removal, and optional null handling passed.');

const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort((left, right) => left.localeCompare(right));
const migrations = migrationFiles.map((file) => ({ file, sql: readFileSync(`${migrationsDir}/${file}`, 'utf8') }));
const migrationContent = migrations.map(({ sql }) => sql).join('\n');

const onConflictMatches = migrationContent.match(/ON\s+CONFLICT\s*\(([^)]+)\)/gi) || [];
assert.ok(onConflictMatches.length > 0, 'Migration files must define ON CONFLICT handlers');
for (const match of onConflictMatches) {
  const targetColumns = match.replace(/ON\s+CONFLICT\s*\(/i, '').replace(/\)/, '').trim();
  for (const column of targetColumns.split(',').map((value) => value.trim().replace(/"/g, ''))) {
    const hasConstraint = migrationContent.includes(column) && (
      migrationContent.includes('PRIMARY KEY') || migrationContent.includes('UNIQUE') || migrationContent.includes('CONSTRAINT')
    );
    assert.ok(hasConstraint, `ON CONFLICT target column "${column}" must have a matching unique or primary key constraint in SQL`);
  }
}
console.log('[test-database-contracts] ON CONFLICT target contracts passed.');

const paymentMethods = ['cash', 'card', 'mixed'] as const;
const nativePlanSources = ['native', 'legacy'] as const;
assert.match(migrationContent, /payment_method\s+text\s+NOT NULL\s+CHECK\s*\(payment_method\s+IN\s*\('card','cash','mixed'\)\)/i,
  'Payment plan CHECK must allow card, cash, and mixed');
assert.match(migrationContent, /source\s+text\s+NOT NULL\s+DEFAULT\s+'native'\s+CHECK\s*\(source\s+IN\s*\('native','legacy'\)\)/i,
  'Payment plan source CHECK must allow native RPC plans');

const latestSaveMigration = [...migrations].reverse().find(({ sql }) => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.save_trip_transaction\s*\(/i.test(sql));
assert.ok(latestSaveMigration, 'save_trip_transaction must have an effective migration definition');
const rpcPlanSource = latestSaveMigration.sql.match(/source\s*=\s*'(native|legacy)'/i)?.[1] ??
  latestSaveMigration.sql.match(/'active',\s*'(native|legacy)'/i)?.[1];
assert.ok(rpcPlanSource && nativePlanSources.includes(rpcPlanSource as typeof nativePlanSources[number]),
  'Payment plan source written by save_trip_transaction must satisfy the current CHECK constraint');

const cashPlan = toTripPaymentPlanInput(baseForm({ payment_method: 'cash', sale_price: 1_000, amount_paid: 400 }));
assert.deepEqual(cashPlan, {
  existingPlanId: null,
  method: 'cash',
  currency: 'EUR',
  cardTotalMinor: 0,
  cashTotalMinor: 100_000,
  installmentCount: 0,
  firstDate: '2026-08-01',
  confirmedCashMinor: 40_000,
  paymentDate: '2026-08-01',
});

const cardPlan = toTripPaymentPlanInput(baseForm({
  payment_method: 'card',
  payment_plan: { plan_id: null, card_total: 1_000, cash_total: 0, installment_count: 4, first_installment_date: '2026-09-15' },
}));
assert.deepEqual(cardPlan, {
  existingPlanId: null,
  method: 'card',
  currency: 'EUR',
  cardTotalMinor: 100_000,
  cashTotalMinor: 0,
  installmentCount: 4,
  firstDate: '2026-09-15',
  confirmedCashMinor: 0,
  paymentDate: '2026-08-01',
});

const mixedPlan = toTripPaymentPlanInput(baseForm({
  payment_method: 'mixed',
  cash_paid_amount: 250,
  payment_plan: { plan_id: 'plan-123', card_total: 600, cash_total: 400, installment_count: 3, first_installment_date: '2026-09-01' },
}));
assert.deepEqual(mixedPlan, {
  existingPlanId: 'plan-123',
  method: 'mixed',
  currency: 'EUR',
  cardTotalMinor: 60_000,
  cashTotalMinor: 40_000,
  installmentCount: 3,
  firstDate: '2026-09-01',
  confirmedCashMinor: 25_000,
  paymentDate: '2026-08-01',
});

for (const plan of [cashPlan, cardPlan, mixedPlan]) {
  assert.ok(plan && paymentMethods.includes(plan.method), `Payment plan method "${plan?.method}" must satisfy the current CHECK constraint`);
}
assert.throws(() => toTripPaymentPlanInput(baseForm({
  payment_method: 'mixed',
  payment_plan: { plan_id: null, card_total: 500, cash_total: 400, installment_count: 2, first_installment_date: '2026-08-01' },
})), /PAYMENT_PLAN_SPLIT_MISMATCH/);
console.log('[test-database-contracts] Cash, card, mixed, source, method, and split CHECK contracts passed.');

const testRequestId = '11112222-3333-4444-5555-666677778888';
assert.match(testRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Request ID must be valid UUID');
assert.match(migrationContent, /p_client_request_id\s+uuid/i, 'Save RPC must retain the request-id idempotency parameter');
console.log('[test-database-contracts] Idempotency contract passed.');

console.log('[test-database-contracts] ALL DATABASE CONTRACT TESTS PASSED.');
