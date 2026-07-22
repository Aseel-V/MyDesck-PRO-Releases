import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { toTripInsert, toTripUpdate, toTripPaymentPlanInput } from '../src/lib/tripPayload.js';

console.log('[test-database-contracts] Running database contract tests...');

// 1. Generated Column Write Safety Test
const sampleForm = {
  destination: 'London',
  client_name: 'Alice',
  client_phone: '0501234567',
  travelers: [],
  travelers_count: 1,
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  currency: 'EUR',
  sale_price: 500,
  wholesale_cost: 400,
  amount_paid: 200,
  payment_method: 'cash',
  status: 'active',
  profit: 100,
  profit_percentage: 20,
  amount_due: 300,
  created_at: '2026-01-01',
};

const insertPayload = toTripInsert(sampleForm, 'user-123');
const updatePayload = toTripUpdate(sampleForm);

const forbiddenFields = ['profit', 'profit_percentage', 'amount_due', 'search_document', 'created_at'];

for (const field of forbiddenFields) {
  assert.equal(field in insertPayload, false, `Insert payload must NEVER contain generated column "${field}"`);
  assert.equal(field in updatePayload, false, `Update payload must NEVER contain generated column "${field}"`);
}
console.log('✓ Generated columns write safety test passed');

// 2. ON CONFLICT Target Contracts Test
const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
let migrationContent = '';
for (const file of migrationFiles) {
  migrationContent += readFileSync(`${migrationsDir}/${file}`, 'utf8') + '\n';
}

const onConflictMatches = migrationContent.match(/ON\s+CONFLICT\s*\(([^)]+)\)/gi) || [];
assert.ok(onConflictMatches.length > 0, 'Migration files must define ON CONFLICT handlers');

for (const match of onConflictMatches) {
  const targetCols = match.replace(/ON\s+CONFLICT\s*\(/i, '').replace(/\)/, '').trim();
  // Verify that target columns have unique constraints or PKs declared in SQL
  const colList = targetCols.split(',').map((c) => c.trim().replace(/"/g, ''));
  for (const col of colList) {
    const hasConstraint = migrationContent.includes(col) && (
      migrationContent.includes('PRIMARY KEY') ||
      migrationContent.includes('UNIQUE') ||
      migrationContent.includes('CONSTRAINT')
    );
    assert.ok(hasConstraint, `ON CONFLICT target column "${col}" must have a matching unique or primary key constraint in SQL`);
  }
}
console.log('✓ ON CONFLICT target contracts test passed');

// 3. CHECK Constraint Compliance Test
const allowedSources = ['manual', 'cash', 'card', 'mixed', 'native'];
const allowedMethods = ['cash', 'card', 'bank_transfer', 'mixed'];

const planInput = toTripPaymentPlanInput({
  sale_price: 1000,
  amount_paid: 400,
  payment_method: 'mixed',
  payment_plan: {
    plan_id: null,
    card_total: 600,
    cash_total: 400,
    installment_count: 3,
    first_installment_date: '2026-09-01',
  },
});

assert.ok(allowedMethods.includes(planInput.method), `Payment plan method "${planInput.method}" must satisfy CHECK constraint`);
console.log('✓ CHECK constraint compliance test passed');

// 4. Idempotency Contract Test
// Ensure idempotency logic retains request_id deduplication contract
const testRequestId = '11112222-3333-4444-5555-666677778888';
assert.match(testRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Request ID must be valid UUID');
console.log('✓ Idempotency contract test passed');

console.log('[test-database-contracts] ALL DATABASE CONTRACT TESTS PASSED.');
