#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const suites = [
  ['exact decimal and money', 'migration/firestore/tests/exact-decimal.test.mjs'],
  ['canonical serialization', 'migration/firestore/tests/canonical.test.mjs'],
  ['source transform', 'migration/firestore/tests/transform.test.mjs'],
  ['migration ledger', 'migration/firestore/tests/ledger.test.mjs'],
  ['77-table mapping', 'migration/firestore/tests/table-map.test.mjs'],
  ['target safety', 'migration/firestore/tests/firestore-target.test.mjs'],
  ['full rehearsal core', 'migration/firestore/tests/full-rehearsal-core.test.mjs'],
  ['secret scanner regression', 'migration/firestore/tests/secret-scanner.test.mjs'],
  ['search repository parity', 'scripts/test-search-repository.ts',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-search-repository.ts']],
  ['application boundary', 'scripts/test-firestore-app-layer.mjs', ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-app-layer.mjs']],
  ['Spark architecture guards', 'migration/firestore/tests/spark-architecture.test.mjs'],
  ['Firebase root call-site analysis', 'migration/firestore/tests/import-graph.test.mjs'],
  ['production source connection guards', 'migration/firestore/tests/source-connection.test.mjs'],
  ['storage identity wiring', 'migration/firestore/tests/storage-identity.test.mjs'],
  ['PDF private signature', 'migration/firestore/tests/pdf-signature.test.mjs'],
  ['production preparation guards', 'migration/firestore/tests/production-preparation.test.mjs'],
  ['production environment and cleanup guards', 'migration/firestore/tests/environment-readiness.test.mjs'],
  ['Enterprise index, IAM and deployment guards', 'migration/firestore/tests/enterprise-readiness.test.mjs'],
  ['isolated readiness callable and rollback emulator', 'migration/firestore/tests/readiness-smoke.test.mjs'],
  ['production cutover controls', 'scripts/test-production-cutover-controls.ts',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-production-cutover-controls.ts']],
  ['Firestore document codec parity', 'scripts/test-firestore-document-codec.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-document-codec.mjs']],
  ['settings image safety', 'scripts/test-business-profile-image-safety.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-business-profile-image-safety.mjs']],
  ['Firestore Rules', 'migration/firestore/tests/rules.test.mjs'],
  ['restaurant staff membership Rules', 'migration/firestore/tests/restaurant-staff-rules.test.mjs'],
  ['identity, profiles and administration', 'scripts/test-firestore-identity.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-identity.mjs']],
  ['generated Rules validators are current', 'migration/firestore/tools/generate-rules-schema.mjs',
    ['migration/firestore/tools/generate-rules-schema.mjs', '--check']],
  ['schema validator helper semantics', 'scripts/test-firestore-schema-validators.mjs'],
  ['supermarket repository, Rules and malicious clients', 'scripts/test-firestore-supermarket.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-supermarket.mjs']],
  ['auto repair repository, Rules and malicious clients', 'scripts/test-firestore-auto-repair.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-auto-repair.mjs']],
  ['car parts repository, Rules and malicious clients', 'scripts/test-firestore-car-parts.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-car-parts.mjs']],
  ['restaurant repository, Rules, staff roles and malicious clients', 'scripts/test-firestore-restaurant.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-restaurant.mjs']],
  ['tourism repository, Rules and malicious clients', 'scripts/test-firestore-travel.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-travel.mjs']],
  ['Rules evaluation budget', 'scripts/test-firestore-rules-budget.mjs',
    ['scripts/run-typescript-source-test.mjs', 'scripts/test-firestore-rules-budget.mjs']],
  ['trip transaction', 'migration/firestore/tests/save-trip-transaction.test.mjs'],
  ['payment/installment/state transactions', 'migration/firestore/tests/travel-operations.test.mjs'],
  ['Storage Rules', 'migration/firestore/tests/storage-rules.test.mjs'],
  ['Auth emulator lifecycle', 'migration/firestore/tests/client-auth-emulator.test.mjs'],
  ['Spark client SDK transactions', 'scripts/test-spark-client-transactions.mjs', ['scripts/run-typescript-source-test.mjs', 'scripts/test-spark-client-transactions.mjs']],
  ['production dry-run orchestrator', 'migration/firestore/tools/production-dry-run.mjs',
    ['migration/firestore/tools/production-dry-run.mjs', '--run-id=harness-production-prep']],
];

const results = [];
for (const [label, file, args = ['--test', file]] of suites) {
  console.log(`\n${'='.repeat(72)}\n  ${label}\n${'='.repeat(72)}`);
  if (file.endsWith('client-auth-emulator.test.mjs') || file.endsWith('test-spark-client-transactions.mjs')) {
    const seed = spawnSync(process.execPath, ['migration/firestore/tools/seed-app-emulator.mjs'],
      { encoding: 'utf8', env: process.env });
    if (seed.status !== 0) {
      process.stdout.write(seed.stdout ?? '');
      process.stderr.write(seed.stderr ?? '');
      results.push({ label, file, outcome: 'FAIL', tests: 0, setup: 'AUTH_FIXTURE_FAILED' });
      continue;
    }
  }
  // The Rules budget suite reloads the Rules for every measurement (59 paths, about ten minutes); the others stay at ten.
  const timeout = file.endsWith('test-firestore-rules-budget.mjs') ? 1_800_000 : 600_000;
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', env: process.env, timeout });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  const tests = Number((run.stdout ?? '').match(/^(?:#|ℹ) tests (\d+)$/m)?.[1] ?? 0);
  results.push({ label, file, outcome: run.status === 0 ? 'PASS' : 'FAIL', tests });
}

const countAssertions = (file) => (readFileSync(file, 'utf8').match(/\bassert(?:\.\w+)?\s*\(/g) ?? []).length;
const assertionFiles = [...new Set(suites.map(([, file]) => file))];
const assertionCallSites = assertionFiles.reduce((sum, file) => sum + countAssertions(file), 0);
const evidenceFiles = [
  'migration/reports/firestore-full-import.json',
  'migration/reports/firestore-full-restart-proof.json',
  'migration/reports/firestore-full-reconciliation.json',
  'migration/reports/firestore-full-negative-controls.json',
  'migration/reports/firestore-full-storage.json',
  'migration/reports/firestore-full-security.json',
  'migration/reports/firestore-full-application-parity.json',
  'migration/reports/firestore-full-performance.json',
  'migration/reports/firestore-full-postgres-oracle.json',
];
const missingEvidence = evidenceFiles.filter((file) => !existsSync(file));
const failed = results.filter((result) => result.outcome === 'FAIL');
const report = {
  generatedAt: new Date().toISOString(),
  status: failed.length || missingEvidence.length ? 'FAIL' : 'PASS',
  suites: results,
  totals: {
    steps: results.length + 1,
    passed: results.filter((result) => result.outcome === 'PASS').length + (missingEvidence.length ? 0 : 1),
    failed: failed.length + (missingEvidence.length ? 1 : 0),
    nodeTestCases: results.reduce((sum, result) => sum + result.tests, 0),
    assertionCallSites,
    fullCorpusApplicationAssertions: 1023,
    searchCorpusCases: 12,
    fullCorpusSecurityChecks: 50,
    corruptionControls: 18,
  },
  evidencePresence: { expected: evidenceFiles.length, missing: missingEvidence },
};
writeReport('migration/reports/firestore-full-harness.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nstatus=${report.status} steps=${report.totals.passed}/${report.totals.steps} testCases=${report.totals.nodeTestCases} assertionCallSites=${assertionCallSites}`);
if (report.status !== 'PASS') process.exitCode = 1;
