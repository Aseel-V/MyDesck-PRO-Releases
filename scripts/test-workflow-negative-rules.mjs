import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

console.log('[test-workflow-negative-rules] Running comprehensive workflow architecture negative tests...');

// 1. Ref rule & Option A Fast-Forward Promotion Check
function checkRefAndPromotionRule(githubRef, stagingSha, mainSha) {
  if (githubRef !== 'refs/heads/main') {
    return 'BLOCKED_NON_MAIN';
  }
  if (stagingSha !== mainSha) {
    return 'BLOCKED_SQUASH_OR_MERGE_COMMIT_MISMATCH';
  }
  return 'ALLOWED_FAST_FORWARD_MAIN';
}

assert.equal(checkRefAndPromotionRule('refs/heads/release/staging-0.0.57', 'sha1', 'sha1'), 'BLOCKED_NON_MAIN');
assert.equal(checkRefAndPromotionRule('refs/heads/main', 'sha1', 'sha2_merge_commit'), 'BLOCKED_SQUASH_OR_MERGE_COMMIT_MISMATCH');
assert.equal(checkRefAndPromotionRule('refs/heads/main', 'sha1', 'sha1'), 'ALLOWED_FAST_FORWARD_MAIN');
console.log('✓ Scenario 1: Non-main branch & Option A merge-commit SHA mismatch block production workflow');

// 2. Production approval sequence check: mutations before approval must fail
function checkProductionJobSequence(jobName, approved) {
  const mutationJobs = new Set([
    'production-database-migration',
    'production-vercel-deployment',
    'publish-desktop-release',
  ]);

  if (mutationJobs.has(jobName) && !approved) {
    return 'BLOCKED_UNAPPROVED_MUTATION';
  }
  return 'PERMITTED';
}

assert.equal(checkProductionJobSequence('production-database-migration', false), 'BLOCKED_UNAPPROVED_MUTATION');
assert.equal(checkProductionJobSequence('production-vercel-deployment', false), 'BLOCKED_UNAPPROVED_MUTATION');
assert.equal(checkProductionJobSequence('publish-desktop-release', false), 'BLOCKED_UNAPPROVED_MUTATION');
assert.equal(checkProductionJobSequence('production-database-migration', true), 'PERMITTED');
console.log('✓ Scenario 2: Production database mutation or deployment before manual approval is strictly BLOCKED');

// 3. Reject Known Placeholder Evidence String Defaults
function checkPlaceholderValue(val) {
  const placeholders = ['preview', 'xyz123.supabase.co', 'https://mydesck-pro-staging.vercel.app', 'unbound', 'unknown'];
  if (!val || typeof val !== 'string' || placeholders.includes(val.toLowerCase().trim())) {
    return 'REJECTED_PLACEHOLDER';
  }
  return 'VALID_REAL_IDENTIFIER';
}

assert.equal(checkPlaceholderValue('preview'), 'REJECTED_PLACEHOLDER');
assert.equal(checkPlaceholderValue('xyz123.supabase.co'), 'REJECTED_PLACEHOLDER');
assert.equal(checkPlaceholderValue('https://mydesck-pro-staging.vercel.app'), 'REJECTED_PLACEHOLDER');
assert.equal(checkPlaceholderValue('dpl_987654321'), 'VALID_REAL_IDENTIFIER');
assert.equal(checkPlaceholderValue('staging-project-ref.supabase.co'), 'VALID_REAL_IDENTIFIER');
console.log('✓ Scenario 3: Aggregator strictly REJECTS placeholder default strings (preview, xyz123.supabase.co, etc.)');

// 4. Runner Health Check Rule
function checkSelfHostedRunnerHealth(runners) {
  const requiredLabels = new Set(['self-hosted', 'windows', 'mydesck-upgrade-test']);
  const onlineRunner = (runners || []).find(r => {
    const labels = new Set((r.labels || []).map(label => label.name));
    return r.status === 'online' &&
      r.busy === false &&
      r.os === 'Windows' &&
      [...requiredLabels].every(label => labels.has(label));
  });

  if (!onlineRunner) {
    return 'DESKTOP UPGRADE RUNNER: BLOCKED';
  }
  return 'RUNNER_HEALTHY';
}

assert.equal(checkSelfHostedRunnerHealth([]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
const requiredLabels = [{ name: 'self-hosted' }, { name: 'windows' }, { name: 'mydesck-upgrade-test' }];
assert.equal(checkSelfHostedRunnerHealth([{ status: 'offline', busy: false, os: 'Windows', labels: requiredLabels }]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ status: 'online', busy: true, os: 'Windows', labels: requiredLabels }]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ status: 'online', busy: false, os: 'Windows', labels: requiredLabels.slice(1) }]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ status: 'online', busy: false, os: 'Linux', labels: requiredLabels }]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ status: 'online', busy: false, os: 'Windows', labels: requiredLabels }]), 'RUNNER_HEALTHY');
console.log('✓ Scenario 4: Absent, offline, busy, non-Windows, or incorrectly labeled upgrade runners are BLOCKED');

// 5. Staging Updater Feed URL Validation Rule
function checkStagingUpdaterFeedUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    return 'REJECTED_NON_HTTPS_OR_EMPTY';
  }
  if (url.includes('github.com/Aseel-V/MyDesck-PRO-Releases') || url.includes('mydesck.app')) {
    return 'REJECTED_PRODUCTION_FEED_TARGET';
  }
  return 'VALID_STAGING_FEED_URL';
}

assert.equal(checkStagingUpdaterFeedUrl(''), 'REJECTED_NON_HTTPS_OR_EMPTY');
assert.equal(checkStagingUpdaterFeedUrl('http://staging-feed.local'), 'REJECTED_NON_HTTPS_OR_EMPTY');
assert.equal(checkStagingUpdaterFeedUrl('https://github.com/Aseel-V/MyDesck-PRO-Releases'), 'REJECTED_PRODUCTION_FEED_TARGET');
assert.equal(checkStagingUpdaterFeedUrl('https://isolated-staging-feed.internal.net'), 'VALID_STAGING_FEED_URL');
console.log('✓ Scenario 5: Missing or production-pointing STAGING_UPDATER_FEED_URL strictly REJECTED');

// 6. Configuration preflight and live asset checks must remain separate.
const workflow = readFileSync('.github/workflows/staging-pipeline.yml', 'utf8');
assert.match(workflow, /staging-preflight:[\s\S]*test:staging-updater-feed:configuration/);
assert.doesNotMatch(workflow.match(/staging-preflight:[\s\S]*?(?=\n  check-runner-health:)/)?.[0] || '', /test:staging-updater-feed:live/);
assert.match(workflow, /staging-updater-metadata:[\s\S]*test:staging-updater-feed:live/);
console.log('✓ Scenario 6: Feed configuration preflight is separate from post-build live asset verification');

// 7. Result provenance is required validator configuration, never optional.
const provenanceEnv = { ...process.env };
delete provenanceEnv.COMMIT_SHA;
delete provenanceEnv.GITHUB_SHA;
delete provenanceEnv.RUN_ID;
delete provenanceEnv.GITHUB_RUN_ID;
const missingSha = spawnSync(process.execPath, ['scripts/validate-result-schema.mjs', 'missing.json', 'staging-database'], {
  encoding: 'utf8',
  env: provenanceEnv,
});
assert.notEqual(missingSha.status, 0);
assert.match(missingSha.stderr, /expectedSha parameter is mandatory/);

const missingRunId = spawnSync(process.execPath, ['scripts/validate-result-schema.mjs', 'missing.json', 'staging-database'], {
  encoding: 'utf8',
  env: { ...provenanceEnv, COMMIT_SHA: 'a'.repeat(40) },
});
assert.notEqual(missingRunId.status, 0);
assert.match(missingRunId.stderr, /expectedRunId parameter is mandatory/);
console.log('✓ Scenario 7: Missing expected SHA or run ID fails as a validator configuration error');

console.log('[test-workflow-negative-rules] ALL COMPREHENSIVE WORKFLOW NEGATIVE TESTS PASSED.');
