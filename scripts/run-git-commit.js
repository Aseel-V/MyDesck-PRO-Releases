const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'C:/Users/user/.gemini/antigravity/brain/0b902ff1-e22e-47b8-b23c-a35aa68abc43/git-commit-output.txt';
let log = '';

function runCmd(cmd) {
  log += `>>> ${cmd}\n`;
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    log += out + '\n';
  } catch (err) {
    log += `ERROR: ${err.message}\nSTDOUT: ${err.stdout || ''}\nSTDERR: ${err.stderr || ''}\n`;
  }
}

runCmd('git status -s');
runCmd('git branch --show-current');
runCmd('git checkout -b release/staging-0.0.57');

const approvedFiles = [
  '.gitignore',
  'package.json',
  'vercel.json',
  '.github/workflows/build-release.yml',
  '.github/workflows/build.yml',
  '.github/workflows/release-gate.yml',
  'src/i18n/locales/en.json',
  'src/i18n/locales/he.json',
  'src/i18n/locales/ar.json',
  'src/lib/authNetwork.ts',
  'e2e/staging-smoke.spec.ts',
  'supabase/database-compatibility-manifest.json',
  'scripts/sync-version.mjs',
  'scripts/check-database-compatibility.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/test-database-contracts.mjs',
  'scripts/test-trip-smoke-suite.mjs',
  'scripts/test-currency-regression.mjs',
  'scripts/test-validation-ux-gate.mjs',
  'scripts/test-rls-security.mjs',
  'scripts/check-secret-leaks.mjs',
  'scripts/verify-desktop-release-assets.mjs',
  'scripts/verify-upgrade-path.mjs',
  'scripts/check-pwa-cache-contract.mjs',
  'scripts/verify-staging-database.mjs',
  'scripts/test-staging-e2e.mjs',
  'scripts/verify-desktop-updater-staging.mjs',
  'scripts/test-state-machine.mjs',
  'scripts/release-pipeline.mjs',
  'docs/STAGING_PROCESS.md',
  'docs/RELEASE_ROLLBACK_PROCEDURE.md',
  'docs/MIGRATION_RECONCILIATION.md',
  'docs/RELEASE_SYSTEM_ARCHITECTURE.md',
];

for (const file of approvedFiles) {
  runCmd(`git add "${file}"`);
}

runCmd('git commit -m "chore: prepare staging release safety candidate"');
runCmd('git push -u origin release/staging-0.0.57');
runCmd('git branch --show-current');
runCmd('git rev-parse HEAD');
runCmd('git rev-parse origin/release/staging-0.0.57');
runCmd('git status -s');
runCmd('git log -1 --oneline --decorate');

fs.writeFileSync(logFile, log, 'utf8');
console.log('Output written to ' + logFile);
