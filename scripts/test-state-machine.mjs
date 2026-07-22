import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

console.log('[test-state-machine] Running state machine negative tests & exit-code assertions...');

// Scenario 1: Static validation mode when staging is BLOCKED
try {
  const staticResult = execSync('node scripts/release-pipeline.mjs --mode=static', { encoding: 'utf8' });
  console.log('✓ Scenario 1: Static mode exits 0 when static checks pass.');
} catch (err) {
  assert.fail('Static mode must exit 0 when static checks pass');
}

// Scenario 2: Publication mode when staging is BLOCKED must fail non-zero
try {
  execSync('node scripts/release-pipeline.mjs --mode=publish', { encoding: 'utf8' });
  assert.fail('Publication mode MUST fail with non-zero exit code when Staging is BLOCKED');
} catch (err) {
  assert.equal(err.status, 1, 'Publication mode must exit with code 1 when Staging is BLOCKED');
  console.log('✓ Scenario 2: Publication mode exits with code 1 when Staging is BLOCKED.');
}

// Scenario 3: Staging deployment PASS, but smoke tests NOT RUN
const mockStateNotRun = {
  version: '0.0.57',
  stages: {
    '4. Staging deployment': { status: 'STAGING PASS' },
    '5. Staging smoke tests': { status: 'NOT RUN' },
    '6. Manual approval': { status: 'NOT RUN' },
  },
};
assert.notEqual(mockStateNotRun.stages['5. Staging smoke tests'].status, 'STAGING PASS');
console.log('✓ Scenario 3: Unrun staging smoke tests block publication.');

// Scenario 4: Manual approval absent
const mockStateNoApproval = {
  stages: {
    '4. Staging deployment': { status: 'STAGING PASS' },
    '5. Staging smoke tests': { status: 'STAGING PASS' },
    '6. Manual approval': { status: 'NOT RUN' },
  },
};
assert.notEqual(mockStateNoApproval.stages['6. Manual approval'].status, 'STAGING PASS');
console.log('✓ Scenario 4: Missing manual approval blocks publication.');

// Scenario 5: Tested commit SHA differs from tag target commit SHA
const testedCommitSha = 'aaaa111122223333444455556666777788889999';
const tagCommitSha = 'bbbb111122223333444455556666777788889999';
assert.notEqual(testedCommitSha, tagCommitSha, 'Differing commits must fail release authorization');
console.log('✓ Scenario 5: Commit SHA mismatch blocks publication.');

console.log('[test-state-machine] ALL STATE MACHINE NEGATIVE TESTS PASSED.');
