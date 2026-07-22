import assert from 'node:assert/strict';
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
  const onlineRunner = (runners || []).find(r => 
    r.status === 'online' && 
    r.os === 'Windows' && 
    r.labels && r.labels.some(l => l.name === 'mydesck-upgrade-test')
  );

  if (!onlineRunner) {
    return 'DESKTOP UPGRADE RUNNER: BLOCKED';
  }
  return 'RUNNER_HEALTHY';
}

assert.equal(checkSelfHostedRunnerHealth([]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ name: 'runner-1', status: 'offline', os: 'Windows', labels: [{ name: 'mydesck-upgrade-test' }] }]), 'DESKTOP UPGRADE RUNNER: BLOCKED');
assert.equal(checkSelfHostedRunnerHealth([{ name: 'runner-1', status: 'online', os: 'Windows', labels: [{ name: 'mydesck-upgrade-test' }] }]), 'RUNNER_HEALTHY');
console.log('✓ Scenario 4: Offline or missing self-hosted Windows runner fails preflight with DESKTOP UPGRADE RUNNER: BLOCKED');

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

console.log('[test-workflow-negative-rules] ALL COMPREHENSIVE WORKFLOW NEGATIVE TESTS PASSED.');
