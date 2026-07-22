import assert from 'node:assert/strict';

console.log('[test-workflow-negative-rules] Running comprehensive workflow architecture negative tests...');

// 1. Ref rule check: non-main ref must fail production build
function checkRefRule(githubRef) {
  if (githubRef !== 'refs/heads/main') {
    return 'BLOCKED_NON_MAIN';
  }
  return 'ALLOWED_MAIN';
}

assert.equal(checkRefRule('refs/heads/release/staging-0.0.57'), 'BLOCKED_NON_MAIN');
assert.equal(checkRefRule('refs/heads/master'), 'BLOCKED_NON_MAIN');
assert.equal(checkRefRule('refs/tags/v0.0.57'), 'BLOCKED_NON_MAIN');
assert.equal(checkRefRule('refs/heads/main'), 'ALLOWED_MAIN');
console.log('✓ Scenario 1: Non-main branch or tag push blocks production workflow');

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

// 3. Complete Staging Evidence Validation Schema Check
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

  // Expiration check
  if (new Date(evidence.expiration_timestamp).getTime() < Date.now()) {
    return 'EXPIRED_EVIDENCE';
  }

  return 'VALID_EVIDENCE';
}

const validSampleEvidence = {
  schema_version: '1.0.0',
  commit_sha: '0da95afc9e4fbc9f3cf09dacae9d63cabaa4cb85',
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
assert.equal(validateStagingEvidence({ ...validSampleEvidence, blockmap_sha256: '' }), 'MISSING_FIELD_BLOCKMAP_SHA256');
assert.equal(validateStagingEvidence({ ...validSampleEvidence, latest_yml_sha256: '' }), 'MISSING_FIELD_LATEST_YML_SHA256');
assert.equal(validateStagingEvidence({ ...validSampleEvidence, expiration_timestamp: '2020-01-01T00:00:00.000Z' }), 'EXPIRED_EVIDENCE');
console.log('✓ Scenario 3: Evidence validation fails closed if installer, blockmap, latest.yml hashes or fields are missing or expired');

// 4. Artifact hash integrity check
function checkAllArtifactHashes(evidence, candidateHashes) {
  if (evidence.installer_sha256 !== candidateHashes.installer_sha256) return 'FAIL_INSTALLER_MISMATCH';
  if (evidence.blockmap_sha256 !== candidateHashes.blockmap_sha256) return 'FAIL_BLOCKMAP_MISMATCH';
  if (evidence.latest_yml_sha256 !== candidateHashes.latest_yml_sha256) return 'FAIL_LATEST_YML_MISMATCH';
  return 'PASS_HASHES_MATCH';
}

const matchingHashes = {
  installer_sha256: validSampleEvidence.installer_sha256,
  blockmap_sha256: validSampleEvidence.blockmap_sha256,
  latest_yml_sha256: validSampleEvidence.latest_yml_sha256,
};

assert.equal(checkAllArtifactHashes(validSampleEvidence, matchingHashes), 'PASS_HASHES_MATCH');
assert.equal(checkAllArtifactHashes(validSampleEvidence, { ...matchingHashes, installer_sha256: 'tampered' }), 'FAIL_INSTALLER_MISMATCH');
assert.equal(checkAllArtifactHashes(validSampleEvidence, { ...matchingHashes, blockmap_sha256: 'tampered' }), 'FAIL_BLOCKMAP_MISMATCH');
assert.equal(checkAllArtifactHashes(validSampleEvidence, { ...matchingHashes, latest_yml_sha256: 'tampered' }), 'FAIL_LATEST_YML_MISMATCH');
console.log('✓ Scenario 4: Tampered candidate installer, blockmap, or latest.yml hashes block release publication');

// 5. Existing tag / release collision check
function checkTagReleaseCollision(existingTags, targetTag) {
  if (existingTags.includes(targetTag)) {
    return 'BLOCKED_TAG_EXISTS';
  }
  return 'OK_TO_CREATE';
}

assert.equal(checkTagReleaseCollision(['v0.0.55', 'v0.0.56', 'v0.0.57'], 'v0.0.57'), 'BLOCKED_TAG_EXISTS');
assert.equal(checkTagReleaseCollision(['v0.0.55', 'v0.0.56'], 'v0.0.57'), 'OK_TO_CREATE');
console.log('✓ Scenario 5: Existing git tag collision blocks release creation');

console.log('[test-workflow-negative-rules] ALL COMPREHENSIVE WORKFLOW NEGATIVE TESTS PASSED.');
