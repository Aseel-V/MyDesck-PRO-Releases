import { execSync } from 'node:child_process';

console.log('[test-staging-e2e] Running Staging Browser E2E Suite...');

const stagingUrl = process.env.STAGING_APP_URL;

if (!stagingUrl) {
  console.log('STATUS: BLOCKED');
  console.log('Reason: Missing STAGING_APP_URL environment variable for Playwright E2E runner.');
  process.exit(0);
}

try {
  execSync('npx playwright test e2e/staging-smoke.spec.ts', { stdio: 'inherit' });
  console.log('STATUS: STAGING PASS');
} catch (err) {
  console.error('❌ Staging E2E Playwright tests failed:', err.message);
  process.exit(1);
}
