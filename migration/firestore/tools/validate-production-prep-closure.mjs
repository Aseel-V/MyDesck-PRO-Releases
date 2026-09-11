#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(`migration/reports/${name}.json`, 'utf8'));
const closure = read('firestore-production-prep-blocker-closure');
const secret = read('active-secret-regression');
const auth = read('firestore-auth-production-readiness');
const search = read('firestore-search-inventory');
const searchCorpus = read('firestore-search-full-corpus-parity');
const burn = read('firestore-runtime-burndown');
const harness = read('firestore-full-harness');
const oracle = read('firestore-full-postgres-oracle');
const reconciled = read('firestore-full-reconciliation');

assert.equal(secret.status, 'PASS');
assert.equal(secret.activeFindings, 0);
assert.equal(auth.totalUsers, auth.accounted);
assert.equal(auth.totalUsers, 10);
assert.equal(auth.unknown, 0);
assert.equal(auth.uidMismatches, 0);
assert.equal(auth.TRANSPARENT + auth.REAUTH_REQUIRED + auth.RESET_REQUIRED
  + auth.MANUAL_OPERATOR_ACTION + auth.INTENTIONALLY_EXCLUDED_WITH_JUSTIFICATION, auth.totalUsers);
assert.equal(search.counts.BLOCKED, 0);
assert.equal(Object.values(search.counts).reduce((sum, value) => sum + value, 0), search.features.length);
assert.equal(searchCorpus.status, 'PASS');
assert.equal(searchCorpus.mismatches, 0);
assert.equal(searchCorpus.sourceSnapshot.writesCaused, 0);
assert.equal(burn.unknown, 0);
assert.equal(burn.classes.BLOCKED, 0);
assert.equal(Object.values(burn.classes).reduce((sum, value) => sum + value, 0), burn.total);
assert.ok(burn.entries.every((entry) => entry.pathToZero));
assert.equal(burn.travel.firebaseNativeRuntime.total, 0);
assert.equal(burn.travel.unexplained, 0);
assert.equal(harness.status, 'PASS');
assert.equal(harness.totals.failed, 0);
assert.ok(harness.totals.assertionCallSites >= 480);
assert.equal(oracle.result, 'PASS');
assert.equal(oracle.migrations.failed, 0);
assert.equal(reconciled.status, 'RECONCILED');
assert.equal(reconciled.financial.unexplainedDelta, 0);
assert.equal(reconciled.relationships.migrationCreatedOrphans, 0);
assert.equal(closure.productionChanges.supabaseCustomerWrites, 0);
assert.equal(closure.productionChanges.firebaseCustomerWrites, 0);
assert.equal(closure.productionChanges.firebaseProductionUserImports, 0);
assert.equal(closure.decision, 'READY FOR CONTROLLED FIRESTORE PRODUCTION MIGRATION PREPARATION');

console.log('Firestore production-preparation blocker closure: PASS');
