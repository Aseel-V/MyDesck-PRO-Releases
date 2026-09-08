import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertedResults } from './staging-evidence.mjs';
mkdirSync('results', { recursive: true });
const output = 'results/playwright-result.json';
const report = resolve('results/playwright-assertions.json');
rmSync(output, { force: true });
rmSync(report, { force: true });
try {
  for (const name of ['STAGING_APP_URL', 'STAGING_USER_A_EMAIL', 'STAGING_USER_A_PASSWORD', 'STAGING_USER_B_EMAIL', 'STAGING_USER_B_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  }
  const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'e2e/staging-smoke.spec.ts', '--reporter=./scripts/staging-assertion-reporter.mjs', '--retries=0'], {
    stdio: 'inherit', env: { ...process.env, STAGING_ASSERTION_REPORT: report },
  });
  if (run.status !== 0) throw new Error('Playwright did not complete successfully');
  const evidence = JSON.parse(readFileSync(report, 'utf8'));
  const counts = assertedResults(evidence);
  writeFileSync(output, JSON.stringify({
    test: 'playwright', status: 'STAGING PASS', ...counts,
    commit_sha: process.env.COMMIT_SHA || process.env.GITHUB_SHA || 'local',
    workflow_run_id: String(process.env.RUN_ID || process.env.GITHUB_RUN_ID || 'local'),
    timestamp: new Date().toISOString(), staging_url: process.env.STAGING_APP_URL,
    tests: evidence.tests, rls_status: 'NOT VERIFIED',
    details: 'Browser assertions executed; database isolation requires the separate integration gate.',
  }, null, 2));
  console.log(`Browser assertions passed: ${counts.passed_tests} tests, ${counts.assertions} assertions.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
