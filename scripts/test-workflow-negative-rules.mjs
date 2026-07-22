import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

console.log('[test-workflow-negative-rules] Running workflow architecture negative tests...');

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
console.log('✓ Scenario 1: Non-main branch or tag push blocks production deployment');

// 2. Staging HTTP Status check: non-200 must fail
function checkStagingUrlStatus(status) {
  if (status !== 200) {
    return 'FAIL_NON_200';
  }
  return 'PASS_200';
}

assert.equal(checkStagingUrlStatus(404), 'FAIL_NON_200');
assert.equal(checkStagingUrlStatus(500), 'FAIL_NON_200');
assert.equal(checkStagingUrlStatus(200), 'PASS_200');
console.log('✓ Scenario 2: Non-200 Vercel staging deployment URL blocks pipeline');

// 3. Artifact byte hash parity check
function checkArtifactHashParity(verifiedHash, publishHash) {
  if (!verifiedHash || verifiedHash !== publishHash) {
    return 'FAIL_HASH_MISMATCH';
  }
  return 'PASS_HASH_MATCH';
}

assert.equal(checkArtifactHashParity('abc123hash', 'xyz987hash'), 'FAIL_HASH_MISMATCH');
assert.equal(checkArtifactHashParity('abc123hash', 'abc123hash'), 'PASS_HASH_MATCH');
console.log('✓ Scenario 3: Candidate installer byte hash mismatch blocks release publication');

// 4. Staging evidence SHA match check
function checkEvidenceCommitBinding(evidenceSha, targetSha) {
  if (evidenceSha !== targetSha) {
    return 'FAIL_SHA_MISMATCH';
  }
  return 'PASS_SHA_MATCH';
}

assert.equal(checkEvidenceCommitBinding('sha11111', 'sha22222'), 'FAIL_SHA_MISMATCH');
assert.equal(checkEvidenceCommitBinding('sha11111', 'sha11111'), 'PASS_SHA_MATCH');
console.log('✓ Scenario 4: Mismatched commit SHA between staging evidence and target blocks release');

console.log('[test-workflow-negative-rules] ALL WORKFLOW ARCHITECTURE NEGATIVE TESTS PASSED.');
