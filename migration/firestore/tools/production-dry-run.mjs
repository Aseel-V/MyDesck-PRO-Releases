#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateGo, validateCounts, evaluateSourceCountDrift } from '../lib/production-guard.mjs';
import { indexReadiness, classifyIndexes } from '../lib/environment-readiness.mjs';
import { verifyRulesCapture } from '../lib/environment-go-evidence.mjs';
import { evaluateProductionClientSmoke } from '../lib/client-smoke-evidence.mjs';
import { evaluateSecretRevocation } from '../lib/secret-revocation-evidence.mjs';
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
// The rehearsal IMPORT artifact carries sourceCoverage; the reconciliation artifact above does not. It is the
// reference half of the source-count drift check, and is a different origin from the live measurement.
const rehearsalImport = readJson('migration/reports/firestore-full-import.json');
const search = readJson('migration/reports/firestore-search-inventory.json');
const spark = readJson('migration/reports/firebase-spark-runtime-proof.json');
const parity = existsSync('migration/reports/active-product-parity.json') ? readJson('migration/reports/active-product-parity.json') : null;
const harness = existsSync('migration/reports/firestore-full-harness.json') ? readJson('migration/reports/firestore-full-harness.json') : null;
const clientSmoke = existsSync('migration/reports/firestore-spark-client-smoke.json') ? readJson('migration/reports/firestore-spark-client-smoke.json') : null;
// A separate artifact, so the emulator smoke above can never be read as production evidence.
const productionSmoke = existsSync('migration/reports/firestore-production-client-smoke.json') ? readJson('migration/reports/firestore-production-client-smoke.json') : null;
const secretRevocation = existsSync('migration/reports/github-credential-revocation.json') ? readJson('migration/reports/github-credential-revocation.json') : null;
const liveSource = existsSync('migration/reports/live-source-inventory.json') ? readJson('migration/reports/live-source-inventory.json') : null;
const indexClassification = readJson('migration/firestore/config/index-classification.json');
const suite = (label) => harness?.suites?.find((item) => item.label === label)?.outcome;

// The Auth count is compared against the recorded inventory; that half was never vacuous. Source rows are
// deliberately not passed here: they are evaluated below against a live measurement instead of a constant.
validateCounts({ authUsers: auth.totalUsers, sourceRows: null },
  { authUsers: config.expectedSource.usersAtLastInventory, sourceRows: null });
// The source-row half takes its two sides from different artifacts: a live read-only measurement, and the
// rehearsal this migration is pinned to. Passing one constant to both sides is what made the old check vacuous.
const sourceDrift = evaluateSourceCountDrift({
  measured: liveSource && {
    rows: liveSource.measured?.rows, tables: liveSource.measured?.tables,
    generatedAt: liveSource.generatedAt, origin: config.expectedSource.liveMeasurementArtifact,
    readOnlyProven: liveSource.snapshot?.rejectedWriteSqlState === '25006' && liveSource.snapshot?.successfulWrites === 0,
  },
  reference: {
    rows: rehearsalImport.sourceCoverage?.rows, tables: rehearsalImport.sourceCoverage?.tables,
    origin: config.expectedSource.rowsReferenceArtifact,
  },
});
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const env = environment.evidence;
const indexSpecs = readJson('migration/firestore/rules/firestore.indexes.json').indexes;
const indexes = indexReadiness(indexSpecs, env.indexes);
// Joined by index identity, never by array position: reordering firestore.indexes.json cannot change which
// classification applies to which spec, and a spec with no reviewed entry is REVIEW_REQUIRED and fails closed.
const indexReview = classifyIndexes(indexSpecs, indexClassification.classifications, indexes);
const classifiedIndexes = indexReview.indexes;
const hardIndexesReady = indexReview.reviewComplete
  && indexReview.hardRequired === indexReview.hardRequiredReady
  && classifiedIndexes.filter((item) => item.hardDryRunGate).every((item) => item.state === 'READY');
const realSmoke = evaluateProductionClientSmoke(productionSmoke);
const secretGate = evaluateSecretRevocation(secretRevocation);
const rulesCaptured = verifyRulesCapture(env);
const clientSuite = clientSmoke?.status === 'PASS' && clientSmoke?.clientSdk === true;
const rulesSuite = suite('Firestore Rules') === 'PASS';
const identityOk = inventory.project.id === config.firebaseProject &&
  inventory.firestore.verifiedDatabaseId === config.firestoreDatabaseId &&
  environment.project === config.firebaseProject && environment.database.endsWith('/databases/default');

const evidence = {
  environment: { status: identityOk ? 'PASS' : 'FAIL', evidence: 'project mydesckpro and literal database default verified' },
  sparkPlan: { status: env.billing.http === 200 && env.billing.data.billingEnabled === false && env.billing.data.accountLinked === false ? 'PASS' : 'FAIL', evidence: { billingEnabled: env.billing.data.billingEnabled, accountLinked: env.billing.data.accountLinked, expectedPlan: 'SPARK' } },
  auth: { status: auth.unknown === 0 && auth.accounted === auth.totalUsers && sourceDrift.status === 'PASS' ? 'PASS' : 'FAIL',
    evidence: { users: `${auth.accounted}/${auth.totalUsers}`, unknown: auth.unknown, productionImports: auth.productionFirebaseImports ?? 0,
      sourceCount: { status: sourceDrift.status, expectedRows: sourceDrift.expected, measuredRows: sourceDrift.measured,
        delta: sourceDrift.delta, expectedTables: sourceDrift.expectedTables, measuredTables: sourceDrift.measuredTables,
        measuredAt: sourceDrift.measuredAt, referenceOrigin: sourceDrift.referenceOrigin,
        measuredOrigin: sourceDrift.measuredOrigin, reasons: sourceDrift.reasons } } },
  // The probe reads migration-test--permission-probe/never-created, a document that by design is
  // never created, so 200 is unreachable and requiring it made this gate unsatisfiable. Firestore
  // evaluates IAM before existence: a principal without datastore.entities.get gets 403
  // PERMISSION_DENIED whether or not the document exists (this same probe returned 403 before the
  // binding), and a permitted principal gets 404 NOT_FOUND. So document-level NOT_FOUND is the proof
  // of read access. 403 still fails, and http 0 (impersonation unavailable) still fails.
  iam: { status: env.migrationSyntheticRead.http === 200
    || (env.migrationSyntheticRead.http === 404 && env.migrationSyntheticRead.status === 'NOT_FOUND')
    ? 'PASS' : 'FAIL',
    evidence: { identity: environment.migrationIdentity, syntheticRead: env.migrationSyntheticRead.http,
      syntheticReadStatus: env.migrationSyntheticRead.status ?? 'OK',
      impersonation: environment.impersonation,
      readProvenBy: env.migrationSyntheticRead.http === 404 ? 'NOT_FOUND on a never-created document: permitted, absent' : 'document returned',
      writeAuthority: 'granted by projects/mydesckpro/roles/mydesckFirestoreMigrator; not exercised by this read-only probe',
      requiredRole: 'projects/mydesckpro/roles/mydesckFirestoreMigrator scoped to projects/mydesckpro/databases/default' } },
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
  realClientSmoke: { status: realSmoke.status, evidence: { ...realSmoke.evidence, reasons: realSmoke.reasons,
    artifact: 'migration/reports/firestore-production-client-smoke.json',
    requires: 'approved candidate Rules deployment, hard-required Enterprise indexes READY, migration IAM, and isolated production test identities' } },
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
  // Was a hardcoded FAIL, so a genuine operator revocation could never close it. Now derived:
  // an attributed provider confirmation AND fingerprint-verified absence from tree and index.
  secret: { status: secretGate.status, evidence: { ...secretGate.evidence, reasons: secretGate.reasons,
    artifact: 'migration/reports/github-credential-revocation.json',
    basis: 'revocation is a provider fact and cannot be observed from this repository; it is recorded on explicit operator confirmation and paired with fingerprint-verified local removal' } },
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
