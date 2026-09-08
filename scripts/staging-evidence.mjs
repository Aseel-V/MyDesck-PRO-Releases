import assert from 'node:assert/strict';
export function assertedResults(report) {
  assert.equal(report.status, 'passed', 'Runner must pass');
  assert.ok(report.tests?.length > 0, 'Zero tests cannot pass');
  for (const test of report.tests) {
    assert.equal(test.status, 'passed', `${test.title}: skipped, failed or interrupted tests cannot pass`);
    assert.ok(Number.isInteger(test.assertions) && test.assertions > 0, `${test.title}: no successful assertions`);
    assert.equal(test.retry, 0, 'Flaky retries cannot certify a release');
  }
  return { passed_tests: report.tests.length, failed_tests: 0, assertions: report.tests.reduce((sum, t) => sum + t.assertions, 0) };
}
