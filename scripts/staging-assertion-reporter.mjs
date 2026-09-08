import { writeFileSync } from 'node:fs';
export default class AssertionReporter {
  tests = [];
  counts = new Map();
  onStepEnd(test, result, step) {
    if (step.category === 'expect' && !step.error) this.counts.set(test.id, (this.counts.get(test.id) || 0) + 1);
  }
  onTestEnd(test, result) {
    this.tests.push({ title: test.title, status: result.status, assertions: this.counts.get(test.id) || 0, retry: result.retry });
    this.counts.delete(test.id);
  }
  onEnd(result) {
    writeFileSync(process.env.STAGING_ASSERTION_REPORT, JSON.stringify({ status: result.status, tests: this.tests }));
  }
}
