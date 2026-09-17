import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyIndexes, INDEX_CLASSIFICATIONS } from '../lib/environment-readiness.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const analysis = read('migration/reports/firestore-enterprise-index-analysis.json');
const indexes = read('migration/firestore/rules/firestore.indexes.json').indexes;
const reviews = read('migration/firestore/config/index-classification.json').classifications;
const iam = read('migration/reports/firestore-production-iam-analysis.json');
const rules = read('migration/reports/firestore-production-rules-plan.json');

test('Enterprise index decisions cover every configured spec, by identity rather than position', () => {
  assert.equal(analysis.edition, 'ENTERPRISE');
  // Every configured spec carries an explicit reviewed classification; none is inferred from array order.
  const review = classifyIndexes(indexes, reviews, []);
  assert.equal(review.indexes.length, indexes.length);
  assert.deepEqual(review.orphanedReviews, []);
  assert.ok(review.indexes.every(i => INDEX_CLASSIFICATIONS.includes(i.classification)));
  // The installment due-date index is a cost optimisation and never gates the dry-run.
  const installments = review.indexes.find(i => i.collectionGroup === 'tripInstallments');
  assert.equal(installments.classification, 'COST_OPTIMIZATION');
  assert.equal(installments.hardDryRunGate, false);
  assert.ok(review.indexes.every(i => !['UNKNOWN','FUNCTIONALLY_REQUIRED'].includes(i.classification)));
});

test('paginated Enterprise queries include explicit stable document ordering', () => {
  // Identified by what the index is for, not by where it sits in the file: every paginated `trips` cursor
  // query declares the __name__ tie-breaker, and the unpaginated installment due-date query does not.
  const paginated = indexes.filter(index => index.collectionGroup === 'trips');
  assert.ok(paginated.length >= 2);
  for (const index of paginated) {
    assert.deepEqual(index.fields.at(-1), { fieldPath: '__name__', order: 'ASCENDING' });
  }
  const installments = indexes.filter(index => index.collectionGroup === 'tripInstallments');
  assert.ok(installments.length >= 1);
  for (const index of installments) {
    assert.notEqual(index.fields.at(-1).fieldPath, '__name__');
  }
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
