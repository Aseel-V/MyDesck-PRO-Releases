import assert from 'node:assert/strict';
import { assertedResults, categoryResults, categoryTitles } from './staging-evidence.mjs';
const good = { status: 'passed', tests: [{ title: 'real assertion', status: 'passed', assertions: 1, retry: 0 }] };
assert.equal(assertedResults(good).passed_tests, 1);
assert.throws(() => assertedResults({ status: 'passed', tests: [] }));
for (const change of [{ assertions: 0 }, { status: 'skipped' }, { status: 'failed' }, { retry: 1 }]) {
  assert.throws(() => assertedResults({ ...good, tests: [{ ...good.tests[0], ...change }] }));
}
assert.throws(() => assertedResults({ ...good, status: 'failed' }));
assert.throws(() => categoryResults(good));
assert.equal(categoryResults({ status:'passed',tests:Object.values(categoryTitles).map(title=>({...good.tests[0],title})) }).cash_status,'STAGING PASS');
console.log('Evidence regression assertions passed: empty, assertion-free, skipped, failed and flaky runs rejected.');
