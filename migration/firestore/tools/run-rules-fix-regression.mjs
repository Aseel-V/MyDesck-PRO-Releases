#!/usr/bin/env node
// Serialized: suites temporarily load probe/insecure rules into their emulator project.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'migration/reports/rules-null-map-fix';
const env = { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' };
const source = 'migration/firestore/rules/firestore.rules';
const sha = () => createHash('sha256').update(readFileSync(source)).digest('hex');
const candidateSha256 = sha();
const config = JSON.parse(readFileSync('migration/firestore/config/vertical-parity.json'));
const suites = [...new Map(Object.values(config.verticals).flatMap(v => v.suites ?? []).map(s => [s[1], s])).values()];
const base = [
  ['Rules security matrix and negative controls', 'migration/firestore/tests/rules.test.mjs', 'node-test'],
  ['Storage Rules', 'migration/firestore/tests/storage-rules.test.mjs', 'node-test'],
  ['Storage identity', 'migration/firestore/tests/storage-identity.test.mjs', 'node-test'],
  ['Identity and admin malicious clients', 'scripts/test-firestore-identity.mjs', 'typescript'],
  ['Schema document codec', 'scripts/test-firestore-document-codec.mjs', 'typescript'],
  ['Application data layer', 'scripts/test-firestore-app-layer.mjs', 'typescript'],
  ['Trip transaction', 'migration/firestore/tests/save-trip-transaction.test.mjs', 'node-test'],
  ['Travel operations', 'migration/firestore/tests/travel-operations.test.mjs', 'node-test'],
];
const budgetOnly = process.argv.includes('--budget-only');
const selected = budgetOnly ? suites.filter(s => s[1].includes('rules-budget'))
  : [...base, ...suites.filter(s => !s[1].includes('rules-budget'))];
const results = [];
for (const [label, script, kind] of selected) {
  console.log(`RUN ${label}`);
  const args = kind === 'typescript' ? ['scripts/run-typescript-source-test.mjs', script] : ['--test', script];
  const startedAt = new Date().toISOString();
  const run = spawnSync(process.execPath, args, { env, encoding: 'utf8', maxBuffer: 30e6 });
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const log = `${root}/${script.split('/').at(-1)}.log`;
  writeFileSync(log, output);
  const count = name => Number(output.match(new RegExp(`(?:# |ℹ )${name} (\\d+)`))?.[1] ?? 0);
  const staticCheck = script === 'scripts/test-firestore-app-layer.mjs' && output.includes('Firestore application-layer static and fail-closed controls: PASS');
  results.push({ label, script, startedAt, exitCode: run.status, tests: count('tests'), passed: count('pass'), staticCheck,
    failed: count('fail'), skipped: count('skipped'), log, error: run.error?.message ?? null });
  console.log(JSON.stringify(results.at(-1)));
  if (sha() !== candidateSha256) throw Error('CANDIDATE_CHANGED_DURING_TESTS');
}
const report = { generatedAt: new Date().toISOString(), candidateSha256, results,
  passed: results.reduce((n, r) => n + r.passed, 0), failed: results.reduce((n, r) => n + r.failed, 0),
  status: results.every(r => r.exitCode === 0 && r.failed === 0 && r.skipped === 0 && (r.tests > 0 || r.staticCheck)) ? 'PASS' : 'FAIL' };
writeFileSync(`${root}/${budgetOnly ? 'budget-run' : 'regression'}.json`, `${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
