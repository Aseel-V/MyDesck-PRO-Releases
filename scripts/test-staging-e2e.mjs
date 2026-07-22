import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

console.log('[test-staging-e2e] Running Staging Browser E2E Suite...');

const stagingUrl = process.env.STAGING_APP_URL;

if (!stagingUrl) {
  console.error('❌ FAIL CLOSED: Missing STAGING_APP_URL environment variable for Playwright E2E runner.');
  process.exit(1);
}

try {
  execSync('npx playwright test e2e/staging-smoke.spec.ts', { stdio: 'inherit' });
  
  mkdirSync('results', { recursive: true });
  const result = {
    test: 'playwright',
    status: 'STAGING PASS',
    commit_sha: process.env.COMMIT_SHA || process.env.GITHUB_SHA || 'local',
    workflow_run_id: String(process.env.RUN_ID || process.env.GITHUB_RUN_ID || 'local'),
    timestamp: new Date().toISOString(),
    staging_url: stagingUrl,
    details: 'Playwright E2E browser tests passed.'
  };
  writeFileSync('results/playwright-result.json', JSON.stringify(result, null, 2), 'utf8');

  console.log('✓ Staging Playwright E2E Suite PASSED.');
} catch (err) {
  console.error('❌ Staging E2E Playwright tests failed:', err.message);
  process.exit(1);
}
