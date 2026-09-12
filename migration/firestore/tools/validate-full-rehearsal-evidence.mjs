#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (name) => JSON.parse(readFileSync(`migration/reports/${name}.json`, 'utf8'));
const imported = json('firestore-full-import');
const reconciled = json('firestore-full-reconciliation');
const restart = json('firestore-full-restart-proof');
const negatives = json('firestore-full-negative-controls');
const storage = json('firestore-full-storage');
const security = json('firestore-full-security');
const app = json('firestore-full-application-parity');
const oracle = json('firestore-full-postgres-oracle');
const harness = json('firestore-full-harness');
const burn = json('firestore-runtime-burndown');
const indexes = JSON.parse(readFileSync('migration/firestore/rules/firestore.indexes.json', 'utf8'));
const cutover = readFileSync('migration/firestore/FIRESTORE_CUTOVER_PLAN.md', 'utf8');

assert.equal(imported.sourceSnapshot.readOnly, true);
assert.equal(imported.sourceSnapshot.sourceWritesCaused, 0);
assert.equal(imported.sourceCoverage.rows,
  imported.sourceCoverage.migrated + imported.sourceCoverage.excluded);
assert.equal(imported.sourceCoverage.unknown, 0);
assert.equal(imported.auth.accounted, imported.auth.users);
assert.equal(imported.auth.unknown, 0);
assert.equal(imported.target.productionWrites, 0);
assert.equal(imported.sizes.TOO_LARGE, 0);
assert.equal(imported.indexes.pathological, 0);
assert.equal(reconciled.status, 'RECONCILED');
for (const key of ['missingDocuments', 'unexpectedDocuments', 'canonicalMismatches', 'rawMismatches'])
  assert.equal(reconciled.coverage[key], 0, key);
assert.equal(reconciled.ids.uidMismatches, 0);
assert.equal(reconciled.ids.pkDocumentIdMismatches, 0);
assert.equal(reconciled.relationships.relationshipMismatches, 0);
assert.equal(reconciled.relationships.crossTenantReferences, 0);
assert.equal(reconciled.relationships.migrationCreatedOrphans, 0);
assert.equal(reconciled.financial.unexplainedDelta, 0);
assert.equal(reconciled.financial.derivedSummaryMismatches, 0);
assert.equal(reconciled.events.missing + reconciled.events.extra
  + reconciled.events.orderingMismatches + reconciled.events.amountMismatches, 0);
assert.equal(reconciled.timestamps.precisionLossCases, 0);
assert.equal(reconciled.json.mismatches, 0);
assert.equal(restart.status, 'PASS');
assert.equal(restart.idempotency.duplicateLedgerKeys + restart.idempotency.duplicateTargetPaths, 0);
assert.equal(negatives.detected, 18);
assert.equal(negatives.failures, 0);
assert.equal(storage.storage.missing + storage.storage.unexpected + storage.storage.shaMismatches, 0);
assert.equal(storage.storage.migrationCreatedOrphans, 0);
assert.equal(security.failed, 0);
assert.equal(app.failures, 0);
assert.equal(app.parity.search, 'BLOCKED');
assert.equal(oracle.result, 'PASS');
assert.equal(oracle.migrations.failed, 0);
assert.equal(harness.status, 'PASS');
assert.ok(harness.totals.assertionCallSites >= 528);
assert.equal(burn.total, 254);
assert.equal(Object.values(burn.classes).reduce((sum, value) => sum + value, 0), burn.total);
assert.ok(indexes.fieldOverrides.length >= 10);
for (const required of ['Write freeze', 'Final consistent snapshot and delta method', 'Auth sequencing',
  'Configuration switch and smoke test', 'Rollback and Supabase read-only period', 'Minimum IAM plan'])
  assert.match(cutover, new RegExp(required, 'i'));

console.log('Full Firestore rehearsal evidence: PASS (conservation, parity, safety, blockers and cutover design)');
