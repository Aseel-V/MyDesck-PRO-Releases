/**
 * Regression cover for three readiness-gate defects that made gates pass without evidence.
 *
 *   1. Index classification was assigned by ARRAY POSITION, so inserting a spec silently re-labelled its
 *      neighbours and a spec past the end of the hardcoded list inherited no classification at all.
 *   2. The source-row drift check received the orchestrator's own constant on BOTH sides, so it compared
 *      1444 === 1444 and could not detect drift by construction.
 *   3. The real production client-SDK gate was a hardcoded NOT_RUN, so a genuine production run could never
 *      close it -- and nothing stopped an EMULATOR artifact from being read as production proof.
 *
 * These tests fix the properties, not the current numbers: they must keep passing as indexes are added,
 * reordered or reclassified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyIndexes, capabilityBlockers, indexShape, INDEX_CLASSIFICATIONS } from '../lib/environment-readiness.mjs';
import { evaluateSourceCountDrift } from '../lib/production-guard.mjs';
import { evaluateProductionClientSmoke, REQUIRED_CATEGORIES } from '../lib/client-smoke-evidence.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const specs = read('migration/firestore/rules/firestore.indexes.json').indexes;
const reviews = read('migration/firestore/config/index-classification.json').classifications;

/** identity -> decision, compared order-insensitively so array order is never mistaken for meaning. */
const pairings = (result) => [...new Map(result.indexes.map((index) =>
  [index.identity, `${index.classification}|${index.hardDryRunGate}|${index.evidenceState}`])).entries()].sort();

test('index classification is keyed by identity, so reordering cannot change any decision', () => {
  const base = classifyIndexes(specs, reviews, []);
  const permutations = [
    classifyIndexes([...specs].reverse(), reviews, []),
    classifyIndexes(specs, [...reviews].reverse(), []),
    classifyIndexes([...specs].reverse(), [...reviews].reverse(), []),
    classifyIndexes([specs.at(-1), ...specs.slice(0, -1)], reviews, []),
  ];
  for (const permuted of permutations) {
    assert.deepEqual(pairings(permuted), pairings(base));
    assert.equal(permuted.hardRequired, base.hardRequired);
    assert.equal(permuted.reviewComplete, base.reviewComplete);
  }
});

test('every configured spec receives an explicit classification record', () => {
  const review = classifyIndexes(specs, reviews, []);
  assert.equal(review.indexes.length, specs.length);
  assert.deepEqual(review.orphanedReviews, [], 'a review entry matching no configured spec is a stale review');
  for (const index of review.indexes) assert.ok(INDEX_CLASSIFICATIONS.includes(index.classification));
});

test('an unclassified new index fails closed and cannot silently inherit a neighbour decision', () => {
  const added = { collectionGroup: 'trips', queryScope: 'COLLECTION',
    fields: [{ fieldPath: 'ownerUid', order: 'ASCENDING' }, { fieldPath: 'unreviewedField', order: 'ASCENDING' }],
    '//': 'newly added, not yet reviewed' };
  const review = classifyIndexes([...specs, added], reviews, []);
  const fresh = review.indexes.find((index) => index.identity === indexShape(added));
  assert.equal(fresh.classification, 'REVIEW_REQUIRED');
  assert.equal(fresh.evidenceState, 'UNVERIFIED');
  assert.equal(fresh.hardDryRunGate, false, 'an unreviewed spec must not gate; it blocks via reviewComplete');
  assert.equal(review.reviewComplete, false);

  // Inserting it FIRST must not shift anyone else's decision either.
  const inserted = classifyIndexes([added, ...specs], reviews, []);
  const withoutNew = (result) => pairings(result).filter(([identity]) => identity !== indexShape(added));
  assert.deepEqual(withoutNew(inserted), withoutNew(classifyIndexes(specs, reviews, [])));
});

test('an unreviewed index blocks the INDEXES capability even when every other gate passes', () => {
  const allReady = (indexes) => indexes.map((index) => ({ ...index, state: 'READY' }));
  const passing = { billingEnabled: false, sparkPlan: 'PASS', quota: 'PASS', iam: 'PASS', rules: 'PASS', secret: 'PASS' };

  const unreviewed = classifyIndexes([...specs,
    { collectionGroup: 'trips', queryScope: 'COLLECTION', fields: [{ fieldPath: 'nope', order: 'ASCENDING' }] }],
  reviews, []);
  assert.ok(capabilityBlockers({ ...passing, indexes: allReady(unreviewed.indexes) }).includes('INDEXES'));

  // Fully reviewed and READY clears it, so the gate is not simply always-on.
  const reviewedAll = specs.map((spec) => ({ ...spec, query: spec['//'], classification: 'COST_OPTIMIZATION',
    hardDryRunGate: false, evidenceState: 'REASONED_FROM_CORPUS' }));
  const reviewed = classifyIndexes(specs, reviewedAll, []);
  assert.ok(!capabilityBlockers({ ...passing, indexes: allReady(reviewed.indexes) }).includes('INDEXES'));
});

test('a hard-required index that is not READY keeps the capability blocked', () => {
  const hardRequired = specs.map((spec) => ({ ...spec, query: spec['//'],
    classification: 'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE', hardDryRunGate: true, evidenceState: 'MEASURED' }));
  const review = classifyIndexes(specs, hardRequired, specs.map((spec) => ({ ...spec, state: 'MISSING' })));
  assert.equal(review.hardRequired, specs.length);
  assert.equal(review.hardRequiredReady, 0);
  assert.ok(capabilityBlockers({ billingEnabled: false, sparkPlan: 'PASS', quota: 'PASS', iam: 'PASS',
    rules: 'PASS', secret: 'PASS', indexes: review.indexes }).includes('INDEXES'));
});

test('source drift needs a real measurement: a constant compared with itself cannot pass', () => {
  // The precise shape of the old defect: one origin supplying both halves.
  const selfCompared = evaluateSourceCountDrift({
    measured: { rows: 1444, origin: 'orchestrator-constant', readOnlyProven: true },
    reference: { rows: 1444, origin: 'orchestrator-constant' },
  });
  assert.equal(selfCompared.status, 'FAIL');
  assert.ok(selfCompared.reasons.includes('MEASUREMENT_AND_REFERENCE_SHARE_ORIGIN'));
});

test('source drift fails closed when the live measurement is absent or unproven', () => {
  const absent = evaluateSourceCountDrift({ measured: null, reference: { rows: 1474, origin: 'rehearsal' } });
  assert.equal(absent.status, 'FAIL');
  assert.ok(absent.reasons.includes('LIVE_MEASUREMENT_ABSENT'));

  const unproven = evaluateSourceCountDrift({
    measured: { rows: 1474, origin: 'live', readOnlyProven: false },
    reference: { rows: 1474, origin: 'rehearsal' },
  });
  assert.equal(unproven.status, 'FAIL');
  assert.ok(unproven.reasons.includes('LIVE_MEASUREMENT_NOT_READ_ONLY_PROVEN'));

  const noReference = evaluateSourceCountDrift({ measured: { rows: 1474, origin: 'live', readOnlyProven: true }, reference: null });
  assert.equal(noReference.status, 'FAIL');
  assert.ok(noReference.reasons.includes('REFERENCE_ABSENT'));
});

test('a changed live count fails validation and reports expected, measured and delta', () => {
  const drifted = evaluateSourceCountDrift({
    measured: { rows: 1500, tables: 77, origin: 'live', readOnlyProven: true, generatedAt: '2026-09-17T00:00:00.000Z' },
    reference: { rows: 1474, tables: 77, origin: 'rehearsal' },
  });
  assert.equal(drifted.status, 'FAIL');
  assert.equal(drifted.expected, 1474);
  assert.equal(drifted.measured, 1500);
  assert.equal(drifted.delta, 26);
  assert.equal(drifted.measuredAt, '2026-09-17T00:00:00.000Z');
  assert.ok(drifted.reasons.some((reason) => reason.startsWith('SOURCE_ROW_DRIFT')));

  const tableDrift = evaluateSourceCountDrift({
    measured: { rows: 1474, tables: 78, origin: 'live', readOnlyProven: true },
    reference: { rows: 1474, tables: 77, origin: 'rehearsal' },
  });
  assert.equal(tableDrift.status, 'FAIL');
  assert.ok(tableDrift.reasons.some((reason) => reason.startsWith('SOURCE_TABLE_DRIFT')));
});

test('matching counts from distinct origins pass with a zero delta', () => {
  const clean = evaluateSourceCountDrift({
    measured: { rows: 1474, tables: 77, origin: 'migration/reports/live-source-inventory.json', readOnlyProven: true },
    reference: { rows: 1474, tables: 77, origin: 'migration/reports/firestore-full-import.json' },
  });
  assert.equal(clean.status, 'PASS');
  assert.equal(clean.delta, 0);
  assert.deepEqual(clean.reasons, []);
});

const productionSmoke = (overrides = {}) => ({
  generatedAt: '2026-09-17T00:00:00.000Z', target: 'PRODUCTION', project: 'mydesckpro', clientSdk: true,
  migrationRunId: 'migration-test--final-smoke-1234', status: 'PASS',
  categories: Object.fromEntries(REQUIRED_CATEGORIES.map((name) => [name, 'PASS'])),
  cleanup: { status: 'PASS', authUsersRemaining: 0, firestoreDocumentsRemaining: 0, storageObjectsRemaining: 0 },
  productionCustomerWrites: 0, ...overrides,
});

test('an emulator smoke can never satisfy the production client gate', () => {
  const emulator = productionSmoke({ target: 'EMULATOR', project: undefined });
  const result = evaluateProductionClientSmoke(emulator);
  assert.equal(result.status, 'NOT_RUN');
  assert.ok(result.reasons.some((reason) => reason.startsWith('TARGET_NOT_PRODUCTION')));

  // The artifact actually committed in this repository is an emulator run.
  const committed = read('migration/reports/firestore-spark-client-smoke.json');
  assert.equal(committed.target, 'EMULATOR');
  assert.equal(evaluateProductionClientSmoke(committed).status, 'NOT_RUN');
});

test('a missing, wrong-project, malformed or incomplete production smoke fails closed', () => {
  assert.equal(evaluateProductionClientSmoke(null).status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke('nonsense').status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke(productionSmoke({ project: 'some-other-project' })).status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke(productionSmoke({ clientSdk: false })).status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke(productionSmoke({ generatedAt: 'not-a-date' })).status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke(productionSmoke({ categories: undefined })).status, 'NOT_RUN');
  assert.equal(evaluateProductionClientSmoke(productionSmoke({ migrationRunId: '' })).status, 'NOT_RUN');

  const missingCategory = productionSmoke();
  delete missingCategory.categories.hybridStorage;
  assert.ok(evaluateProductionClientSmoke(missingCategory).reasons.includes('CATEGORY_MISSING:hybridStorage'));

  const failedCategory = productionSmoke();
  failedCategory.categories.financial = 'FAIL';
  assert.ok(evaluateProductionClientSmoke(failedCategory).reasons.includes('CATEGORY_NOT_PASSING:financial:FAIL'));
});

test('residual synthetic data or any customer write fails the production smoke gate', () => {
  const residue = productionSmoke({ cleanup: { status: 'PASS', authUsersRemaining: 1,
    firestoreDocumentsRemaining: 0, storageObjectsRemaining: 0 } });
  assert.ok(evaluateProductionClientSmoke(residue).reasons.includes('CLEANUP_RESIDUE:authUsersRemaining:1'));

  const wrote = productionSmoke({ productionCustomerWrites: 1 });
  assert.ok(evaluateProductionClientSmoke(wrote).reasons.includes('CUSTOMER_WRITES:1'));

  const reportedFail = productionSmoke({ status: 'FAIL' });
  assert.equal(evaluateProductionClientSmoke(reportedFail).status, 'FAIL');
});

test('a complete production artifact is accepted, so the gate can be closed by real evidence', () => {
  const result = evaluateProductionClientSmoke(productionSmoke());
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.evidence.target, 'PRODUCTION');
  assert.equal(result.evidence.project, 'mydesckpro');
});
