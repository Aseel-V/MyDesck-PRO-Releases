import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const isPublishMode = process.argv.includes('--mode=publish');

const STAGE_STATUS = {
  NOT_RUN: 'NOT RUN',
  STATIC_CONTRACT_PASS: 'STATIC CONTRACT PASS',
  LOCAL_PASS: 'LOCAL PASS',
  STAGING_PASS: 'STAGING PASS',
  PRODUCTION_PASS: 'PRODUCTION PASS',
  USER_VERIFIED: 'USER VERIFIED',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
};

// Get current git commit SHA if available
let currentCommitSha = 'LOCAL_WORKING_TREE';
try {
  currentCommitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  // Fallback for non-git envs
}

const pipelineState = {
  version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  mode: isPublishMode ? 'PUBLICATION_AUTHORIZATION' : 'STATIC_VALIDATION',
  commit_sha: currentCommitSha,
  timestamp: new Date().toISOString(),
  current_stage: '1. Code validation',
  stages: {
    '1. Code validation': { status: STAGE_STATUS.NOT_RUN, details: null },
    '2. Database contract validation': { status: STAGE_STATUS.NOT_RUN, details: null },
    '3. Local integration tests': { status: STAGE_STATUS.NOT_RUN, details: null },
    '4. Staging deployment': { status: STAGE_STATUS.NOT_RUN, details: null },
    '5. Staging smoke tests': { status: STAGE_STATUS.NOT_RUN, details: null },
    '6. Manual approval': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until Stage 4 and Stage 5 are STAGING PASS' },
    '7. Production database migration': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
    '8. Production website deployment': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
    '9. GitHub desktop release': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
    '10. Production smoke tests': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
    '11. Upgrade verification': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
    '12. Release completion': { status: STAGE_STATUS.NOT_RUN, details: 'Blocked until manual approval' },
  },
};

function runStep(stageName, command, statusOnPass = STAGE_STATUS.STATIC_CONTRACT_PASS) {
  console.log(`\n========================================`);
  console.log(`Executing Stage: ${stageName}`);
  console.log(`Command: ${command}`);
  console.log(`========================================`);
  try {
    execSync(command, { encoding: 'utf8', stdio: 'inherit' });
    pipelineState.stages[stageName] = {
      status: statusOnPass,
      details: 'Command executed successfully',
    };
    console.log(`✓ ${stageName}: ${statusOnPass}`);
    return true;
  } catch (err) {
    pipelineState.stages[stageName] = {
      status: STAGE_STATUS.FAIL,
      details: err.message,
    };
    console.error(`❌ ${stageName} FAILED: ${err.message}`);
    saveState();
    process.exit(1);
  }
}

function saveState() {
  const targetPath = path.join(process.cwd(), 'release-state.json');
  writeFileSync(targetPath, JSON.stringify(pipelineState, null, 2) + '\n', 'utf8');
  console.log('\n[release-pipeline] Release state saved to ' + targetPath);
}

saveState();

// Execute Stage 1: Code validation (Static Contract Pass)
pipelineState.current_stage = '1. Code validation';
runStep('1. Code validation', 'node scripts/check-release-version.mjs && npm run lint && npm run typecheck && npm run i18n:check', STAGE_STATUS.STATIC_CONTRACT_PASS);

// Execute Stage 2: Database contract validation (Static Contract Pass)
pipelineState.current_stage = '2. Database contract validation';
runStep('2. Database contract validation', 'node scripts/check-database-compatibility.mjs && node scripts/verify-migrations.mjs', STAGE_STATUS.STATIC_CONTRACT_PASS);

// Execute Stage 3: Local static contract tests
pipelineState.current_stage = '3. Local integration tests';
runStep('3. Local integration tests', 'node scripts/test-database-contracts.mjs && npm run test:trip-smoke && npm run test:currency-regression && npm run test:validation-ux && npm run test:rls-security && node scripts/check-pwa-cache-contract.mjs && node scripts/verify-desktop-release-assets.mjs && node scripts/verify-upgrade-path.mjs && node scripts/test-workflow-negative-rules.mjs', STAGE_STATUS.STATIC_CONTRACT_PASS);

// Staging deployment & test evaluation
const hasStagingEnv = Boolean(process.env.STAGING_SUPABASE_URL && process.env.VERCEL_TOKEN);
if (!hasStagingEnv) {
  pipelineState.current_stage = '4. Staging deployment';
  pipelineState.stages['4. Staging deployment'] = {
    status: STAGE_STATUS.BLOCKED,
    details: 'BLOCKED: Staging deployment requires STAGING_SUPABASE_URL and VERCEL_TOKEN environment secrets',
  };
  pipelineState.stages['5. Staging smoke tests'] = {
    status: STAGE_STATUS.NOT_RUN,
    details: 'NOT RUN: Dependent on Stage 4 Staging Deployment',
  };
  pipelineState.stages['6. Manual approval'] = {
    status: STAGE_STATUS.NOT_RUN,
    details: 'NOT RUN: Manual approval becomes available only after Stages 4 and 5 are STAGING PASS',
  };
} else {
  runStep('4. Staging deployment', 'node scripts/deploy-staging.mjs', STAGE_STATUS.STAGING_PASS);
  runStep('5. Staging smoke tests', 'node scripts/test-staging-e2e.mjs', STAGE_STATUS.STAGING_PASS);

  pipelineState.current_stage = '6. Manual approval';
  pipelineState.stages['6. Manual approval'] = {
    status: STAGE_STATUS.BLOCKED,
    details: 'MANDATORY STOP POINT: Staging checks passed. Pipeline halted for manual user review. Publication requires explicit user command: "The staging release is verified. Publish this version."',
  };
}

saveState();

console.log('\n======================================================');
console.log(` RELEASE GATE VERIFICATION COMPLETE [Mode: ${pipelineState.mode}]`);
console.log(' Current Stage: ' + pipelineState.current_stage);
console.log(' Stage 4 Status: ' + pipelineState.stages['4. Staging deployment'].status);
console.log(' Stage 6 Status: ' + pipelineState.stages['6. Manual approval'].status);
console.log(' Current Version: v' + pipelineState.version);
console.log('======================================================\n');

// Exit Code Control
if (isPublishMode) {
  const stage4Pass = pipelineState.stages['4. Staging deployment'].status === STAGE_STATUS.STAGING_PASS;
  const stage5Pass = pipelineState.stages['5. Staging smoke tests'].status === STAGE_STATUS.STAGING_PASS;
  const approved = process.env.MANUAL_RELEASE_APPROVED === 'true';

  if (!stage4Pass || !stage5Pass || !approved) {
    console.error(`❌ RELEASE AUTHORIZATION GATE FAIL: Publication requires Stage 4 STAGING PASS, Stage 5 STAGING PASS, and explicit MANUAL_RELEASE_APPROVED=true.`);
    process.exit(1);
  }
} else {
  console.log(`✓ Static Validation Mode PASSED cleanly (exit code 0).`);
  process.exit(0);
}
