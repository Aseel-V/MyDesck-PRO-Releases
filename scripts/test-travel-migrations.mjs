import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { travelMigrationOrder, assertTravelMigrationHistory } from './travel-migration-contract.mjs';

const migrationDirectory = 'supabase/migrations';
const migrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql'));
const orderedFiles = travelMigrationOrder.map((version) => {
  const matches = migrationFiles.filter((name) => name.startsWith(`${version}_`));
  assert.equal(matches.length, 1, `Expected exactly one Travel Mode migration for ${version}`);
  return matches[0];
});

assert.deepEqual([...orderedFiles].sort(), orderedFiles, 'Travel Mode migrations must be timestamp ordered');

const productFeatures = readFileSync(`${migrationDirectory}/${orderedFiles[2]}`, 'utf8');
assert.match(productFeatures, /CREATE TABLE IF NOT EXISTS public\.trip_templates\s*\(/, '140000 must create trip_templates before 160000 and 170000');

const workflow = readFileSync(`${migrationDirectory}/${orderedFiles[4]}`, 'utf8');
for (const table of ['trip_payment_plans', 'trip_installments']) {
  assert.match(workflow, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(`), `160000 must create ${table}`);
}
assert.ok(workflow.includes('date_trunc(\'month\', start_date)::date AS "month"'), 'travel reports must quote the reserved month output alias');
assert.ok(workflow.includes('ORDER BY m."month", m.currency'), 'monthly report ordering must qualify the quoted alias');
assert.ok(!workflow.match(/::date\s+month\b/i), 'travel report SQL must not use an unquoted month alias');

const cardSummary = readFileSync(`${migrationDirectory}/${orderedFiles[5]}`, 'utf8');
for (const relation of ['trip_templates', 'trip_payment_plans', 'trip_installments']) {
  const check = `pg_catalog.to_regclass('public.${relation}')`;
  assert.ok(cardSummary.includes(check), `170000 must check ${relation}`);
  assert.ok(cardSummary.indexOf(check) < cardSummary.indexOf('CREATE OR REPLACE FUNCTION public.get_trips_page'), `${relation} must be checked before get_trips_page is created`);
}
assert.ok(!cardSummary.match(/CREATE TABLE(?: IF NOT EXISTS)? public\.(?:trip_payment_plans|trip_installments)/i), '170000 must not duplicate payment tables');
assert.ok(!cardSummary.match(/(?:UPDATE|DELETE\s+FROM)\s+public\.(?:trips|trip_templates|trip_payment_plans|trip_installments|trip_attachments)/i), '170000 must not modify or delete existing Travel Mode data');

const whatsappComposer = readFileSync(`${migrationDirectory}/${orderedFiles[6]}`, 'utf8');
assert.ok(whatsappComposer.includes("to_regclass('public.trip_whatsapp_templates')"), '180000 must verify its template-table prerequisite');
for (const column of ['category', 'is_favorite', 'is_archived', 'usage_count', 'last_used_at']) {
  assert.ok(whatsappComposer.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `180000 must add ${column} without rewriting templates`);
}
assert.ok(!whatsappComposer.match(/(?:UPDATE|DELETE\s+FROM)\s+public\.(?:trips|trip_whatsapp_templates)/i), '180000 must preserve existing trips and templates');

assert.doesNotThrow(() => assertTravelMigrationHistory(travelMigrationOrder));
assert.throws(
  () => assertTravelMigrationHistory(travelMigrationOrder.filter((version) => version !== '20260719160000')),
  /20260719160000/,
  'a remote ledger that skips 160000 must fail',
);
assert.throws(
  () => assertTravelMigrationHistory(['20260719170000']),
  /20260719140000, 20260719160000/,
  'a remote ledger that records only 170000 must identify every prerequisite',
);

if (process.argv.includes('--clean-local')) {
  const reset = spawnSync('npx', ['supabase', 'db', 'reset', '--local', '--no-seed'], {
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (reset.error) throw reset.error;
  assert.equal(reset.status, 0, 'clean local Supabase reset must apply all migrations in timestamp order');
}

console.log(process.argv.includes('--clean-local')
  ? 'Clean-database Travel Mode migration test passed'
  : 'Travel Mode migration structure and skipped-history tests passed');
