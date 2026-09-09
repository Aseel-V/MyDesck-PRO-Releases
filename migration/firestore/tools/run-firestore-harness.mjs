#!/usr/bin/env node
/**
 * Ordered runner for the Firestore migration proof.
 *
 * Order matters. The rules suite and the transaction suite both write fixtures
 * into the emulator and clean up after themselves; the migration is re-run with
 * --force afterwards so reconciliation measures a target built only from the
 * source export, not one carrying test residue.
 *
 * Steps that cannot run in this environment are reported NOT RUN with the
 * reason, never quietly skipped and never counted as passes. A step that did
 * not run is not a step that passed.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
 *     node migration/firestore/tools/run-firestore-harness.mjs
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const STEPS = [
  { label: 'source domain inventory (read-only)', kind: 'tool',
    script: 'migration/firestore/tools/source-domain-inventory.mjs', needs: 'source' },
  { label: 'RPC and query inventory', kind: 'tool',
    script: 'migration/firestore/tools/rpc-and-query-inventory.mjs' },
  { label: 'data model coverage document', kind: 'tool',
    script: 'migration/firestore/tools/generate-data-model-doc.mjs' },

  { label: 'exact decimal / money', kind: 'test',
    script: 'migration/firestore/tests/exact-decimal.test.mjs' },
  { label: 'canonical serialisation', kind: 'test',
    script: 'migration/firestore/tests/canonical.test.mjs' },
  { label: 'source to Firestore transform', kind: 'test',
    script: 'migration/firestore/tests/transform.test.mjs' },
  { label: 'migration ledger', kind: 'test',
    script: 'migration/firestore/tests/ledger.test.mjs' },
  { label: 'table map coverage', kind: 'test',
    script: 'migration/firestore/tests/table-map.test.mjs' },
  { label: 'target selection safety', kind: 'test',
    script: 'migration/firestore/tests/firestore-target.test.mjs' },

  { label: 'synthetic payload export (read-only)', kind: 'tool',
    script: 'migration/firestore/tools/export-synthetic-payloads.mjs', needs: 'source' },

  { label: 'Security Rules matrix + negative controls', kind: 'test',
    script: 'migration/firestore/tests/rules.test.mjs', needs: 'emulator' },
  { label: 'save_trip_transaction (idempotency, concurrency)', kind: 'test',
    script: 'migration/firestore/tests/save-trip-transaction.test.mjs', needs: 'emulator' },

  { label: 'migrate synthetic slice', kind: 'tool',
    script: 'migration/firestore/tools/migrate-synthetic.mjs',
    args: ['--target', 'emulator', '--force'], needs: 'emulator' },
  { label: 'reconcile (levels 1-6 + event order)', kind: 'tool',
    script: 'migration/firestore/tools/reconcile.mjs',
    args: ['--target', 'emulator'], needs: 'emulator' },
  { label: 'negative controls on the reconciler', kind: 'tool',
    script: 'migration/firestore/tools/negative-controls.mjs',
    args: ['--target', 'emulator'], needs: 'emulator' },

  { label: 'storage manifest + checksum gate', kind: 'tool',
    script: 'migration/firestore/tools/storage-manifest.mjs', needs: 'source+storage' },
];

const unavailable = (needs) => {
  if (needs === 'emulator' && !EMULATOR) return 'FIRESTORE_EMULATOR_HOST not set';
  if (needs === 'source+storage' && !STORAGE) return 'FIREBASE_STORAGE_EMULATOR_HOST not set';
  return null;
};

const results = [];
for (const step of STEPS) {
  const reason = unavailable(step.needs);
  if (reason) {
    console.log(`\n${'='.repeat(72)}\n  NOT RUN  ${step.label}\n           ${reason}\n${'='.repeat(72)}`);
    results.push({ ...step, outcome: 'NOT RUN', reason });
    continue;
  }
  console.log(`\n${'='.repeat(72)}\n  ${step.label}\n${'='.repeat(72)}`);
  const args = step.kind === 'test'
    ? ['--test', step.script]
    : [step.script, ...(step.args ?? [])];
  const run = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  results.push({ ...step, outcome: run.status === 0 ? 'PASS' : 'FAIL', exitCode: run.status });
  if (run.status !== 0) console.error(`\n  STEP FAILED: ${step.label} (exit ${run.status})`);
}

/**
 * Assertion count, by the same convention the earlier harness used: the number
 * of assertion call sites in the suites that actually ran. Test-case counts are
 * reported separately, because the two numbers answer different questions and
 * conflating them would inflate the total.
 */
const countAssertions = (script) => {
  if (!existsSync(script)) return 0;
  return (readFileSync(script, 'utf8').match(/\bassert(?:\.\w+)?\s*\(/g) ?? []).length;
};

const testSteps = results.filter((r) => r.kind === 'test' && r.outcome === 'PASS');
const assertions = testSteps.reduce((n, s) => n + countAssertions(s.script), 0);

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const reconciliation = readJson('migration/reports/firestore-reconciliation.json');
const negatives = readJson('migration/reports/firestore-negative-controls.json');
const migration = readJson('migration/reports/firestore-synthetic-migration.json');

const failed = results.filter((r) => r.outcome === 'FAIL');
const notRun = results.filter((r) => r.outcome === 'NOT RUN');

const report = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? 'FAIL' : notRun.length ? 'PASS_WITH_STEPS_NOT_RUN' : 'PASS',
  environment: {
    firestoreEmulator: EMULATOR ?? null,
    storageEmulator: STORAGE ?? null,
    // Recorded because the previous PostgreSQL harness cannot run without it.
    postgresOracle: process.env.PGURL ? 'configured' : 'not reachable in this environment',
  },
  steps: results.map((r) => ({ label: r.label, kind: r.kind, outcome: r.outcome,
    ...(r.reason ? { reason: r.reason } : {}) })),
  totals: {
    steps: results.length,
    passed: results.filter((r) => r.outcome === 'PASS').length,
    failed: failed.length,
    notRun: notRun.length,
    assertionCallSites: assertions,
    testSuites: testSteps.length,
  },
  outcomes: {
    documentsMigrated: migration?.documentsWritten ?? null,
    migrationFailures: migration?.failures ?? null,
    reconciliation: reconciliation?.status ?? 'NOT RUN',
    reconciliationLevels: reconciliation?.levels ?? null,
    reconciliationTotals: reconciliation?.totals ?? null,
    negativeControls: negatives
      ? { status: negatives.status, controls: negatives.controls,
        detected: negatives.detected, failures: negatives.failures }
      : 'NOT RUN',
  },
};

writeReport('migration/reports/firestore-harness.json', JSON.stringify(report, null, 2) + '\n');

console.log(`\n${'='.repeat(72)}\n  FIRESTORE HARNESS SUMMARY\n${'='.repeat(72)}`);
for (const r of results) {
  console.log(`  ${r.outcome.padEnd(8)} ${r.label}${r.reason ? ` — ${r.reason}` : ''}`);
}
console.log(`\n  steps: ${report.totals.passed} passed, ${report.totals.failed} failed, `
  + `${report.totals.notRun} not run`);
console.log(`  assertion call sites in passing suites: ${assertions}`);
console.log(`  reconciliation: ${report.outcomes.reconciliation}`);
console.log(`  negative controls: ${JSON.stringify(report.outcomes.negativeControls)}\n`);

process.exitCode = failed.length ? 1 : 0;
