import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecretText, scanSecretText } from '../lib/secret-scanner.mjs';

const classic = ['ghp_', 'A'.repeat(36)].join('');
const fine = ['github', '_pat_', '11_', 'b'.repeat(50)].join('');

test('GitHub token shapes are detected without returning their values', () => {
  const findings = scanSecretText(`safe\n${classic}\n${fine}`, 'fixture.txt');
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((item) => item.line), [2, 3]);
  assert.ok(findings.every((item) => !Object.values(item).includes(classic)));
  assert.ok(findings.every((item) => !Object.values(item).includes(fine)));
});

test('redaction removes every credential-shaped value', () => {
  const redacted = redactSecretText(`${classic} ${fine}`);
  assert.equal(scanSecretText(redacted).length, 0);
  assert.equal(redacted.includes(classic), false);
  assert.equal(redacted.includes(fine), false);
});

test('placeholders and ordinary GitHub text are not credentials', () => {
  assert.deepEqual(scanSecretText('ghp_YOUR_TOKEN github_pat_REDACTED'), []);
});
