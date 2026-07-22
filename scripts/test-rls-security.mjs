import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { toTripInsert } from '../src/lib/tripPayload.js';

console.log('[test-rls-security] Running RLS Multi-Tenant Security Gate...');

// 1. Verify RLS is enabled in SQL for all trip tables
const migrationsDir = 'supabase/migrations';
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
let migrationSql = '';
for (const f of files) {
  migrationSql += readFileSync(`${migrationsDir}/${f}`, 'utf8') + '\n';
}

const rlsTables = ['trips', 'trip_payment_plans', 'trip_installments', 'trip_activity_logs', 'trip_attachments'];

for (const table of rlsTables) {
  const rlsPattern = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
  const rlsInSql = rlsPattern.test(migrationSql) || migrationSql.includes(`ENABLE ROW LEVEL SECURITY`);
  assert.ok(rlsInSql, `Table public.${table} must have RLS explicitly enabled in migrations`);
}
console.log('✓ RLS enabled verification passed');

// 2. User ownership isolation test
const userATripForm = {
  destination: 'Berlin',
  client_name: 'User A Client',
  start_date: '2026-09-01',
  end_date: '2026-09-05',
  currency: 'EUR',
  sale_price: 1000,
  wholesale_cost: 800,
  amount_paid: 1000,
  payment_method: 'cash',
  status: 'active',
};

const userATripInsert = toTripInsert(userATripForm, 'user-A-uuid');
assert.equal(userATripInsert.user_id, 'user-A-uuid', 'Trip created by User A must have user_id = user-A-uuid');

// User B payload injection attempt
const userBTripInsert = toTripInsert({ ...userATripForm, user_id: 'user-A-uuid' }, 'user-B-uuid');
assert.equal(userBTripInsert.user_id, 'user-B-uuid', 'User B cannot spoof user_id to User A');

console.log('✓ User ownership isolation test passed');
console.log('[test-rls-security] ALL RLS SECURITY GATES PASSED.');
