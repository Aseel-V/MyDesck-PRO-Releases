#!/usr/bin/env node
/**
 * Withdraw the derived Firestore documents belonging to operator-excluded auth identities.
 *
 * These three documents are different from the smoke residue: the migration wrote them, correctly,
 * under the rules in force at the time. An operator decision has since excluded the identities
 * behind them, which makes the documents unwanted rather than wrong — so this is a withdrawal, and
 * the tooling says so rather than filing it under cleanup.
 *
 * Four independent conditions have to agree before a path is eligible, and all four are derived
 * here rather than read from an argument:
 *
 *   1. the identity's fingerprint appears in `config/excluded-auth-identities.json`
 *   2. the document is auth-derived — it exists only because the identity had no source profile row
 *   3. the copy journal records this run as having written that exact path
 *   4. the path is NOT in the current post-exclusion plan, which is the set that must survive
 *
 * Condition 4 is what the delete boundary enforces as its forbidden set, so the 1,474 documents that
 * are still supposed to exist are structurally unreachable from this command.
 *
 * The journal is amended additively. `writtenPaths` still says the copy wrote 1,477 documents,
 * because it did; the withdrawal is recorded alongside it. Editing the history to match the later
 * decision would erase the only evidence that the decision was ever applied.
 *
 *   node migration/firestore/tools/withdraw-excluded-auth-documents.mjs \
 *     --journal=<path> --ack=I_ACKNOWLEDGE_MYDESCK_FIRESTORE_DERIVED_DOCUMENT_WITHDRAWAL \
 *     [--validate-only]
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan, loadExcludedAuthIdentities } from '../lib/migration-plan.mjs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { ProductionJournal, JOURNAL_STATUS } from '../lib/production-journal.mjs';
import { openResidueCleanupTarget, WITHDRAWAL_REASON, CLEANUP_STATUS, manifestIntegrityHash }
  from '../lib/residue-cleanup-target.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const WITHDRAWAL_ACK = 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_DERIVED_DOCUMENT_WITHDRAWAL';
const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const REPORT_PATH = 'migration/reports/firestore-derived-document-withdrawal.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const journalPath = value('--journal');
const acknowledgement = value('--ack');
const validateOnly = process.argv.includes('--validate-only');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');
if (acknowledgement !== WITHDRAWAL_ACK) throw Error('WITHDRAWAL_ACKNOWLEDGEMENT_REQUIRED');

const journal = ProductionJournal.load(journalPath);
if (journal.body.firebaseProject !== PROJECT) throw Error('JOURNAL_PROJECT_MISMATCH');
if (journal.body.firestoreDatabaseId !== DATABASE) throw Error('JOURNAL_DATABASE_MISMATCH');
if (![JOURNAL_STATUS.RECONCILED, JOURNAL_STATUS.COPY_COMPLETE].includes(journal.status)) {
  throw Error(`WITHDRAWAL_REQUIRES_COMPLETED_COPY:${journal.status}`);
}

const excludedConfig = loadExcludedAuthIdentities();
if (excludedConfig.fingerprints.size === 0) throw Error('NO_EXCLUDED_IDENTITIES_CONFIGURED');

// ---- derive the plan and the exclusion list from the live source ---------------------------------
const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const built = await withSourceSnapshot(localConfig(), async (select) =>
  buildMigrationPlan({ select, Timestamp }), evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

const survivingPaths = new Set(built.plan.map((entry) => entry.path));
const writtenPaths = new Set(journal.body.writtenPaths);
const alreadyWithdrawn = new Set(journal.withdrawnPaths);

const candidates = built.excludedAuthIdentities.filter((item) => !alreadyWithdrawn.has(item.targetPath));
const faults = [];
for (const item of candidates) {
  if (!excludedConfig.fingerprints.has(item.uidFingerprint)) faults.push(`NOT_IN_CONFIG:${item.uidFingerprint}`);
  if (item.hasSourceProfile) faults.push(`IDENTITY_HAS_SOURCE_PROFILE:${item.uidFingerprint}`);
  if (!writtenPaths.has(item.targetPath)) faults.push(`NOT_WRITTEN_BY_THIS_RUN:${item.uidFingerprint}`);
  if (survivingPaths.has(item.targetPath)) faults.push(`STILL_IN_CURRENT_PLAN:${item.uidFingerprint}`);
}
// Nothing in the source may reference an excluded identity; if anything does, the plan reports it
// as a source orphan and the withdrawal is unsafe.
if (built.sourceOrphans !== 0) faults.push(`EXCLUSION_CREATES_SOURCE_ORPHANS:${built.sourceOrphans}`);
if (faults.length) throw Error(`WITHDRAWAL_REFUSED:${faults.join(',')}`);

const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let manifest;
let present;
try {
  present = await reader.readDocuments(candidates.map((item) => item.targetPath));
  manifest = {
    cleanupRunId: `withdrawal-${randomUUID()}`,
    reason: WITHDRAWAL_REASON,
    bulkMigrationRunId: journal.body.migrationRunId,
    firebaseProject: PROJECT,
    firestoreDatabaseId: DATABASE,
    operatorDecision: excludedConfig.decision,
    operatorDecidedAt: excludedConfig.decidedAt,
    expectedCount: candidates.length,
    documents: candidates.map((item) => {
      const data = present.get(item.targetPath);
      if (!data) throw Error(`WITHDRAWAL_DOCUMENT_ABSENT:${item.uidFingerprint}`);
      return {
        path: item.targetPath,
        uidFingerprint: item.uidFingerprint,
        documentId: item.targetPath.split('/').at(-1),
        derived: true,
        migrationAuthOnly: data.migrationAuthOnly === true,
        preDeleteHash: rawDocumentHash(item.targetPath, data),
      };
    }),
    createdAt: new Date().toISOString(),
    status: CLEANUP_STATUS.PREPARED,
  };
  manifest.integrityHash = manifestIntegrityHash(manifest);
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  throw error;
}

// Every auth-derived document should be exactly that; if one is not, the set is not what it claims.
const notAuthOnly = manifest.documents.filter((item) => !item.migrationAuthOnly);
if (notAuthOnly.length) throw Error(`WITHDRAWAL_DOCUMENT_NOT_AUTH_DERIVED:${notAuthOnly.length}`);

// ---- the delete boundary, with the surviving plan as its forbidden set ---------------------------
const target = await openResidueCleanupTarget({
  manifest, projectId: PROJECT, databaseId: DATABASE,
  forbiddenPaths: survivingPaths, expectedCount: candidates.length,
  allowedReasons: [WITHDRAWAL_REASON],
});

let report;
try {
  const verified = [];
  const problems = [];
  for (const document of manifest.documents) {
    try { verified.push(await target.verifyManifestDocument(document.path)); }
    catch (error) { problems.push({ path: document.path, code: error?.code ?? null }); }
  }
  const authorized = problems.length === 0 && verified.length === candidates.length;
  const summary = {
    generatedAt: new Date().toISOString(),
    artifact: 'firestore-derived-document-withdrawal',
    cleanupRunId: manifest.cleanupRunId,
    bulkMigrationRunId: journal.body.migrationRunId,
    projectId: target.projectId,
    firestoreDatabaseId: target.databaseId,
    identity: target.identity,
    operatorDecision: excludedConfig.decision,
    reason: WITHDRAWAL_REASON,
    manifestIntegrity: 'VERIFIED',
    manifestIntegrityHash: manifest.integrityHash,
    excludedIdentities: manifest.documents.map((item) => item.uidFingerprint),
    expectedWithdrawals: candidates.length,
    matchedWithdrawals: verified.length,
    survivingPlanDocuments: survivingPaths.size,
    copyWrittenDocuments: writtenPaths.size,
    survivingPlanOverlap: 0,
    sourceOrphansAfterExclusion: built.sourceOrphans,
    problems,
    state: authorized ? 'WITHDRAWAL_AUTHORIZED' : 'WITHDRAWAL_REFUSED',
  };

  if (!authorized) {
    report = { ...summary, actualDeletes: 0, status: CLEANUP_STATUS.PREPARED };
    writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await target.close();
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (validateOnly) {
    report = { ...summary, validateOnly: true, actualDeletes: 0, status: CLEANUP_STATUS.PREPARED,
      stoppedBefore: 'deleteManifestDocument — no document was deleted' };
    writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await target.close();
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const deleted = [];
  const failures = [];
  for (const document of manifest.documents) {
    try { deleted.push((await target.deleteManifestDocument(document.path)).path); }
    catch (error) { failures.push({ path: document.path, code: error?.code ?? null }); break; }
  }
  const absence = [];
  for (const path of deleted) absence.push(await target.confirmAbsent(path));

  let journalResult = null;
  if (deleted.length) {
    journalResult = journal.recordAuthorizedWithdrawal({
      paths: deleted, reason: WITHDRAWAL_REASON,
      decidedAt: excludedConfig.decidedAt, cleanupRunId: manifest.cleanupRunId,
    });
  }

  report = {
    ...summary,
    status: failures.length ? CLEANUP_STATUS.PARTIAL_FAILURE : CLEANUP_STATUS.COMPLETE,
    actualDeletes: deleted.length,
    deletedPaths: deleted,
    failures,
    confirmedAbsent: absence.filter((item) => item.absent).length,
    journal: journalResult,
    journalStatus: journal.status,
    mutations: { firestoreDeletes: deleted.length, firestoreWrites: 0, authImports: 0,
      storageMutations: 0, sourceMutations: 0 },
  };
  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await target.close();
} catch (error) {
  await target.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === CLEANUP_STATUS.COMPLETE ? 0 : 1;
