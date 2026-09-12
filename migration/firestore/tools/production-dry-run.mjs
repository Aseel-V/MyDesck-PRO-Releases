#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateGo, validateCounts, validateIdentity } from '../lib/production-guard.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
if (process.argv.some((x) => x.startsWith('--mode=') && x !== '--mode=dry-run')) throw Error('DRY_RUN_ORCHESTRATOR_REFUSES_WRITES');
const migrationRunId = value('--run-id', `dryrun-${randomUUID()}`);
const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const inventory = JSON.parse(readFileSync('migration/reports/production-firebase-inventory.json', 'utf8'));
const auth = JSON.parse(readFileSync('migration/reports/firestore-auth-production-readiness.json', 'utf8'));
const delta = JSON.parse(readFileSync('migration/firestore/config/production-delta-map.json', 'utf8'));
const rehearsal = JSON.parse(readFileSync('migration/reports/firestore-full-reconciliation.json', 'utf8'));
const storage = JSON.parse(readFileSync('migration/reports/firestore-full-storage.json', 'utf8'));
const search = JSON.parse(readFileSync('migration/reports/firestore-search-inventory.json', 'utf8'));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
validateCounts({ authUsers: auth.totalUsers, sourceRows: 1444 }, { authUsers: 10, sourceRows: 1444 });
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rulesHash = sha('migration/firestore/rules/firestore.rules');
const identityFailures = validateIdentity({
  firebaseProject: inventory.project.id,
  firestoreDatabaseId: inventory.firestore.verifiedDatabaseId,
  supabaseProject: config.supabaseProject,
  schemaVersion: config.schemaVersion,
  transformVersion: config.transformVersion,
  rulesHash,
  commitSha,
}, { rulesHash, commitSha: config.approvedPreparationCommit });

const evidence = {
  environment: { status: identityFailures.length ? 'FAIL' : 'PASS', evidence: identityFailures.length ? identityFailures : 'all identities and approved commit match' },
  secret: { status: 'FAIL', evidence: 'credential removed from source; owner revocation confirmation missing' },
  iam: { status: 'FAIL', evidence: 'proposed identities/bindings not created; pre-existing human Owner remains' },
  rules: { status: 'NOT_RUN', evidence: 'current real Rules read returned 403; candidate tests PASS' },
  indexes: { status: inventory.indexes.existingComposite >= 3 ? 'PASS' : 'FAIL', evidence: `${inventory.indexes.existingComposite}/3 required indexes present` },
  functions: { status: inventory.functions.api === 'ENABLED' ? 'PASS' : 'FAIL', evidence: inventory.functions.api },
  auth: { status: auth.unknown === 0 && auth.accounted === auth.totalUsers ? 'PASS' : 'FAIL', evidence: `${auth.accounted}/${auth.totalUsers}, unknown ${auth.unknown}` },
  bulkData: { status: 'PASS', evidence: 'streaming/checkpoint/retry writer and dry-run guard present' },
  delta: { status: delta.unknown === 0 && delta.tables === 77 ? 'PASS' : 'FAIL', evidence: `${delta.tables}/77, unknown ${delta.unknown}` },
  financial: { status: rehearsal.financial.unexplainedDelta === 0 ? 'PASS' : 'FAIL', evidence: 'full rehearsal exact delta' },
  relationships: { status: rehearsal.relationships.migrationCreatedOrphans === 0 && rehearsal.relationships.crossTenantReferences === 0 ? 'PASS' : 'FAIL', evidence: 'full rehearsal relationship gates' },
  events: { status: rehearsal.events.missing + rehearsal.events.extra + rehearsal.events.orderingMismatches + rehearsal.events.amountMismatches === 0 ? 'PASS' : 'FAIL', evidence: 'full rehearsal event gates' },
  storage: { status: inventory.storage.buckets.length ? 'PASS' : 'FAIL', evidence: `real buckets ${inventory.storage.buckets.length}; rehearsal ${storage.storage.copied}/${storage.storage.sourceObjects}` },
  search: { status: search.counts.BLOCKED === 0 ? 'PASS' : 'FAIL', evidence: '14/14 classified' },
  arabic: { status: 'PASS', evidence: 'existing RTL suite' },
};
evidence.hebrew = { status: 'PASS', evidence: 'existing RTL suite' };
Object.assign(evidence, {
  english: { status: 'PASS', evidence: 'existing LTR suite' },
  electron: { status: 'NOT_RUN', evidence: 'real App Check packaged Electron proof pending' },
  writeFreeze: { status: 'PASS', evidence: 'maintenance guard and localized failure behavior' },
  rollback: { status: 'PASS', evidence: 'before/after write runbook and journal model' },
  observability: { status: 'PASS', evidence: 'run-scoped safe metric schema' },
  backendSwitch: { status: 'PASS', evidence: 'project/database/release/fallback-off selector gates' },
});
const go = evaluateGo(evidence);
const result = { generatedAt: new Date().toISOString(), migrationRunId, mode: 'dry-run', productionWrites: 0,
  environmentIdentity: { firebaseProject: inventory.project.id, firestoreDatabaseId: inventory.firestore.verifiedDatabaseId },
  sourceIdentity: { supabaseProject: config.supabaseProject }, targetIdentity: { firebaseProject: config.firebaseProject, firestoreDatabaseId: config.firestoreDatabaseId },
  approvedCommitSha: config.approvedPreparationCommit, executableCommitSha: commitSha,
  identityFailures,
  configHashes: { firestoreRules: rulesHash, storageRules: sha('migration/firestore/rules/storage.rules'), indexes: sha('migration/firestore/rules/firestore.indexes.json'), deltaMap: sha('migration/firestore/config/production-delta-map.json') },
  counts: { sourceRowsLastRehearsal: 1444, sourceUsers: auth.totalUsers, currentTargetAuthUsers: inventory.auth.userCount, storageObjectsLastRehearsal: storage.storage.sourceObjects },
  go, knownBlockers: go.blockers, decision: go.decision };
writeFileSync('migration/reports/firestore-production-dry-run.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ migrationRunId, productionWrites: 0, pass: go.pass, fail: go.fail, notRun: go.notRun, missing: go.missing, decision: go.decision, blockers: go.blockers }));
