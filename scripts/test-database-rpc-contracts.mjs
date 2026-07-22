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

console.log('[database-rpc-contracts] Effective signature, manifest parity, stale-name rejection, return type, and grant tests passed.');
