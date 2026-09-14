import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const analysis = read('migration/reports/firestore-enterprise-index-analysis.json');
const indexes = read('migration/firestore/rules/firestore.indexes.json').indexes;
const iam = read('migration/reports/firestore-production-iam-analysis.json');
const rules = read('migration/reports/firestore-production-rules-plan.json');

test('Enterprise index decisions cover all candidates without Standard functional assumptions', () => {
  assert.equal(analysis.edition, 'ENTERPRISE');
  assert.equal(analysis.classifications.length, 3);
  assert.equal(analysis.classifications.filter(i => i.hardDryRunGate).length, 2);
  assert.equal(analysis.classifications[2].classification, 'COST_OPTIMIZATION');
  assert.ok(analysis.classifications.every(i => !['UNKNOWN','FUNCTIONALLY_REQUIRED'].includes(i.classification)));
});

test('paginated Enterprise queries include explicit stable document ordering', () => {
  assert.deepEqual(indexes.slice(0,2).map(index => index.fields.at(-1)), [
    { fieldPath: '__name__', order: 'ASCENDING' },
    { fieldPath: '__name__', order: 'ASCENDING' },
  ]);
  assert.notEqual(indexes[2].fields.at(-1).fieldPath, '__name__');
});

test('migration IAM plan is narrow and remains unapplied', () => {
  assert.equal(iam.mode, 'plan');
  assert.equal(iam.productionMutations, 0);
  assert.equal(iam.permissionAnalysis, 'FAIL');
  assert.equal(iam.proposed.role, 'roles/datastore.user');
  assert.equal(iam.broadRoleCount, 0);
  assert.equal(iam.roleDefinition.indexPermissions.length, 0);
  assert.deepEqual(iam.roleDefinition.forbiddenPermissionsPresent, []);
  assert.ok(iam.proposed.condition.includes('/databases/default/documents/'));
});

test('Spark production config cannot deploy Functions or Storage', () => {
  const config = read('migration/firestore/firebase.production.json');
  assert.deepEqual(Object.keys(config), ['firestore']);
  assert.equal(config.firestore.database, 'default');
});

test('Rules plan pins current, candidate and rollback hashes without deployment', () => {
  assert.equal(rules.currentMatchesExpectedBaseline, true);
  assert.equal(rules.candidateDeployed, false);
  assert.equal(rules.productionMutations, 0);
  assert.equal(rules.currentSha256, rules.rollbackSha256);
  assert.notEqual(rules.currentSha256, rules.candidateSha256);
  assert.match(rules.deployCommand, /--only firestore:rules/);
  assert.match(rules.rollbackCommand, /firebase\.rollback-rules\.json/);
});
