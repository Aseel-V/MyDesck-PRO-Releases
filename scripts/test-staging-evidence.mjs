import assert from 'node:assert/strict';
import { assertedResults } from './staging-evidence.mjs';
const good = { status: 'passed', tests: [{ title: 'real assertion', status: 'passed', assertions: 1, retry: 0 }] };
assert.equal(assertedResults(good).passed_tests, 1);
assert.throws(() => assertedResults({ status: 'passed', tests: [] }));
for (const change of [{ assertions: 0 }, { status: 'skipped' }, { status: 'failed' }, { retry: 1 }]) {
  assert.throws(() => assertedResults({ ...good, tests: [{ ...good.tests[0], ...change }] }));
}
assert.throws(() => assertedResults({ ...good, status: 'failed' }));
console.log('Evidence regression assertions passed: empty, assertion-free, skipped, failed and flaky runs rejected.');
