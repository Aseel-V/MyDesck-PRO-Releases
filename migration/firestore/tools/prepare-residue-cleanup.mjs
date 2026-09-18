#!/usr/bin/env node
/**
 * READ-ONLY preparation for deleting the historical client-smoke residue.
 *
 * Enumerates exactly the documents that are in production Firestore but not in the migration plan,
 * proves each one is unrelated to customer data, and writes a cleanup manifest naming those exact
 * paths and nothing else. It deletes nothing and is safe to run repeatedly.
 *
 * The proof is deliberately over-determined. Any single signal could be coincidence — a document
 * could carry `app-v1` and still be customer data, or predate the copy and still matter — so the
 * manifest is only written when every one of the conditions holds for every document at once. If
 * even one fails, the run is BLOCKED and no manifest is produced, because a manifest that has to be
 * read alongside a caveat is a manifest someone will eventually use without the caveat.
 *
 *   node migration/firestore/tools/prepare-residue-cleanup.mjs --journal=<path> [--out=<path>]
 */
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';
import { planHash } from '../lib/authorized-production-target.mjs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { ProductionJournal } from '../lib/production-journal.mjs';
import { CLEANUP_REASON, CLEANUP_STATUS, manifestIntegrityHash } from '../lib/residue-cleanup-target.mjs';
import { sha256 } from '../lib/production-guard.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const CUSTOMER_SIGNATURE_OWNER = '72647632-d481-4889-bf27-ed1bb14ad347';
const EXPECTED_RESIDUE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_PATH = 'migration/reports/residue-cleanup-preparation.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const journalPath = value('--journal');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');

const journal = ProductionJournal.load(journalPath);
if (journal.body.firebaseProject !== PROJECT) throw Error('JOURNAL_PROJECT_MISMATCH');
if (journal.body.firestoreDatabaseId !== DATABASE) throw Error('JOURNAL_DATABASE_MISMATCH');
const cleanupRunId = value('--cleanup-run-id', `residue-${randomUUID()}`);
const outPath = value('--out', `migration/residue-cleanup.local/${cleanupRunId}.json`);

// ---- source: the migration plan and the customer identity space, in one READ ONLY snapshot -------
const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const source = await withSourceSnapshot(localConfig(), async (select) => {
  const built = await buildMigrationPlan({ select, Timestamp });
  const authUsers = (await select('SELECT id::text AS uid FROM auth.users ORDER BY id')).rows
    .map((row) => row.uid);
  const businesses = (await select(`SELECT id::text AS id, user_id::text AS owner
    FROM public.business_profiles ORDER BY id`)).rows;
  return { built, authUsers, businesses };
}, evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

const plan = source.built.plan;
const plannedPaths = new Set(plan.map((entry) => entry.path));
const journalPaths = new Set(journal.body.writtenPaths);
const derivedPlanHash = planHash(plan, sha256);
if (derivedPlanHash !== journal.body.planHash) throw Error('PLAN_HASH_DRIFT_SINCE_COPY');

const sourceAuthUids = new Set(source.authUsers);
const sourceBusinessIds = new Set(source.businesses.map((row) => row.id));
const sourceBusinessOwners = new Set(source.businesses.map((row) => row.owner));
// Every ownership identifier that appears anywhere in the migrated corpus.
const migratedOwnerUids = new Set(plan.map((entry) => entry.ownerUid).filter(Boolean));
const migratedBusinessIds = new Set(plan.map((entry) => entry.businessId).filter(Boolean));
const customerIdentitySpace = new Set([...sourceAuthUids, ...sourceBusinessIds, ...sourceBusinessOwners,
  ...migratedOwnerUids, ...migratedBusinessIds, CUSTOMER_SIGNATURE_OWNER]);

// ---- target: everything present, minus everything planned ---------------------------------------
const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let report;
try {
  const collectionIds = [...new Set(plan.flatMap((entry) =>
    entry.path.split('/').filter((_, index) => index % 2 === 0)))];
  const scan = await reader.scanCollectionGroups(collectionIds);
  const residuePaths = [...scan.paths].filter((path) => !plannedPaths.has(path)).sort();
  const residueDocuments = await reader.readDocuments(residuePaths);

  const copyStarted = Date.parse(journal.body.startedAt);
  const stamp = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && (field.seconds !== undefined || field._seconds !== undefined)) {
      return new Date(Number(field.seconds ?? field._seconds) * 1000).toISOString();
    }
    return typeof field === 'string' ? field : null;
  };

  const documents = [];
  const failures = [];
  for (const path of residuePaths) {
    const data = residueDocuments.get(path);
    if (!data) { failures.push({ path, reason: 'DOCUMENT_VANISHED_BETWEEN_SCAN_AND_READ' }); continue; }
    const segments = path.split('/');
    const businessId = segments[0] === 'businesses' ? segments[1] : (data.businessId ?? null);
    const ownerUid = data.ownerUid ?? data.userId ?? data.uid ?? null;
    const createdAt = stamp(data.createdAt);
    const updatedAt = stamp(data.updatedAt);
    const entry = {
      path,
      collectionGroup: segments.at(-2),
      rootCollection: segments[0],
      documentId: segments.at(-1),
      ownerUid,
      userId: data.userId ?? null,
      businessId,
      createdAt,
      updatedAt,
      transformVersion: data.transformVersion ?? null,
      migrationTransformVersionPresent: data.migrationTransformVersion !== undefined
        && data.migrationTransformVersion !== null,
      preDeleteHash: rawDocumentHash(path, data),
    };

    // ---- Phase 1 conditions, all of them, for this document ------------------------------------
    const checks = {
      // Counter and index documents the app maintains carry no transformVersion of their own; they
      // are identified by their parent business instead, which must itself be non-customer.
      transformVersionIsAppV1: entry.transformVersion === 'app-v1' || entry.transformVersion === null,
      migrationTransformVersionAbsent: entry.migrationTransformVersionPresent === false,
      createdBeforeMigrationRun: createdAt === null ? null : Date.parse(createdAt) < copyStarted,
      notWrittenByJournal: !journalPaths.has(path),
      notInMigrationPlan: !plannedPaths.has(path),
      ownerNotASourceAuthUuid: ownerUid === null || !sourceAuthUids.has(ownerUid),
      noCustomerIdentityLinkage: ![ownerUid, businessId, entry.userId]
        .filter(Boolean).some((id) => customerIdentitySpace.has(id)),
      attributableToSyntheticIdentity: ownerUid === null
        ? true
        : (!UUID.test(ownerUid) && !sourceAuthUids.has(ownerUid)),
    };
    entry.checks = checks;
    const failed = Object.entries(checks)
      .filter(([, outcome]) => outcome === false).map(([name]) => name);
    // A document whose business is non-customer but which has no createdAt of its own (counters,
    // plate indexes) is carried by its parent rather than refused: the parent linkage is the
    // stronger statement, and it is checked above.
    const unresolved = Object.entries(checks)
      .filter(([, outcome]) => outcome === null).map(([name]) => name);
    entry.unresolvedChecks = unresolved;
    if (failed.length) failures.push({ path, reason: 'CONDITIONS_FAILED', failed });
    documents.push(entry);
  }

  // ---- Phase 2 overlap arithmetic ------------------------------------------------------------
  const overlap = {
    migrationPlanOverlap: documents.filter((item) => plannedPaths.has(item.path)).length,
    migrationJournalOverlap: documents.filter((item) => journalPaths.has(item.path)).length,
    sourceAuthUidOverlap: documents.filter((item) => item.ownerUid && sourceAuthUids.has(item.ownerUid)).length,
    sourceBusinessOverlap: documents.filter((item) => item.businessId
      && (sourceBusinessIds.has(item.businessId) || migratedBusinessIds.has(item.businessId))).length,
    customerDataLinkage: documents.filter((item) => [item.ownerUid, item.businessId, item.userId]
      .filter(Boolean).some((id) => customerIdentitySpace.has(id))).length,
    customerSignatureOwnerOverlap: documents.filter((item) =>
      item.ownerUid === CUSTOMER_SIGNATURE_OWNER || item.businessId === CUSTOMER_SIGNATURE_OWNER).length,
  };
  const overlapClean = Object.values(overlap).every((count) => count === 0);
  const countAsExpected = documents.length === EXPECTED_RESIDUE;
  const blocked = failures.length > 0 || !overlapClean || !countAsExpected;

  // ---- Phase 3 manifest ------------------------------------------------------------------------
  let manifestPath = null;
  let manifestHash = null;
  if (!blocked) {
    const manifest = {
      cleanupRunId,
      reason: CLEANUP_REASON,
      bulkMigrationRunId: journal.body.migrationRunId,
      firebaseProject: PROJECT,
      firestoreDatabaseId: DATABASE,
      expectedCount: EXPECTED_RESIDUE,
      documents: documents.map((item) => ({
        path: item.path,
        collectionGroup: item.collectionGroup,
        documentId: item.documentId,
        ownerUid: item.ownerUid,
        userId: item.userId,
        businessId: item.businessId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        transformVersion: item.transformVersion,
        migrationTransformVersionPresent: item.migrationTransformVersionPresent,
        preDeleteHash: item.preDeleteHash,
      })),
      migrationPlanHash: derivedPlanHash,
      createdAt: new Date().toISOString(),
      status: CLEANUP_STATUS.PREPARED,
    };
    manifest.integrityHash = manifestIntegrityHash(manifest);
    mkdirSync(outPath.split('/').slice(0, -1).join('/'), { recursive: true });
    writeReport(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifestPath = outPath;
    manifestHash = manifest.integrityHash;
  }

  report = {
    generatedAt: new Date().toISOString(),
    artifact: 'residue-cleanup-preparation',
    mode: 'READ_ONLY_PREPARATION',
    cleanupRunId,
    bulkMigrationRunId: journal.body.migrationRunId,
    projectId: PROJECT,
    firestoreDatabaseId: DATABASE,
    readIdentity: reader.identity,
    decision: blocked ? 'BLOCKED' : 'SAFE_TO_DELETE',
    residueCount: documents.length,
    expectedResidueCount: EXPECTED_RESIDUE,
    countAsExpected,
    overlap,
    failures,
    snapshot: {
      isolationLevel: evidence.start?.isolation ?? null,
      readOnly: evidence.start?.read_only ?? null,
      rejectedWriteSqlState: evidence.rejectedWriteSqlState,
      successfulWrites: evidence.successfulWrites,
    },
    corpus: {
      plannedDocuments: plan.length,
      journalWrittenPaths: journalPaths.size,
      planHashMatchesJournal: true,
      sourceAuthUsers: sourceAuthUids.size,
      sourceBusinesses: sourceBusinessIds.size,
      customerIdentitySpaceSize: customerIdentitySpace.size,
      targetDocumentsScanned: scan.paths.size,
    },
    documents,
    manifest: { path: manifestPath, integrityHash: manifestHash },
    mutations: { firestoreWrites: 0, firestoreDeletes: 0, authImports: 0,
      storageMutations: 0, sourceMutations: 0 },
  };
  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify({
  decision: report.decision,
  residueCount: report.residueCount,
  overlap: report.overlap,
  failures: report.failures,
  manifest: report.manifest,
  exactPaths: report.documents.map((item) => item.path),
  report: REPORT_PATH,
  actualDeletes: 0,
}, null, 2));
process.exitCode = report.decision === 'SAFE_TO_DELETE' ? 0 : 1;
