#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('migration/firestore/release/production-release-manifest.json', 'utf8'));
assert.equal(manifest.deployment.packageCommand, 'node migration/firestore/tools/build-production-functions-package.mjs');
assert.match(manifest.deployment.command, /firebase\.production\.json/);
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(manifest.firebaseProject, 'mydesckpro');
assert.equal(manifest.firestoreDatabaseId, 'default');
assert.equal(sha('migration/firestore/rules/firestore.rules'), manifest.candidateHashes.firestoreRules);
assert.equal(sha('migration/firestore/rules/storage.rules'), manifest.candidateHashes.storageRules);
assert.equal(sha('migration/firestore/rules/firestore.indexes.json'), manifest.candidateHashes.firestoreIndexes);
assert.equal(sha('migration/firestore/functions/production-index.mjs'), manifest.candidateHashes.productionFunctionsEntrypoint);
const currentReady = !Object.values(manifest.expectedCurrentProductionHashes).some((x) => x.startsWith('UNREADABLE'));
const rollbackReady = !Object.values(manifest.rollbackArtifacts).some((x) => x.startsWith('PENDING'));
if (!manifest.rollbackArtifacts.firestoreRules.startsWith('PENDING')) {
  assert.equal(sha(manifest.rollbackArtifacts.firestoreRules), manifest.expectedCurrentProductionHashes.firestoreRules);
}
console.log(JSON.stringify({ candidateHashes: 'PASS', currentBaseline: currentReady ? 'PASS' : 'NOT_RUN',
  rollbackArtifacts: rollbackReady ? 'PASS' : 'NOT_RUN', decision: currentReady && rollbackReady ? 'GO' : 'NO_GO' }));
if (!currentReady || !rollbackReady) process.exitCode = 2;
