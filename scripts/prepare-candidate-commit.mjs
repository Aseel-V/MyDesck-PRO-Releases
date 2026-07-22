import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

console.log('======================================================');
console.log(' Preparing Staging Release Candidate Commit & Branch');
console.log('======================================================\n');

function run(cmd, name) {
  console.log(`[Validation Step] ${name}: ${cmd}`);
  try {
    execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
    console.log(`✓ ${name} PASSED\n`);
  } catch (err) {
    console.error(`❌ ${name} FAILED:`, err.message);
    process.exit(1);
  }
}

// 1. Run mandatory pre-commit validations
run('npm run test:secret-leaks', 'Secret Scanning Gate');
run('npm run test:release-static', 'Static Release Gate');
run('npm run test:state-machine', 'State Machine Negative Tests');
run('npm run typecheck', 'TypeScript Type Check');
run('npm run lint', 'ESLint Check');
run('npm run i18n:check', 'i18n Locale Parity');
run('npm run build', 'Vite Application Build');
run('git diff --check', 'Git Diff Formatting Check');

// 2. Fetch remote tags and branches
console.log('[Git Step] Fetching remote refs...');
try {
  execSync('git fetch origin --prune --tags', { encoding: 'utf8', stdio: 'inherit' });
} catch (e) {
  console.warn('[Git Step] Warning: git fetch failed or offline mode');
}

// 3. Check if target branch already exists
const targetBranch = 'release/staging-0.0.57';
try {
  const localBranches = execSync('git branch --list ' + targetBranch, { encoding: 'utf8' }).trim();
  if (localBranches) {
    console.log(`[Git Step] Branch ${targetBranch} already exists locally. Switching to it...`);
    execSync(`git checkout ${targetBranch}`, { encoding: 'utf8', stdio: 'inherit' });
  } else {
    console.log(`[Git Step] Creating new branch ${targetBranch}...`);
    execSync(`git switch -c ${targetBranch}`, { encoding: 'utf8', stdio: 'inherit' });
  }
} catch (err) {
  console.error(`❌ Failed to switch/create branch ${targetBranch}:`, err.message);
  process.exit(1);
}

// 4. List of approved files to stage explicitly
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

console.log('[Git Step] Staging approved files...');
for (const file of approvedFiles) {
  try {
    execSync(`git add "${file}"`, { encoding: 'utf8' });
  } catch (e) {
    console.warn(`Warning: Could not add file ${file}`);
  }
}

// 5. Commit changes
console.log('[Git Step] Creating candidate commit...');
try {
  execSync('git commit -m "chore: prepare staging release safety candidate"', { encoding: 'utf8', stdio: 'inherit' });
} catch (e) {
  console.log('[Git Step] Commit may already exist or working tree unchanged.');
}

// 6. Push staging branch
console.log(`[Git Step] Pushing branch ${targetBranch} to origin...`);
try {
  execSync(`git push -u origin ${targetBranch}`, { encoding: 'utf8', stdio: 'inherit' });
} catch (e) {
  console.error(`❌ Push failed: ${e.message}`);
  process.exit(1);
}

// 7. Get final SHA and verification
const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
let remoteSha = 'UNKNOWN';
try {
  remoteSha = execSync(`git rev-parse origin/${targetBranch}`, { encoding: 'utf8' }).trim();
} catch (e) {}

console.log('\n======================================================');
console.log(' CANDIDATE COMMIT & BRANCH PUSH COMPLETE');
console.log(` Branch: ${targetBranch}`);
console.log(` HEAD Commit SHA: ${headSha}`);
console.log(` Remote Commit SHA: ${remoteSha}`);
console.log(` SHA Match: ${headSha === remoteSha ? 'YES' : 'NO'}`);
console.log('======================================================\n');
