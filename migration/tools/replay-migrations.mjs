#!/usr/bin/env node
/**
 * Phase 8 — replay every MyDesck migration against a real PostgreSQL 17 target.
 *
 * Replaces classification-only evidence with execution evidence. For each of the
 * 93 migrations it records one of:
 *
 *   PASS                     executed cleanly with only the auth compat layer
 *   PASS_WITH_SHIM           executed, but the file needs 001_auth_compat.sql
 *   SKIP_WITH_JUSTIFICATION  executed only because the replay stub faked
 *                            Supabase infrastructure that will NOT exist on
 *                            Cloud SQL — real work is required
 *   FAIL                     raised an error; SQL state and message recorded
 *
 * The run continues past a failure so the whole chain is measured, and each
 * later failure is marked as possibly cascading from an earlier one rather than
 * counted as an independent defect.
 *
 *   PGURL=postgres://... node migration/tools/replay-migrations.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { writeReport } from './lib/write-report.mjs';
import { join } from 'node:path';
import pg from 'pg';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;
if (!PGURL) {
  console.error('NOT RUN: no PGURL. Migration replay is UNPROVEN — do not record a pass.');
  process.exit(2);
}
if (/supabase\.(co|com)/i.test(PGURL)) {
  console.error('ABORT: refusing to replay migrations against Supabase.');
  process.exit(1);
}

const DIR = 'supabase/migrations';
const OUT = 'migration/reports/replay.json';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const portability = JSON.parse(readFileSync('migration/reports/portability.json', 'utf8'));
const classOf = Object.fromEntries(portability.migrations.map((m) => [m.file, m.classification]));

const admin = new pg.Client({ connectionString: PGURL });
await admin.connect();

// The migration chain contains UTF-8 emoji (e.g. U+1F37D in the restaurant
// baseline). If client_encoding is inherited from a non-UTF8 OS locale — WIN1255
// on a Hebrew Windows install, for instance — migration 25 dies with SQLSTATE
// 22P05 and cascades into ten later failures. This is a REAL deployment hazard,
// not just a harness detail: whoever runs the production migration must pin the
// client encoding or lose the same eleven migrations.
await admin.query("SET client_encoding TO 'UTF8'");
const [{ client_encoding: enc, server_encoding: senc }] = (await admin.query(
  "SELECT current_setting('client_encoding') AS client_encoding, current_setting('server_encoding') AS server_encoding"
)).rows;
console.log(`[replay] encoding: client=${enc} server=${senc}`);

console.log('[replay] resetting target to a clean state\n');
for (const s of ['public', 'auth', 'migration', 'storage', 'private', 'private_security', 'extensions']) {
  await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
}
await admin.query('CREATE SCHEMA public');
await admin.query('DROP PUBLICATION IF EXISTS supabase_realtime');

// Extensions the migrations assume are present. The migrations themselves use
// CREATE EXTENSION IF NOT EXISTS, so pre-creating them here makes those calls
// no-ops and keeps a distribution quirk out of the replay results.
//
// pg_trgm is pinned to 1.3: this PostgreSQL build ships the 1.3 base script but
// its default_version is higher and the upgrade chain is not readable here.
// The version does not affect what the migrations exercise (a GIN trigram index
// on trips), so pinning is a harness detail, not a portability finding. On
// Cloud SQL the default version installs normally.
for (const [e, v] of [['pgcrypto', null], ['uuid-ossp', null], ['pg_trgm', '1.3']]) {
  await admin.query(
    v ? `CREATE EXTENSION IF NOT EXISTS "${e}" VERSION '${v}'`
      : `CREATE EXTENSION IF NOT EXISTS "${e}"`
  );
}

// Layer 1: the real compatibility work under test.
console.log('[replay] installing 001_auth_compat.sql + 002_migration_ledger.sql');
await admin.query(readFileSync('migration/sql/001_auth_compat.sql', 'utf8'));
await admin.query(readFileSync('migration/sql/002_migration_ledger.sql', 'utf8'));

// Layer 2: the harness stub, so BLOCKED migrations reveal their *other* errors
// rather than all failing identically on a missing schema.
const USE_STUB = !process.argv.includes('--no-stub');
if (USE_STUB) {
  console.log('[replay] installing 003_supabase_infra_stub.sql (harness only)\n');
  await admin.query(readFileSync('migration/sql/003_supabase_infra_stub.sql', 'utf8'));
}

const results = [];
let firstFailureIndex = -1;

for (let i = 0; i < files.length; i++) {
  const name = files[i];
  const sql = readFileSync(join(DIR, name), 'utf8');
  const staticClass = classOf[name] ?? 'UNKNOWN';

  let outcome, error = null, sqlState = null;
  try {
    // Each migration in its own transaction so one failure cannot poison the
    // next. Files with their own BEGIN/COMMIT nest harmlessly as savepoints.
    await admin.query('BEGIN');
    await admin.query(sql);
    await admin.query('COMMIT');

    outcome =
      staticClass === 'BLOCKED' && USE_STUB ? 'SKIP_WITH_JUSTIFICATION'
      : staticClass === 'PORTABLE' ? 'PASS'
      : 'PASS_WITH_SHIM';
  } catch (e) {
    await admin.query('ROLLBACK').catch(() => {});
    outcome = 'FAIL';
    error = e.message;
    sqlState = e.code ?? null;
    if (firstFailureIndex < 0) firstFailureIndex = i;
  }

  results.push({
    order: i + 1,
    file: name,
    staticClassification: staticClass,
    outcome,
    sqlState,
    error,
    possiblyCascading: outcome === 'FAIL' && firstFailureIndex >= 0 && i > firstFailureIndex,
  });

  const mark = { PASS: 'ok  ', PASS_WITH_SHIM: 'shim', SKIP_WITH_JUSTIFICATION: 'skip', FAIL: 'FAIL' }[outcome];
  console.log(`  ${String(i + 1).padStart(2)}/93 ${mark}  ${name}${outcome === 'FAIL' ? `\n         ${sqlState}: ${String(error).split('\n')[0]}` : ''}`);
}

// ------------------------------------------------------------------ post-state

const summary = { PASS: 0, PASS_WITH_SHIM: 0, SKIP_WITH_JUSTIFICATION: 0, FAIL: 0 };
results.forEach((r) => summary[r.outcome]++);

const q = async (sql) => (await admin.query(sql)).rows;

const [tables] = await q(`
  SELECT count(*)::int AS n FROM pg_tables
  WHERE schemaname = 'public'`);
const [fks] = await q(`
  SELECT count(*)::int AS n FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.confrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE c.contype = 'f' AND ns.nspname = 'auth' AND rel.relname = 'users'`);
const [policies] = await q(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`);
const [funcs] = await q(`
  SELECT count(*)::int AS n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`);
const [definers] = await q(`
  SELECT count(*)::int AS n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef`);
const [rlsOn] = await q(`
  SELECT count(*)::int AS n FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`);
const [forceRls] = await q(`
  SELECT count(*)::int AS n FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity`);
const noRls = await q(`
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  ORDER BY c.relname`);
const definersNoPath = await q(`
  SELECT p.proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                    WHERE cfg LIKE 'search_path=%')
  ORDER BY p.proname`);

const report = {
  generatedAt: new Date().toISOString(),
  target: { serverVersion: (await q('SELECT current_setting($$server_version$$) AS v'))[0].v },
  stubInstalled: USE_STUB,
  totalMigrations: files.length,
  summary,
  liveSchema: {
    publicTables: tables.n,
    fksToAuthUsers: fks.n,
    rlsPolicies: policies.n,
    publicFunctions: funcs.n,
    securityDefinerFunctions: definers.n,
    securityDefinerWithoutSearchPath: definersNoPath.map((r) => r.proname),
    tablesWithRlsEnabled: rlsOn.n,
    tablesWithForceRls: forceRls.n,
    tablesWithoutRls: noRls.map((r) => r.relname),
  },
  migrations: results,
};

writeReport(OUT, JSON.stringify(report, null, 2) + '\n');
await admin.end();

console.log('\n' + '='.repeat(64));
console.log('  REPLAY SUMMARY');
console.log('='.repeat(64));
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(26)} ${String(v).padStart(3)}`);
console.log('');
console.log('  LIVE SCHEMA AFTER REPLAY');
console.log(`  public tables .............. ${tables.n}`);
console.log(`  FKs to auth.users .......... ${fks.n}`);
console.log(`  RLS policies ............... ${policies.n}`);
console.log(`  public functions ........... ${funcs.n} (${definers.n} SECURITY DEFINER)`);
console.log(`  definers w/o search_path ... ${definersNoPath.length}`);
console.log(`  tables with RLS ............ ${rlsOn.n}`);
console.log(`  tables with FORCE RLS ...... ${forceRls.n}`);
console.log(`  tables WITHOUT RLS ......... ${noRls.length}${noRls.length ? ' -> ' + noRls.map((r) => r.relname).join(', ') : ''}`);
console.log(`\n  report -> ${OUT}`);

process.exit(summary.FAIL > 0 ? 1 : 0);
