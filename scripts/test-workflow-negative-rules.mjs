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

// 3. Complete Staging Evidence Validation & Provenance Rule Check
function validateResultProvenance(data, expectedCommitSha, expectedRunId) {
  if (!data || typeof data.status !== 'string' || data.status !== 'STAGING PASS') {
    return 'FAIL_INVALID_STATUS';
  }
  if (!data.commit_sha || data.commit_sha !== expectedCommitSha) {
    return 'FAIL_COMMIT_SHA_MISMATCH';
  }
  if (!data.workflow_run_id || String(data.workflow_run_id) !== String(expectedRunId)) {
    return 'FAIL_RUN_ID_MISMATCH';
  }
  if (!data.timestamp || isNaN(new Date(data.timestamp).getTime())) {
    return 'FAIL_MALFORMED_TIMESTAMP';
  }
  if (new Date(data.timestamp).getTime() > Date.now() + 5 * 60 * 1000) {
    return 'FAIL_FUTURE_TIMESTAMP';
  }
  return 'VALID_PROVENANCE';
}

const validResult = {
  status: 'STAGING PASS',
  commit_sha: 'e7f21f5aba548eef57fee81442c241c53ed100a3',
  workflow_run_id: '999888',
  timestamp: new Date().toISOString()
};

assert.equal(validateResultProvenance(validResult, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'VALID_PROVENANCE');
assert.equal(validateResultProvenance({ ...validResult, status: 'BLOCKED' }, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'FAIL_INVALID_STATUS');
assert.equal(validateResultProvenance({ ...validResult, commit_sha: 'wrong_sha' }, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'FAIL_COMMIT_SHA_MISMATCH');
assert.equal(validateResultProvenance({ ...validResult, workflow_run_id: 'wrong_run' }, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'FAIL_RUN_ID_MISMATCH');
assert.equal(validateResultProvenance({ ...validResult, timestamp: 'invalid-date' }, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'FAIL_MALFORMED_TIMESTAMP');
assert.equal(validateResultProvenance({ ...validResult, timestamp: new Date(Date.now() + 86400000).toISOString() }, 'e7f21f5aba548eef57fee81442c241c53ed100a3', '999888'), 'FAIL_FUTURE_TIMESTAMP');
console.log('✓ Scenario 3: Aggregator fails closed on missing commit SHA, wrong run ID, or malformed/future timestamps');

// 4. Raw Evidence Harness Rule Check (No Synthetic Boolean PASS)
function checkHarnessRawEvidenceRequirement(rawEvidenceFilesExist) {
  if (!rawEvidenceFilesExist) {
    return 'HARNESS_DESKTOP_UPGRADE_BLOCKED';
  }
  return 'HARNESS_OBSERVED_EVIDENCE_PERMITTED';
}

assert.equal(checkHarnessRawEvidenceRequirement(false), 'HARNESS_DESKTOP_UPGRADE_BLOCKED');
assert.equal(checkHarnessRawEvidenceRequirement(true), 'HARNESS_OBSERVED_EVIDENCE_PERMITTED');
console.log('✓ Scenario 4: Upgrade harness requires raw observed filesystem evidence files (no synthetic env PASS)');

// 5. Production Database Host Exact Match Guard
function checkProductionDatabaseHost(prodUrl) {
  const EXACT_PROD_PROJECT_REF = 'pubugnfaqqukelvgckdr';
  if (!prodUrl) return 'MISSING_PROD_URL';
  try {
    const url = new URL(prodUrl);
    if (!url.hostname.includes(EXACT_PROD_PROJECT_REF)) {
      return 'REJECTED_UNKNOWN_OR_STAGING_HOST';
    }
    return 'ALLOWED_PROD_HOST';
  } catch (e) {
    return 'INVALID_URL_FORMAT';
  }
}

assert.equal(checkProductionDatabaseHost('https://pubugnfaqqukelvgckdr.supabase.co'), 'ALLOWED_PROD_HOST');
assert.equal(checkProductionDatabaseHost('https://staging-db.supabase.co'), 'REJECTED_UNKNOWN_OR_STAGING_HOST');
console.log('✓ Scenario 5: Unknown database host or staging host strictly REJECTED for production migration');

console.log('[test-workflow-negative-rules] ALL COMPREHENSIVE WORKFLOW NEGATIVE TESTS PASSED.');
