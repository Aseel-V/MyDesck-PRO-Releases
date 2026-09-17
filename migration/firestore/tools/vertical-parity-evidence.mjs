#!/usr/bin/env node
/**
 * Per-vertical parity evidence: migration/reports/vertical-parity-<vertical>.json.
 *
 * active-product-parity.mjs counts a vertical as supported in the Firebase production root only when
 * every gate below is PASS. The gates are measured on the current tree and emulator on every run, so an
 * edit that reintroduces a Supabase call, breaks a suite or outgrows the Rules budget turns them back to
 * FAIL:
 *
 *   firebaseRoot     the vertical's surface is runtime-reachable from src/firebase-main.tsx, and none of its
 *                    files carries a Supabase database, RPC, Auth, database-realtime or Edge Function call,
 *                    imports the generic Supabase client, supabase-js or a src/data/supabase adapter, or
 *                    reaches Storage outside StorageRepository (AST import graph, ../lib/import-graph.mjs)
 *   generatedSchema  the committed Rules validators match the source catalog snapshot
 *   suites           the vertical's repository, Rules and malicious-client suites pass, with the validator
 *                    helper semantics and the Rules budget
 *   rulesBudget      every measured path of the vertical stays within the product ceiling
 *   dataRehearsal    vertical-dual-read.mjs, and every additional dual read the vertical lists, ran after the latest
 *                    verified and reconciled full rehearsal and reports 0 mismatch, 0 orphan, 0 cross-tenant read
 *                    and every applicable control detected
 *   uiSmoke          the browser smoke of the vertical's screens on the Firebase root passed
 *   search, analytics, rpc, realtime, edgeFunctions
 *                    every exposed surface is classified in migration/firestore/config/vertical-parity.json
 *                    with a known class and status; reachability claims are measured
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node migration/firestore/tools/vertical-parity-evidence.mjs --vertical=supermarket
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { FORBIDDEN_CATEGORIES, measureRoot } from '../lib/import-graph.mjs';
import { PRODUCT_ROOTS, STORAGE_ALLOWLIST, verticalOf } from '../lib/vertical-surfaces.mjs';

const vertical = process.argv.find((arg) => arg.startsWith('--vertical='))?.slice('--vertical='.length);
const config = JSON.parse(readFileSync('migration/firestore/config/vertical-parity.json', 'utf8'));
const entry = config.verticals[vertical];
if (!entry) throw new Error(`VERTICAL_NOT_CONFIGURED:${vertical}`);
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const notBefore = (later, earlier) => Boolean(later && earlier) && Date.parse(later) >= Date.parse(earlier);
const gates = {};
const gate = (name, pass, detail) => { gates[name] = { status: pass ? 'PASS' : 'FAIL', ...detail }; };

/**
 * A vertical the product offers but that carries nothing to migrate: no source table, no tenant, no row. Three of
 * them exist (phone_shop, clothes_shop, furniture_store), each a single "coming soon" placeholder reachable from the
 * dashboard. A dual read of no tables and a browser smoke of a static card would assert nothing, so those gates take
 * a stated reason instead -- but only against the measured live inventory, never on the configuration's word alone.
 * A vertical that claims a reason while holding tenants, rows or tables fails, and so does one whose inventory is
 * missing: the escape is available exactly when the emptiness has been measured.
 */
const inventoryEntry = (readJson('migration/reports/live-vertical-inventory.json')?.verticals ?? [])
  .find((item) => item.vertical === vertical) ?? null;
const emptiness = {
  inventoried: Boolean(inventoryEntry),
  tenants: inventoryEntry?.tenants ?? null,
  rows: inventoryEntry?.rows ?? null,
  tables: inventoryEntry?.tables?.length ?? null,
};
const measuredEmpty = emptiness.inventoried && emptiness.tenants === 0 && emptiness.rows === 0 && emptiness.tables === 0;
/** The stated reason for a gate that has nothing to prove, honoured only when the emptiness is measured. */
const notApplicable = (field) => {
  const reason = entry[field];
  if (typeof reason !== 'string' || reason.length === 0) return null;
  return { reason, measuredEmpty, measurement: emptiness };
};

const firebase = measureRoot(PRODUCT_ROOTS.firebase, { storageAllowlist: STORAGE_ALLOWLIST });
const shipped = measureRoot(PRODUCT_ROOTS.shipped, { storageAllowlist: STORAGE_ALLOWLIST });
if (!firebase.present) throw new Error('FIREBASE_ROOT_MISSING');
const mine = (items) => items.filter((item) => verticalOf(item.file) === vertical);
const located = (items) => items.map(({ file, line, kind }) => ({ file, ...(line ? { line } : {}), ...(kind ? { kind } : {}) }));
const surface = firebase.runtimeFiles.filter((file) => verticalOf(file) === vertical);
const violations = {
  forbiddenCallSites: located(mine(firebase.sites.filter((site) => FORBIDDEN_CATEGORIES.includes(site.kind)))),
  genericSupabaseClientImports: located(mine(firebase.imports.genericSupabaseClient)),
  supabaseAdapterImports: located(mine(firebase.imports.supabaseAdapters)),
  supabaseJsImports: located(mine(firebase.supabaseJsOutsideStorageClient)),
  storageOutsideRepository: located(mine(firebase.storageOutsideAllowlist)),
};
gate('firebaseRoot', surface.length > 0 && Object.values(violations).every((list) => list.length === 0),
  { runtimeSurfaceFiles: surface.length, ...violations });

const schema = spawnSync(process.execPath, ['migration/firestore/tools/generate-rules-schema.mjs', '--check'], { encoding: 'utf8' });
gate('generatedSchema', schema.status === 0, { rulesValidators: schema.status === 0 ? 'CURRENT' : 'STALE' });

const suites = entry.suites.map(([label, file, runner]) => {
  const args = runner === 'typescript' ? ['scripts/run-typescript-source-test.mjs', file] : ['--test', '--test-reporter=spec', file];
  // The Rules budget suite measures every product path by binary search, reloading the committed Rules after each
  // probe, so it lengthens as verticals land: 66 paths when this cap was set, 80 with tourism, 1,473s measured on a
  // run that owned the emulator. A cap below that would kill the suite mid-measurement, record a FAIL that says
  // nothing about the Rules, and leave the emulator carrying a padded ruleset for whatever ran next.
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', env: process.env, timeout: 2400000 });
  const count = (name) => Number((run.stdout ?? '').match(new RegExp(`^(?:#|ℹ) ${name} (\\d+)$`, 'm'))?.[1] ?? 0);
  return { label, file, outcome: run.status === 0 && count('tests') > 0 && count('fail') === 0 ? 'PASS' : 'FAIL', tests: count('tests') };
});
// An empty suite list would satisfy `every` without running anything, so a vertical with no suites must say why
// and be measurably empty. A suite list that exists is run and must pass.
const suitesExempt = entry.suites.length === 0 ? notApplicable('suitesNotApplicable') : null;
gate('suites', entry.suites.length === 0
  ? Boolean(suitesExempt?.measuredEmpty)
  : suites.every((suite) => suite.outcome === 'PASS'),
{ suites, ...(entry.suites.length === 0 ? { notApplicable: suitesExempt?.reason ?? null, measurement: emptiness } : {}) });

const budget = readJson('migration/reports/firestore-rules-budget.json');
if (entry.budgetPathPrefixes.length) {
  const paths = (budget?.paths ?? []).filter((path) => entry.budgetPathPrefixes.some((prefix) => path.path.startsWith(prefix)));
  gate('rulesBudget', budget?.decision === 'PASS' && paths.length > 0
    && paths.every((path) => path.withinLimit && path.costAtMost <= budget.productCeiling),
  { limit: budget?.limit ?? null, productCeiling: budget?.productCeiling ?? null, paths: paths.map(({ path, costAtMost }) => ({ path, costAtMost })) });
} else {
  gate('rulesBudget', typeof entry.budgetNotApplicable === 'string' && entry.budgetNotApplicable.length > 0,
    { notApplicable: entry.budgetNotApplicable ?? null });
}

const imported = readJson('migration/reports/firestore-full-import.json');
const reconciled = readJson('migration/reports/firestore-full-reconciliation.json');
const dualRead = readJson(`migration/reports/vertical-dual-read-${vertical}.json`);
// Screens a vertical shares with another (the travel home of auto_repair) prove their reads in their own dual read.
const additionalDualReads = (entry.additionalDualReads ?? []).map((path) => ({ path, report: readJson(path) }));
const rehearsalExempt = notApplicable('dataRehearsalNotApplicable');
gate('dataRehearsal', rehearsalExempt
  ? rehearsalExempt.measuredEmpty
  : imported?.status === 'IMPORTED_AND_IMMEDIATELY_VERIFIED'
    && (reconciled?.status ?? reconciled?.decision) === 'RECONCILED' && notBefore(reconciled?.generatedAt, imported?.generatedAt)
    && [dualRead, ...additionalDualReads.map((item) => item.report)]
      .every((report) => report?.decision === 'PASS' && notBefore(report?.generatedAt, imported?.generatedAt)),
{ ...(rehearsalExempt ? { notApplicable: rehearsalExempt.reason, measurement: emptiness } : {}),
  importedAt: imported?.generatedAt ?? null, reconciledAt: reconciled?.generatedAt ?? null, dualReadAt: dualRead?.generatedAt ?? null,
  totals: dualRead?.totals ?? null,
  additionalDualReads: additionalDualReads.map(({ path, report }) => ({ path, decision: report?.decision ?? null,
    generatedAt: report?.generatedAt ?? null, totals: report?.totals ?? null })) });

const smoke = readJson(`migration/reports/ui-smoke-${vertical}.json`);
const smokeExempt = notApplicable('uiSmokeNotApplicable');
gate('uiSmoke', smokeExempt
  ? smokeExempt.measuredEmpty
  : smoke?.decision === 'PASS' && smoke?.root === PRODUCT_ROOTS.firebase,
{ ...(smokeExempt ? { notApplicable: smokeExempt.reason, measurement: emptiness } : {}),
  smokeAt: smoke?.generatedAt ?? null, flows: smoke?.flows?.map(({ name, status }) => ({ name, status })) ?? null });

const reachableFirebase = new Set(firebase.runtimeFiles);
const reachableShipped = new Set(shipped.present ? shipped.runtimeFiles : []);
for (const kind of ['search', 'analytics', 'rpc', 'realtime', 'edgeFunctions']) {
  if (!Array.isArray(entry[kind])) { gate(kind, false, { reason: 'NOT_CLASSIFIED' }); continue; }
  const surfaces = entry[kind].map((item) => {
    const files = Array.isArray(item.files) ? item.files : [];
    const unreachable = item.status === 'LEGACY_UNREACHABLE';
    const reachability = files.length > 0 && files.every((file) => (unreachable
      ? !reachableFirebase.has(file) && !reachableShipped.has(file) : reachableFirebase.has(file)));
    const known = (config.classes[kind] ?? []).includes(item.class) && ['PASS', 'LEGACY_UNREACHABLE'].includes(item.status)
      && (item.class === 'LEGACY_UNREACHABLE') === unreachable;
    return { surface: item.surface, class: item.class, status: item.status, files,
      verdict: item.status === 'BLOCKED' ? 'BLOCKED' : known && reachability ? 'PASS' : 'FAIL' };
  });
  gate(kind, surfaces.every((item) => item.verdict === 'PASS'),
    { surfaces, blocked: surfaces.filter((item) => item.verdict === 'BLOCKED').length, unknown: surfaces.filter((item) => item.verdict === 'FAIL').length });
}

const decision = Object.values(gates).every((value) => value.status === 'PASS') ? 'PASS' : 'FAIL';
writeReport(`migration/reports/vertical-parity-${vertical}.json`,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), vertical, decision, gates }, null, 2)}\n`);
console.log(JSON.stringify({ vertical, decision, gates: Object.fromEntries(Object.entries(gates).map(([name, value]) => [name, value.status])) }, null, 2));
if (decision !== 'PASS') process.exitCode = 1;
