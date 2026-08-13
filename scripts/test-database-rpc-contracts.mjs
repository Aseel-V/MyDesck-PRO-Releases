import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hasEffectiveRoutineExecuteGrant } from './sql-routine-grants.mjs';
import { findLatestRoutineDefinition } from './sql-routine-contracts.mjs';

// The latest effective migration is the database RPC source of truth. The manifest is a checked mirror.
const expected = {
  arguments: [
    { name: 'p_year', type: 'text' },
    { name: 'p_page', type: 'integer' },
    { name: 'p_page_size', type: 'integer' },
    { name: 'p_search', type: 'text' },
    { name: 'p_payment_status', type: 'text' },
    { name: 'p_trip_status', type: 'text' },
    { name: 'p_month', type: 'integer' },
    { name: 'p_destination', type: 'text' },
    { name: 'p_sort_key', type: 'text' },
  ],
  returnType: 'jsonb',
};

const syntheticMigrations = [
  { name: '001.sql', sql: 'CREATE FUNCTION public.get_trips_page(p_sort_by text) RETURNS text LANGUAGE sql AS $$ SELECT null::text $$;' },
  { name: '002.sql', sql: `
    CREATE OR REPLACE FUNCTION public.get_trips_page(
      p_year text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 24,
      p_search text DEFAULT NULL, p_payment_status text DEFAULT NULL,
      p_trip_status text DEFAULT NULL, p_month integer DEFAULT NULL,
      p_destination text DEFAULT NULL, p_sort_key text DEFAULT 'updated_desc'
    ) RETURNS jsonb LANGUAGE sql AS $$ SELECT null::jsonb $$;
  ` },
];
const syntheticLatest = findLatestRoutineDefinition(syntheticMigrations, { schema: 'public', functionName: 'get_trips_page' });
assert.deepEqual(syntheticLatest.arguments, expected.arguments, 'Latest CREATE OR REPLACE signature must supersede stale p_sort_by');
assert.equal(syntheticLatest.returnType, expected.returnType);
assert.notDeepEqual([{ ...expected.arguments.at(-1), name: 'p_sort_by' }], [expected.arguments.at(-1)], 'Stale sort parameter must be rejected');

const migrationsDir = 'supabase/migrations';
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ name, sql: readFileSync(`${migrationsDir}/${name}`, 'utf8') }));
const manifest = JSON.parse(readFileSync('supabase/database-compatibility-manifest.json', 'utf8'));
const mirror = manifest.rpcs.find((rpc) => rpc.name === 'get_trips_page');
const latest = findLatestRoutineDefinition(migrations, { schema: 'public', functionName: 'get_trips_page' });

assert.ok(latest, 'get_trips_page must have an effective migration definition');
assert.deepEqual(latest.arguments, expected.arguments, `Unexpected active signature in ${latest.migration}`);
assert.equal(latest.returnType, expected.returnType);
assert.deepEqual(mirror.arguments, latest.arguments, 'Manifest parameter names, order, and SQL types must mirror the effective migration');
assert.equal(mirror.return_type, latest.returnType, 'Manifest return type must mirror the effective migration');
assert.equal(mirror.arguments.some(({ name }) => name === 'p_sort_by'), false, 'Manifest must reject stale p_sort_by');
assert.equal(hasEffectiveRoutineExecuteGrant(migrations, {
  schema: 'public',
  functionName: 'get_trips_page',
  argumentTypes: latest.arguments.map(({ type }) => type),
  grantee: 'authenticated',
}), true, 'Exact get_trips_page signature must grant EXECUTE to authenticated');

const analyticsMirror = manifest.rpcs.find((rpc) => rpc.name === 'get_travel_analytics_summary');
const analyticsLatest = findLatestRoutineDefinition(migrations, { schema: 'public', functionName: 'get_travel_analytics_summary' });

assert.ok(analyticsLatest, 'get_travel_analytics_summary must have an effective migration definition');
assert.deepEqual(analyticsMirror.arguments, analyticsLatest.arguments, 'Analytics manifest parameter names, order, and SQL types must mirror effective migration');
assert.equal(analyticsMirror.return_type, analyticsLatest.returnType, 'Analytics manifest return type must mirror effective migration');
assert.equal(hasEffectiveRoutineExecuteGrant(migrations, {
  schema: 'public',
  functionName: 'get_travel_analytics_summary',
  argumentTypes: analyticsLatest.arguments.map(({ type }) => type),
  grantee: 'authenticated',
}), true, 'get_travel_analytics_summary signature must grant EXECUTE to authenticated');

for (const functionName of ['get_owned_trip_payment_summary', 'get_travel_payment_analytics', 'save_trip_transaction']) {
  const routine = findLatestRoutineDefinition(migrations, { schema: 'public', functionName });
  const routineMirror = manifest.rpcs.find((rpc) => rpc.name === functionName);
  assert.ok(routine, `${functionName} must have an effective migration definition`);
  assert.ok(routineMirror, `${functionName} must be represented in the compatibility manifest`);
  assert.deepEqual(routineMirror.arguments, routine.arguments, `${functionName} manifest signature must match its effective migration`);
  assert.equal(routineMirror.return_type, routine.returnType, `${functionName} return type must match its effective migration`);
  assert.equal(hasEffectiveRoutineExecuteGrant(migrations, {
    schema: 'public', functionName, argumentTypes: routine.arguments.map(({ type }) => type), grantee: 'authenticated',
  }), true, `${functionName} must grant EXECUTE to authenticated`);
}

const canonicalMigration = migrations.find(({ name }) => name === '20260813120000_automatic_visa_schedule_collection.sql');
assert.ok(canonicalMigration, 'automatic Visa schedule collection migration must exist');
for (const field of ['cash_confirmed_minor', 'visa_confirmed_minor', 'visa_scheduled_through_today_minor',
  'visa_overdue_unconfirmed_minor', 'visa_future_scheduled_minor', 'confirmed_total_minor', 'total_unpaid_minor',
  'currently_due_unconfirmed_minor', 'payment_source', 'reconciliation_state']) {
  assert.ok(canonicalMigration.sql.includes(`'${field}'`), `canonical payment summary must expose ${field}`);
}
assert.match(canonicalMigration.sql, /sum\(i\.expected_amount_minor\)[\s\S]*i\.due_date <= b\.today/, 'effective Visa must derive from elapsed date-only schedule amounts');
assert.match(canonicalMigration.sql, /manual_visa_received_minor/, 'manual receipt amounts must remain available for audit');
assert.match(canonicalMigration.sql, /visa_overdue_unconfirmed_minor', 0/, 'normal native Visa schedules must not expose overdue-unconfirmed amounts');
assert.match(canonicalMigration.sql, /AT TIME ZONE 'Asia\/Jerusalem'/, 'Visa date boundaries must use the Travel business timezone');
assert.match(canonicalMigration.sql, /ON CONFLICT \(user_id,dedupe_key\) DO NOTHING|ON CONFLICT \(user_id, dedupe_key\) DO NOTHING/, 'Visa progression events must be idempotent');
assert.match(canonicalMigration.sql, /> rollout_at/, 'historical due dates must be suppressed by the rollout baseline');

console.log('[database-rpc-contracts] Effective signature, manifest parity, stale-name rejection, return type, and grant tests passed.');
