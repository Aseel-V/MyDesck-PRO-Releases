#!/usr/bin/env node
/**
 * Phase 9 — reconcile the STATIC inventory (parsed from migration text) against
 * the LIVE schema produced by replaying those migrations.
 *
 * Any difference must be explained. An unexplained gap means the migration plan
 * is missing something — most dangerously a foreign key that no import step
 * knows about.
 *
 *   PGURL=postgres://... node migration/tools/reconcile-inventory.mjs
 */

import { readFileSync } from 'node:fs';
import { writeReport } from './lib/write-report.mjs';
import pg from 'pg';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;
if (!PGURL) { console.error('NOT RUN: no PGURL.'); process.exit(2); }

const inv = JSON.parse(readFileSync('migration/reports/inventory.json', 'utf8'));
const c = new pg.Client({ connectionString: PGURL });
await c.connect();
await c.query("SET client_encoding TO 'UTF8'");
const q = async (s, p = []) => (await c.query(s, p)).rows;

// ------------------------------------------------------------------ live facts

const liveTables = (await q(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
)).map((r) => r.tablename);

const liveFks = await q(`
  SELECT con.conname, src.relname AS child, att.attname AS column_name
  FROM pg_constraint con
  JOIN pg_class src  ON src.oid = con.conrelid
  JOIN pg_class tgt  ON tgt.oid = con.confrelid
  JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
  JOIN unnest(con.conkey) AS k(attnum) ON true
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
  WHERE con.contype='f' AND tn.nspname='auth' AND tgt.relname='users'
  ORDER BY src.relname, att.attname`);

const livePolicies = await q(`
  SELECT schemaname, tablename, policyname FROM pg_policies
  WHERE schemaname IN ('public','storage') ORDER BY schemaname, tablename, policyname`);

const [{ n: rlsOn }] = await q(`
  SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`);
const [{ n: forceOn }] = await q(`
  SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity`);

// ------------------------------------------------------------------ static facts

const staticTables = Object.values(inv.database.tables.tiers).flat().sort();
const staticFkDecls = inv.database.authUsersFkCount;
const staticPolicyStmts = inv.database.policyCount;

// Explain the policy gap: CREATE POLICY statements are not distinct policies.
// A DROP+CREATE pair, or a later migration replacing an earlier policy of the
// same name, counts twice statically but once live.
const policyNames = [];
const migrationText = (await import('node:fs')).readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
for (const m of migrationText.matchAll(/CREATE POLICY\s+("?[^"\s]+"?|"[^"]+")\s+ON\s+([a-zA-Z_."]+)/gi)) {
  policyNames.push(`${m[2].replace(/"/g, '').replace(/^public\./, '')}::${m[1].replace(/"/g, '')}`);
}
const distinctStaticPolicies = new Set(policyNames).size;
const redefinedPolicies = policyNames.length - distinctStaticPolicies;

// Explain the FK gap the same way: duplicated CREATE TABLE files declare the
// same FK twice, and CREATE TABLE IF NOT EXISTS makes the second a no-op.
const fkDecls = [...migrationText.matchAll(
  /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_."]+)\s*\(([\s\S]*?)\n\)\s*;/gi
)].flatMap(([, name, body]) => {
  const t = name.replace(/"/g, '').replace(/^public\./, '').toLowerCase();
  return [...body.matchAll(/^\s*([a-z_]+)[^,]*REFERENCES\s+auth\.users\s*\(/gim)]
    .map((m) => `${t}.${m[1]}`);
});
const distinctFkDecls = new Set(fkDecls).size;
const duplicateFkDecls = fkDecls.length - distinctFkDecls;

const liveFkKeys = new Set(liveFks.map((r) => `${r.child}.${r.column_name}`));
const declaredNotLive = [...new Set(fkDecls)].filter((k) => !liveFkKeys.has(k)).sort();
const liveNotDeclared = [...liveFkKeys].filter((k) => !new Set(fkDecls).has(k)).sort();

// ------------------------------------------------------------------ report

const tablesMatch = staticTables.length === liveTables.length;
const missingTables = staticTables.filter((t) => !liveTables.includes(t));
const extraTables = liveTables.filter((t) => !staticTables.includes(t));

const report = {
  generatedAt: new Date().toISOString(),
  tables: {
    static: staticTables.length, live: liveTables.length,
    match: tablesMatch, missingFromLive: missingTables, extraInLive: extraTables,
  },
  foreignKeysToAuthUsers: {
    staticDeclarations: staticFkDecls,
    distinctDeclaredColumns: distinctFkDecls,
    duplicateDeclarations: duplicateFkDecls,
    liveConstraints: liveFks.length,
    declaredButNotLive: declaredNotLive,
    liveButNotDeclared: liveNotDeclared,
    explained: declaredNotLive.length === 0,
  },
  rlsPolicies: {
    staticCreateStatements: staticPolicyStmts,
    distinctStaticPolicyNames: distinctStaticPolicies,
    redefinitions: redefinedPolicies,
    livePublicSchema: livePolicies.filter((p) => p.schemaname === 'public').length,
    liveStorageSchema: livePolicies.filter((p) => p.schemaname === 'storage').length,
    liveTotal: livePolicies.length,
  },
  rls: { tablesWithRls: rlsOn, tablesWithForceRls: forceOn, totalTables: liveTables.length },
};

writeReport('migration/reports/inventory-reconciliation.json', JSON.stringify(report, null, 2) + '\n');
await c.end();

const line = (k, v) => console.log(`  ${k.padEnd(38)} ${v}`);
console.log('\n  TABLES');
line('static (parsed from migrations)', report.tables.static);
line('live (after replay)', report.tables.live);
line('match', tablesMatch ? 'YES' : `NO — missing ${missingTables.join(', ')} extra ${extraTables.join(', ')}`);

console.log('\n  FOREIGN KEYS TO auth.users');
line('static REFERENCES occurrences', staticFkDecls);
line('distinct declared (table.column)', distinctFkDecls);
line('duplicate declarations', duplicateFkDecls);
line('live constraints', liveFks.length);
line('declared but NOT live', declaredNotLive.length ? declaredNotLive.join(', ') : 'none');
line('live but NOT declared', liveNotDeclared.length ? liveNotDeclared.join(', ') : 'none');
line('fully explained', report.foreignKeysToAuthUsers.explained ? 'YES' : 'NO — investigate');

console.log('\n  RLS POLICIES');
line('static CREATE POLICY statements', staticPolicyStmts);
line('distinct policy names', distinctStaticPolicies);
line('redefinitions (drop/create, replaced)', redefinedPolicies);
line('live in public', report.rlsPolicies.livePublicSchema);
line('live in storage', report.rlsPolicies.liveStorageSchema);
line('live total', report.rlsPolicies.liveTotal);

console.log('\n  RLS POSTURE');
line('tables with RLS enabled', `${rlsOn} / ${liveTables.length}`);
line('tables with FORCE RLS', `${forceOn} / ${liveTables.length}`);

const ok = tablesMatch && report.foreignKeysToAuthUsers.explained;
console.log(`\n  ${ok ? 'RECONCILED — no hidden FK outside the migration plan.' : 'UNRECONCILED — see above.'}`);
process.exit(ok ? 0 : 1);
