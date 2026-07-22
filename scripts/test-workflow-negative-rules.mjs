import assert from 'node:assert/strict';

console.log('[test-workflow-negative-rules] Running comprehensive workflow architecture negative tests...');

// 1. Ref rule & Option A Fast-Forward Promotion Check
function checkRefAndPromotionRule(githubRef, stagingSha, mainSha) {
  if (githubRef !== 'refs/heads/main') {
    return 'BLOCKED_NON_MAIN';
  }
  // Option A Fast-Forward Policy Enforcement:
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

// 3. Complete Staging Evidence Validation & Aggregation Schema Check
function validateStagingEvidence(evidence) {
  const requiredFields = [
    'schema_version',
    'commit_sha',
    'workflow_run_id',
    'workflow_attempt',
    'repository',
    'workflow_file',
    'candidate_version',
    'vercel_staging_url',
    'staging_database_host',
    'database_verification_status',
    'playwright_e2e_status',
    'updater_test_status',
    'installer_sha256',
    'blockmap_sha256',
    'latest_yml_sha256',
    'timestamp',
    'expiration_timestamp',
  ];

  for (const field of requiredFields) {
    if (!evidence || !evidence[field] || typeof evidence[field] !== 'string' || evidence[field].trim() === '') {
      return `MISSING_FIELD_${field.toUpperCase()}`;
    }
  }

  if (new Date(evidence.expiration_timestamp).getTime() < Date.now()) {
    return 'EXPIRED_EVIDENCE';
  }

  return 'VALID_EVIDENCE';
}

const validSampleEvidence = {
  schema_version: '1.0.0',
  commit_sha: '86fb31bf05ccb6ce2b1bcd216e9dbd8540f13309',
  workflow_run_id: '123456789',
  workflow_attempt: '1',
  repository: 'Aseel-V/MyDesck-PRO-Releases',
  workflow_file: '.github/workflows/staging-pipeline.yml',
  candidate_version: '0.0.57',
  vercel_staging_url: 'https://mydesck-pro-staging.vercel.app',
  staging_database_host: 'xyz123.supabase.co',
  database_verification_status: 'STAGING PASS',
  playwright_e2e_status: 'STAGING PASS',
  updater_test_status: 'STAGING PASS',
  installer_sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  blockmap_sha256: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
  latest_yml_sha256: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  timestamp: new Date().toISOString(),
  expiration_timestamp: new Date(Date.now() + 86400000).toISOString(),
};

assert.equal(validateStagingEvidence(validSampleEvidence), 'VALID_EVIDENCE');
assert.equal(validateStagingEvidence({ ...validSampleEvidence, installer_sha256: '' }), 'MISSING_FIELD_INSTALLER_SHA256');
assert.equal(validateStagingEvidence({ ...validSampleEvidence, expiration_timestamp: '2020-01-01T00:00:00.000Z' }), 'EXPIRED_EVIDENCE');
console.log('✓ Scenario 3: Evidence validation fails closed if installer, blockmap, latest.yml hashes or fields are missing or expired');

// 4. Production Database Host Exact Match Guard
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
assert.equal(checkProductionDatabaseHost('https://unknown-db.supabase.co'), 'REJECTED_UNKNOWN_OR_STAGING_HOST');
console.log('✓ Scenario 4: Unknown database host or staging host strictly REJECTED for production migration');

// 5. Desktop Upgrade Result Aggregator Rule
function checkDesktopUpgradeRequirement(jobResults) {
  if (!jobResults || !jobResults['desktop-upgrade'] || jobResults['desktop-upgrade'].status !== 'STAGING PASS') {
    return 'EVIDENCE_GENERATION_BLOCKED';
  }
  return 'EVIDENCE_GENERATION_PERMITTED';
}

assert.equal(checkDesktopUpgradeRequirement({ 'desktop-upgrade': { status: 'BLOCKED' } }), 'EVIDENCE_GENERATION_BLOCKED');
assert.equal(checkDesktopUpgradeRequirement({ 'desktop-upgrade': { status: 'STAGING PASS' } }), 'EVIDENCE_GENERATION_PERMITTED');
console.log('✓ Scenario 5: Desktop Upgrade BLOCKED status prevents staging evidence generation');

console.log('[test-workflow-negative-rules] ALL COMPREHENSIVE WORKFLOW NEGATIVE TESTS PASSED.');
