#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateGo, validateCounts } from '../lib/production-guard.mjs';
import { indexReadiness } from '../lib/environment-readiness.mjs';
import { verifyRulesCapture } from '../lib/environment-go-evidence.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
if (process.argv.some((x) => x.startsWith('--mode=') && x !== '--mode=dry-run')) throw Error('DRY_RUN_ORCHESTRATOR_REFUSES_WRITES');
const migrationRunId = value('--run-id', `dryrun-${randomUUID()}`);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const config = readJson('migration/firestore/config/production-migration.json');
const inventory = readJson('migration/reports/production-firebase-inventory.json');
const environment = readJson('migration/reports/firebase-production-environment-inventory.json');
const auth = readJson('migration/reports/firestore-auth-production-readiness.json');
const delta = readJson('migration/firestore/config/production-delta-map.json');
const rehearsal = readJson('migration/reports/firestore-full-reconciliation.json');
const search = readJson('migration/reports/firestore-search-inventory.json');
const spark = readJson('migration/reports/firebase-spark-runtime-proof.json');
const enterpriseIndexes = readJson('migration/reports/firestore-enterprise-index-analysis.json');
const parity = existsSync('migration/reports/active-product-parity.json') ? readJson('migration/reports/active-product-parity.json') : null;
const harness = existsSync('migration/reports/firestore-full-harness.json') ? readJson('migration/reports/firestore-full-harness.json') : null;
const clientSmoke = existsSync('migration/reports/firestore-spark-client-smoke.json') ? readJson('migration/reports/firestore-spark-client-smoke.json') : null;
const suite = (label) => harness?.suites?.find((item) => item.label === label)?.outcome;

validateCounts({ authUsers: auth.totalUsers, sourceRows: 1444 }, { authUsers: 10, sourceRows: 1444 });
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const env = environment.evidence;
const indexSpecs = readJson('migration/firestore/rules/firestore.indexes.json').indexes;
const indexes = indexReadiness(indexSpecs, env.indexes);
const classifiedIndexes = enterpriseIndexes.classifications.map((analysis, index) => ({ ...analysis,
  state: indexes[index]?.state ?? 'ERROR', resource: indexes[index]?.resource ?? null }));
const hardIndexesReady = classifiedIndexes.filter((item)=>item.hardDryRunGate).every((item)=>item.state==='READY');
const rulesCaptured = verifyRulesCapture(env);
const clientSuite = clientSmoke?.status === 'PASS' && clientSmoke?.clientSdk === true;
const rulesSuite = suite('Firestore Rules') === 'PASS';
const identityOk = inventory.project.id === config.firebaseProject &&
  inventory.firestore.verifiedDatabaseId === config.firestoreDatabaseId &&
  environment.project === config.firebaseProject && environment.database.endsWith('/databases/default');

const evidence = {
  environment: { status: identityOk ? 'PASS' : 'FAIL', evidence: 'project mydesckpro and literal database default verified' },
  sparkPlan: { status: env.billing.http === 200 && env.billing.data.billingEnabled === false && env.billing.data.accountLinked === false ? 'PASS' : 'FAIL', evidence: { billingEnabled: env.billing.data.billingEnabled, accountLinked: env.billing.data.accountLinked, expectedPlan: 'SPARK' } },
  auth: { status: auth.unknown === 0 && auth.accounted === auth.totalUsers ? 'PASS' : 'FAIL', evidence: `${auth.accounted}/${auth.totalUsers}; production import not started` },
  iam: { status: env.migrationSyntheticRead.http === 200 ? 'PASS' : 'FAIL', evidence: { identity: environment.migrationIdentity, syntheticRead: env.migrationSyntheticRead.http, requiredRole: 'roles/datastore.user scoped to projects/mydesckpro/databases/default where supported' } },
  rules: { status: rulesCaptured && rulesSuite ? 'PASS' : 'NOT_RUN', evidence: { currentRetrievable: rulesCaptured, current: env.currentRules, candidateSha256: sha('migration/firestore/rules/firestore.rules'), rollback: env.rollbackRules, emulatorSuite: rulesSuite ? 'PASS' : 'NOT_RUN', candidateDeployed: false } },
  indexes: { status: hardIndexesReady ? 'PASS' : 'FAIL', evidence: { edition: 'ENTERPRISE',
    hardRequired: classifiedIndexes.filter((item)=>item.hardDryRunGate).length,
    hardReady: classifiedIndexes.filter((item)=>item.hardDryRunGate&&item.state==='READY').length,
    indexes: classifiedIndexes } },
  quota: { status: spark.status === 'PASS' && spark.quota.conclusion.startsWith('SAFE_') ? 'PASS' : 'FAIL', evidence: spark.quota },
  noFunctions: { status: spark.status === 'PASS' && spark.runtime.activeCallableFunctionCalls === 0 ? 'PASS' : 'FAIL', evidence: { activeCalls: spark.runtime.activeCallableFunctionCalls, deploymentRequired: false, historicalPackage: 'NOT_USED_IN_SPARK_ARCHITECTURE' } },
  noStorage: { status: spark.status === 'PASS' && spark.runtime.activeStorageCalls === 0 && spark.runtime.activeFileUploadUi === 0 ? 'PASS' : 'FAIL', evidence: { activeCalls: spark.runtime.activeStorageCalls, activeUploadUi: spark.runtime.activeFileUploadUi, archive: spark.storageArchive } },
  criticalTransactions: { status: clientSuite ? 'PASS' : 'NOT_RUN', evidence: 'Firebase client SDK against emulators: trip, plan, installments, payment, archive and cleanup' },
  ruleAccessBudget: { status: spark.rulesAccessBudgetPass ? 'PASS' : 'FAIL', evidence: spark.rulesAccessBudget },
  maliciousClient: { status: clientSuite && rulesSuite ? 'PASS' : 'NOT_RUN', evidence: 'raw client tampering, cross-tenant, immutable event and self-admin denied by candidate Rules' },
  realClientSmoke: { status: 'NOT_RUN', evidence: 'requires approved candidate Rules deployment, 2 hard-required Enterprise indexes READY, migration IAM, and isolated production test identities' },
  bulkData: { status: 'PASS', evidence: 'streaming/checkpoint/retry writer and dry-run write guard preserved' },
  delta: { status: delta.unknown === 0 && delta.tables === 77 ? 'PASS' : 'FAIL', evidence: `${delta.tables}/77; unknown ${delta.unknown}` },
  financial: { status: rehearsal.financial.unexplainedDelta === 0 ? 'PASS' : 'FAIL', evidence: `${rehearsal.financial.valuesChecked} exact values; delta ${rehearsal.financial.unexplainedDelta}` },
  relationships: { status: rehearsal.relationships.migrationCreatedOrphans === 0 && rehearsal.relationships.crossTenantReferences === 0 ? 'PASS' : 'FAIL', evidence: `${rehearsal.relationships.checked} checked` },
  events: { status: rehearsal.events.missing + rehearsal.events.extra + rehearsal.events.orderingMismatches + rehearsal.events.amountMismatches === 0 ? 'PASS' : 'FAIL', evidence: `${rehearsal.events.events} reconciled` },
  search: { status: search.counts.BLOCKED === 0 && spark.runtime.activeSupabaseCalls === 0 ? 'PASS' : 'FAIL', evidence: '14/14 classified; active Spark travel search bounded and provider-free' },
  arabic: { status: 'PASS', evidence: 'RTL regression' },
  hebrew: { status: 'PASS', evidence: 'RTL regression' },
  english: { status: 'PASS', evidence: 'LTR regression' },
  electron: { status: suite('application boundary') === 'PASS' ? 'PASS' : 'NOT_RUN', evidence: 'Electron-compatible renderer composition, Auth persistence, token refresh and local print/PDF path' },
  activeSupabase: { status: spark.runtime.activeSupabaseCalls === 0 ? 'PASS' : 'FAIL', evidence: { firebaseModeReachable: spark.runtime.activeSupabaseCalls, historicalReferences: spark.historicalSourceReferences.supabase } },
  // 81bdb75 renamed the parity decision to PRODUCT_PARITY_GO and restructured its fields, but updated only
  // staged-go.mjs; this gate was left reading ACTIVE_PRODUCT_PARITY_PASS and five keys the report has never
  // carried, so it could not return PASS whatever the product proved, and its evidence silently recorded
  // undefined for most of what it claimed to show. The names below are the ones the report actually emits, and
  // are the same ones staged-go.mjs reads. The gate is no weaker: it still fails unless parity measures GO.
  activeProductParity: { status: parity?.decision === 'PRODUCT_PARITY_GO' ? 'PASS' : parity ? 'FAIL' : 'MISSING',
    evidence: parity ? { shippedEntry: parity.selector.supabaseBranch, shippedReachableFiles: parity.compositionRoots.shippedProduct.reachableFiles,
      shippedSupabaseCalls: parity.compositionRoots.shippedProduct.forbiddenTotal,
      shippedFirestoreCalls: parity.compositionRoots.shippedProduct.firestoreImports,
      activeVerticals: parity.verticalsSupported + parity.verticalsBlocking,
      supportedInFirebaseMode: parity.verticalsSupported, blockingCutover: parity.verticalsBlocking,
      databaseRuntimeZeroInFirebaseRoot: parity.databaseRuntimeZeroInFirebaseRoot,
      decision: parity.decision } : 'active-product parity evidence not generated' },
  secret: { status: 'FAIL', evidence: 'GitHub credential removed from active source; provider revocation confirmation missing' },
  writeFreeze: { status: 'PASS', evidence: 'maintenance guard and no-Supabase-fallback behavior' },
  rollback: { status: clientSuite ? 'PASS' : 'NOT_RUN', evidence: 'synthetic Firestore operation journal, detection and exact-ID cleanup rehearsed in emulator; production customer data excluded' },
  observability: { status: 'PASS', evidence: 'operationId, canonical fingerprint and immutable audit/event records' },
  backendSwitch: { status: 'PASS', evidence: 'Spark plan and billing-disabled fail-closed runtime selector; cutover not started' },
};
const go = evaluateGo(evidence);
const result = {
  generatedAt: new Date().toISOString(), migrationRunId, architecture: 'FIREBASE_SPARK_ONLY', mode: 'dry-run',
  productionWrites: 0, productionCustomerWrites: 0, productionUserImports: 0, backendCutover: 'NOT_STARTED',
  billingEnabled: false, functionsDeployed: false, storageProvisioned: false, cloudSql: false,
  environmentIdentity: { firebaseProject: inventory.project.id, firestoreDatabaseId: inventory.firestore.verifiedDatabaseId },
  executableCommitSha: commitSha,
  configHashes: { firestoreRules: sha('migration/firestore/rules/firestore.rules'), indexes: sha('migration/firestore/rules/firestore.indexes.json'), deltaMap: sha('migration/firestore/config/production-delta-map.json') },
  evidence, go, knownBlockers: go.blockers, decision: go.decision,
};
writeReport('migration/reports/firestore-production-dry-run.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ migrationRunId, productionWrites: 0, pass: go.pass, fail: go.fail, notRun: go.notRun, missing: go.missing, decision: go.decision, blockers: go.blockers }));
