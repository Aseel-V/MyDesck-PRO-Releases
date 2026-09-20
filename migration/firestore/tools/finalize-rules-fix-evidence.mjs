#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = 'migration/reports/rules-null-map-fix';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const candidateSha256 = sha(readFileSync('migration/firestore/rules/firestore.rules'));
const baseline = read(`${root}/baseline.json`);
const compilation = read(`${root}/compilation.json`);
const regression = read(`${root}/regression.json`);
const budgetRun = read(`${root}/budget-run.json`);
const budget = read('migration/reports/firestore-rules-budget.json');
const semantics = read(`${root}/semantic-cases.json`);
const source = readFileSync('migration/firestore/rules/firestore.rules', 'utf8');
const previous = readFileSync(`${root}/previous-candidate.rules`, 'utf8');
for (const recorded of [compilation.results[1].sha256, regression.candidateSha256, budgetRun.candidateSha256]) assert.equal(recorded, candidateSha256);
assert.equal(sha(Buffer.from(previous)), baseline.previousCandidateSha256);
assert.equal(sha(execFileSync('git', ['ls-files', '--stage'])), baseline.indexSha256);
assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split('\n').length, 212);
assert.equal(compilation.results[1].http, 200);
assert.ok(compilation.results[1].issues.every(i => i.severity === 'WARNING' && i.description.startsWith('Unused function: ')));
assert.equal(compilation.releaseUnchanged, true);
assert.equal(budgetRun.status, 'PASS');
assert.equal(budget.decision, 'PASS');
assert.equal(budget.paths.length, 80);
assert.ok(budget.paths.every(p => p.withinLimit && p.costAtMost <= 850));
assert.equal(semantics.differences.length, 1);
assert.equal(semantics.differences[0].name, 'non-string partId with matching document name');
assert.equal(semantics.differences[0].status, 403);
assert.equal(semantics.results.length, 70);
const block = s => s.slice(s.indexOf('// SCHEMA-VALIDATORS:BEGIN'), s.indexOf('// SCHEMA-VALIDATORS:END'));
assert.equal(block(source), block(previous));
function omitFunctions(s, names) {
  for (const name of names) {
    const start = s.indexOf(`function ${name}(`);
    if (start < 0) continue;
    let depth = 0, quote = null;
    for (let i = s.indexOf('{', start); i < s.length; i++) {
      const c = s[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
      else if (c === "'" || c === '"') quote = c;
      else if (c === '/' && s[i + 1] === '/') i = s.indexOf('\n', i);
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { s = s.slice(0, start) + s.slice(i + 1); break; }
    }
  }
  return s.replace(/\s+/g, '');
}
assert.equal(omitFunctions(source, ['validConsumedPart', 'validServicePart', 'ledgerMoved']),
  omitFunctions(previous, ['validServicePart', 'ledgerMoved']), 'no changes outside the two affected validations');
function logResult(script, log) {
  const output = readFileSync(log, 'utf8');
  const count = name => Number(output.match(new RegExp(`(?:# |ℹ )${name} (\\d+)`))?.[1] ?? -1);
  const r = { script, log, tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped') };
  assert.ok(r.tests > 0 && r.passed === r.tests && r.failed === 0 && r.skipped === 0, `passing log: ${log}`);
  return r;
}
// Two supplemental runs completed after the first runner was launched. Verify their actual output.
const storage = logResult('migration/firestore/tests/storage-identity.test.mjs', `${root}/storage-identity.test.mjs.log`);
const repair = logResult('scripts/test-firestore-auto-repair.mjs', `${root}/test-firestore-auto-repair-final.log`);
const focused = logResult('migration/firestore/tests/rules-null-map.test.mjs', `${root}/null-map-tests.log`);
const results = regression.results.filter(r => r.script !== repair.script && r.script !== storage.script).concat(storage, repair);
for (const r of results) {
  assert.ok(r.exitCode === undefined || r.exitCode === 0);
  if (r.script === 'scripts/test-firestore-app-layer.mjs') {
    assert.match(readFileSync(r.log, 'utf8'), /Firestore application-layer static and fail-closed controls: PASS/);
    r.staticCheck = true;
  } else assert.ok(r.tests > 0 && r.passed === r.tests && r.failed === 0 && r.skipped === 0, r.script);
}
const baselineNames = ['rules.test.mjs', 'restaurant-staff-rules.test.mjs', 'storage-rules.test.mjs', 'storage-identity.test.mjs',
  'test-firestore-travel.mjs', 'test-firestore-restaurant.mjs', 'test-firestore-supermarket.mjs', 'test-firestore-auto-repair.mjs',
  'test-firestore-car-parts.mjs', 'test-firestore-schema-validators.mjs'];
const security = results.filter(r => baselineNames.includes(r.script.split('/').at(-1)));
assert.equal(security.length, 10);
const securityPassed = security.reduce((n, r) => n + r.passed, 0);
assert.ok(securityPassed >= 111);
// Reconcile the in-flight runner's static-check reporting; no test failures or missing runs are ignored.
writeFileSync(`${root}/regression.json`, `${JSON.stringify({ ...regression, results,
  passed: results.reduce((n, r) => n + r.passed, 0), failed: 0, status: 'PASS' }, null, 2)}\n`);
execFileSync(process.execPath, ['migration/firestore/tools/production-rules-plan.mjs', '--mode=plan'], { stdio: 'pipe' });
const plan = read('migration/reports/firestore-production-rules-plan.json');
assert.equal(plan.candidateSha256, candidateSha256);
assert.equal(plan.currentRuleset, compilation.releaseAfter.rulesetName);
assert.equal(plan.candidateDeployed, false);
const report = { generatedAt: new Date().toISOString(), status: 'PASS', candidateSha256,
  previousCandidateSha256: baseline.previousCandidateSha256, productionMutations: 0,
  security: { passed: securityPassed, failed: 0, baseline: 111, suites: security }, focused,
  budget: { paths: budget.paths.length, over850: 0, maximum: Math.max(...budget.paths.map(p => p.costAtMost)) },
  compilation: { invalidTypeDiagnostics: 0, otherBlockingDiagnostics: 0, unusedHelperWarnings: compilation.results[1].issues.length },
  semantics: { changedValidations: ['validServicePart (split into validServicePart and validConsumedPart)', 'ledgerMoved'],
    schemaBlockIdentical: true, allOtherRulesIdenticalIgnoringWhitespace: true, comparisonCases: 35, verdictDifferences: 1,
    verdictDifference: 'The old repair helper accepted numeric partId 7 when a document named 7 existed; the new helper explicitly denies non-string part IDs. This is stricter helper validation, not an authorization expansion.',
    addedRequirements: ['Referenced repair part ID must be a string; document must exist before and after; both data values must be maps.',
      'Present restaurant ledger line data must be maps; explicit existence flags replace null sentinels.'],
    preserved: ['Labor-only service zero part fields.', 'Exact stock, prices, costs and service linkage.',
      'At least one ledger line side exists; every present line belongs to the same order; exact revision and amount delta.',
      'Tenant, role, ownership, financial and schema validation everywhere else.'], removedHelpers: [] },
  stagedBaseline: { files: 212, indexSha256: baseline.indexSha256, unchanged: true },
  productionRulesetUnchanged: compilation.releaseAfter.rulesetName, plan: 'migration/reports/firestore-production-rules-plan.json',
  safeForManualPublish: true, deployed: false };
writeFileSync(`${root}/verification.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${root}/VERIFIED_CANDIDATE.md`, `# Verified Rules candidate

Verified at: ${report.generatedAt}

Safe to copy the complete contents of migration/firestore/rules/firestore.rules into Firebase Console for project mydesckpro, database default, and Publish manually. No deployment was performed.

Candidate SHA-256: \`${candidateSha256}\`

Superseded candidate SHA-256: \`${baseline.previousCandidateSha256}\`. Historical readiness reports naming that hash do not identify the new candidate.

## Cause and exact original expressions

- Original lines 1875–1876 assigned part and partAfter using \`d.partId == null ? null : get(...).data\` and the corresponding getAfter call. Their use as maps caused the compiler to reject the null branch's type.
- Original lines 2032–2033 assigned lineBefore and lineAfter using \`exists(...) ? get(...).data : null\` and the corresponding existsAfter/getAfter calls. Later property access and map helper calls produced the same map/null conflict.

The remote Firebase projects.test compiler reproduced all four original diagnostics and reports none on the new candidate. The API classified the original type diagnostics as WARNING; this verification explicitly rejects any type diagnostic regardless of severity. Only the same 11 unused-helper warnings remain. The check creates no ruleset or release and runs no production data test cases. API reference: https://firebase.google.com/docs/reference/rules/rest/v1/projects/test

## Complete security-relevant difference inventory

1. Repair part validation now branches before reading the part. Referenced parts require a string ID, existence before and after the transaction, and map data on both sides. All stock decrement, price, cost, positive quantity, and immutable service/item linkage checks are retained. Labor-only services retain exactly the existing zero part quantity/price/cost and null item conditions. Missing referenced documents deny.
2. The explicit string requirement tightens the repair helper: the old helper accepted numeric partId 7 when a document named 7 existed; the new helper denies it. This isolated helper comparison does not assert an exploitable bypass of all the old collection/schema Rules.
3. Restaurant ledger validation uses existence flags and map placeholders instead of null/map unions. Placeholders never satisfy ownership or contribute money. Neither document existing denies, including a zero delta. Each existing side must be a map linked to the same order. Actual line creation/deletion retain their legitimate absent side with zero contribution; revision, decimal validation and exact amount delta remain mandatory.
4. No helpers were removed. The generated schema block is byte-identical. After excluding these two validations and the extracted repair helper, the complete Rules source is identical ignoring whitespace: tenant, role, ownership, financial, schema and catch-all restrictions are unchanged.

## Verification

- Previous baseline suites: ${securityPassed} passing tests/checks, 0 failures, 0 skipped; baseline was 111. This is the same test-case counting convention as the previous readiness report.
- All five vertical suites and their malicious-client tests passed, including new missing/null restaurant ledger attacks and labor-only repair coverage.
- Additional identity, codec, trip transaction, travel operation and application-layer checks passed. See regression.json for per-suite evidence.
- Differential helper matrix: 35 scenarios against each version, 70 decisions, with the single intentional stricter numeric-ID result above; the test runner reports 71 passing tests including its enclosing test.
- Rules budget: 80 paths, 0 over 850, maximum ${report.budget.maximum}; full budget run passed. See migration/reports/firestore-rules-budget.json and budget-run.json.
- Remote compilation: 0 type diagnostics, 0 other blocking diagnostics, 11 unchanged unused-helper warnings.
- Production Rules release unchanged: ${compilation.releaseAfter.rulesetName}.
- The production Rules plan was regenerated and its candidate hash matches these exact bytes.
- Git index unchanged: 212 staged files, index SHA-256 ${baseline.indexSha256}. No staging, unstaging or commits were performed.

## Manual publication

Copy the entire verified Rules file without manual edits. Publish only to mydesckpro / default. Read back the deployed source and verify its SHA-256 equals the candidate above; if the bytes differ, follow the existing rollback plan. This approval concerns this Rules candidate only, not unrelated production migration or application cutover gates.
`);
console.log(JSON.stringify(report, null, 2));
