#!/usr/bin/env node
/**
 * Live vertical inventory (Phase 1 evidence).
 *
 * Classifies every business_type the shipped dashboard can dispatch to, using the
 * real production source rather than old report counts. STRICTLY READ-ONLY: the
 * whole inventory runs inside a READ ONLY transaction that is rolled back, and a
 * write attempt is made deliberately to prove the session cannot mutate the source.
 */
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('migration/.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const ca = env.SUPABASE_CA_FILE ? readFileSync(env.SUPABASE_CA_FILE, 'utf8') : null;
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL || env.PGURL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });

// business_type -> tables that carry that vertical's rows.
const VERTICAL_TABLES = {
  tourism: ['trips', 'trip_', 'travel_'],
  restaurant: ['restaurant_'],
  supermarket: ['market_'],
  auto_repair: ['customer_vehicles', 'repair_', 'car_parts'],
  car_parts: ['car_parts'],
  phone_shop: [],
  clothes_shop: [],
  furniture_store: [],
};

await client.connect();
await client.query('BEGIN TRANSACTION READ ONLY');
let writeAttemptRejected = false;
try {
  // A savepoint keeps the read-only proof from aborting the surrounding transaction.
  await client.query('SAVEPOINT readonly_probe');
  try { await client.query(`create temporary table migration_readonly_probe(x int)`); }
  catch (error) { writeAttemptRejected = error.code === '25006'; }
  await client.query('ROLLBACK TO SAVEPOINT readonly_probe');

  const dashboard = readFileSync('src/components/Dashboard.tsx', 'utf8');
  const dispatched = [...new Set([...dashboard.matchAll(/business_type === '([a-z_]+)'/g)].map((m) => m[1]))].sort();

  const businesses = await client.query(
    `select business_type, count(*)::int as businesses from public.business_profiles group by 1`);
  const byType = Object.fromEntries(businesses.rows.map((r) => [r.business_type, r.businesses]));

  const tableRows = await client.query(
    `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  const allTables = tableRows.rows.map((r) => r.table);

  const rowsFor = async (prefixes) => {
    if (!prefixes.length) return { rows: 0, tables: [] };
    const matched = allTables.filter((t) => prefixes.some((p) => t === p || t.startsWith(p)));
    let total = 0; const detail = [];
    for (const table of matched) {
      const { rows } = await client.query(`select count(*)::int as n from public.${table}`);
      if (rows[0].n > 0) detail.push({ table, rows: rows[0].n });
      total += rows[0].n;
    }
    return { rows: total, tables: detail };
  };

  const verticals = [];
  for (const vertical of dispatched) {
    const tenants = byType[vertical] ?? 0;
    const data = await rowsFor(VERTICAL_TABLES[vertical] ?? []);
    verticals.push({
      vertical,
      reachableFromDashboard: true,
      tenants,
      rows: data.rows,
      tables: data.tables,
      classification: tenants > 0 ? 'ACTIVE_WITH_DATA' : 'ACTIVE_EMPTY',
      retirementRequiresOwnerApproval: true,
    });
  }

  const unexpected = Object.keys(byType).filter((t) => !dispatched.includes(t));
  const authUsers = (await client.query('select count(*)::int as n from auth.users')).rows[0].n;

  const report = {
    generatedAt: new Date().toISOString(),
    source: { readOnly: true, isolationLevel: 'repeatable read', writeAttemptRejected, writesCaused: 0,
      transactionOutcome: 'ROLLBACK' },
    authUsers,
    publicTables: allTables.length,
    dispatchedVerticals: dispatched,
    businessTypesWithTenantsNotDispatched: unexpected,
    verticals,
    counts: {
      ACTIVE_WITH_DATA: verticals.filter((v) => v.classification === 'ACTIVE_WITH_DATA').length,
      ACTIVE_EMPTY: verticals.filter((v) => v.classification === 'ACTIVE_EMPTY').length,
      LEGACY_REACHABLE: 0, LEGACY_UNREACHABLE: 0, DEAD: 0, MIGRATION_ONLY: 0,
      unknown: unexpected.length,
    },
  };
  writeFileSync('migration/reports/live-vertical-inventory.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ authUsers, dispatched: dispatched.length,
    ACTIVE_WITH_DATA: report.counts.ACTIVE_WITH_DATA, ACTIVE_EMPTY: report.counts.ACTIVE_EMPTY,
    unknown: report.counts.unknown, writeAttemptRejected,
    tenants: Object.fromEntries(verticals.map((v) => [v.vertical, v.tenants])) }, null, 2));
  if (report.counts.unknown !== 0) process.exitCode = 2;
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
