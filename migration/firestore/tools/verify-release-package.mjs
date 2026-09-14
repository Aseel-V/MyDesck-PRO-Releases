#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SPARK_UNUSED = 'NOT_USED_IN_SPARK_ARCHITECTURE';
const manifest = JSON.parse(readFileSync('migration/firestore/release/production-release-manifest.json', 'utf8'));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

assert.equal(manifest.architecture, 'FIREBASE_SPARK_ONLY');
assert.equal(manifest.firebaseProject, 'mydesckpro');
assert.equal(manifest.firestoreDatabaseId, 'default');

// Spark deploys Rules only. Storage and Functions must never appear in the deploy surface,
// and indexes are created one at a time from the reviewed plan, not by a bulk deploy.
assert.match(manifest.deployment.command, /firebase\.production\.json/);
assert.match(manifest.deployment.command, /--only firestore:rules(?:\s|$)/);
assert.doesNotMatch(manifest.deployment.command, /storage|functions|database|hosting/);
assert.equal(manifest.deployment.storageAndFunctions, 'NOT_DEPLOYED_NOT_USED_IN_SPARK_ARCHITECTURE');
assert.equal(manifest.deployment.packageCommand, undefined);
const productionConfig = JSON.parse(readFileSync('migration/firestore/firebase.production.json', 'utf8'));
assert.deepEqual(Object.keys(productionConfig), ['firestore']);

// Security-critical artifacts must match byte-for-byte; drift refuses the release.
assert.equal(sha('migration/firestore/rules/firestore.rules'), manifest.candidateHashes.firestoreRules);
assert.equal(sha('migration/firestore/rules/firestore.indexes.json'), manifest.candidateHashes.firestoreIndexes);
assert.equal(manifest.candidateHashes.storageRules, SPARK_UNUSED);
assert.equal(manifest.candidateHashes.productionFunctionsEntrypoint, SPARK_UNUSED);

const unresolved = (value) => value.startsWith('UNREADABLE') || value.startsWith('PENDING');
const currentReady = !Object.values(manifest.expectedCurrentProductionHashes).some(unresolved);
const rollbackReady = !Object.values(manifest.rollbackArtifacts).some(unresolved);
if (!unresolved(manifest.rollbackArtifacts.firestoreRules)) {
  assert.equal(sha(manifest.rollbackArtifacts.firestoreRules), manifest.expectedCurrentProductionHashes.firestoreRules);
}
console.log(JSON.stringify({ architecture: manifest.architecture, candidateHashes: 'PASS',
  currentBaseline: currentReady ? 'PASS' : 'NOT_RUN', rollbackArtifacts: rollbackReady ? 'PASS' : 'NOT_RUN',
  decision: currentReady && rollbackReady ? 'GO' : 'NO_GO' }));
if (!currentReady || !rollbackReady) process.exitCode = 2;
