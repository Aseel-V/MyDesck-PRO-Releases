#!/usr/bin/env node
/**
 * Delete the historical client-smoke residue named in a cleanup manifest. Nothing else, ever.
 *
 * Separate from the migration executor and from rollback, because it is a separate decision with a
 * separate blast radius. It has its own acknowledgement, its own manifest, and a boundary
 * (`residue-cleanup-target.mjs`) that cannot express a wildcard, a collection, a query or a prefix.
 *
 * The migration plan and the copy journal are both re-derived here rather than trusted from the
 * manifest, and their union becomes the forbidden set. That is what makes "no migrated document can
 * be deleted by this tool" a structural property instead of a promise: the plan comes from the live
 * source, the journal verifies its own integrity hash, and any manifest path appearing in either
 * aborts the run before the connection is even used.
 *
 *   node migration/firestore/tools/residue-cleanup.mjs \
 *     --manifest=<path> --journal=<path> \
 *     --ack=I_ACKNOWLEDGE_MYDESCK_FIRESTORE_RESIDUE_DELETION [--validate-only]
 */
import { readFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';
import { planHash } from '../lib/authorized-production-target.mjs';
import { ProductionJournal } from '../lib/production-journal.mjs';
import { openResidueCleanupTarget, CLEANUP_STATUS } from '../lib/residue-cleanup-target.mjs';
import { sha256 } from '../lib/production-guard.mjs';

const CLEANUP_ACK = 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_RESIDUE_DELETION';
const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const EXPECTED_RESIDUE = 30;
const REPORT_PATH = 'migration/reports/residue-cleanup-execution.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const manifestPath = value('--manifest');
const journalPath = value('--journal');
const acknowledgement = value('--ack');
const validateOnly = process.argv.includes('--validate-only');

if (!manifestPath) throw Error('CLEANUP_MANIFEST_REQUIRED');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');
if (acknowledgement !== CLEANUP_ACK) throw Error('CLEANUP_ACKNOWLEDGEMENT_REQUIRED');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.firebaseProject !== PROJECT) throw Error('MANIFEST_PROJECT_MISMATCH');
if (manifest.firestoreDatabaseId !== DATABASE) throw Error('MANIFEST_DATABASE_MISMATCH');

// The journal verifies its own integrity hash on load; a hand-edited journal fails here.
const journal = ProductionJournal.load(journalPath);
if (journal.body.migrationRunId !== manifest.bulkMigrationRunId) throw Error('MANIFEST_RUN_ID_MISMATCH');

// ---- the forbidden set is derived, not asserted --------------------------------------------------
const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const built = await withSourceSnapshot(localConfig(), async (select) =>
  buildMigrationPlan({ select, Timestamp }), evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}
const derivedPlanHash = planHash(built.plan, sha256);
if (derivedPlanHash !== journal.body.planHash) throw Error('PLAN_HASH_DRIFT_SINCE_COPY');
if (manifest.migrationPlanHash && manifest.migrationPlanHash !== derivedPlanHash) {
  throw Error('MANIFEST_PLAN_HASH_DRIFT');
}
const plannedPaths = built.plan.map((entry) => entry.path);
const forbiddenPaths = new Set([...plannedPaths, ...journal.body.writtenPaths]);

const planOverlap = manifest.documents.filter((item) => plannedPaths.includes(item.path)).length;
const journalOverlap = manifest.documents
  .filter((item) => journal.body.writtenPaths.includes(item.path)).length;

// Sealing verifies the manifest integrity hash and refuses any overlap with the forbidden set.
const target = await openResidueCleanupTarget({
  manifest, projectId: PROJECT, databaseId: DATABASE, forbiddenPaths, expectedCount: EXPECTED_RESIDUE,
});

let report;
try {
  // ---- every guard, on every document, before anything is deleted -------------------------------
  const verified = [];
  const problems = [];
  for (const document of manifest.documents) {
    try {
      verified.push(await target.verifyManifestDocument(document.path));
    } catch (error) {
      problems.push({ path: document.path, code: error?.code ?? null, message: error?.message });
    }
  }

  const authorized = problems.length === 0 && planOverlap === 0 && journalOverlap === 0
    && verified.length === EXPECTED_RESIDUE;

  const summary = {
    generatedAt: new Date().toISOString(),
    artifact: 'residue-cleanup-execution',
    cleanupRunId: manifest.cleanupRunId,
    bulkMigrationRunId: manifest.bulkMigrationRunId,
    projectId: target.projectId,
    firestoreDatabaseId: target.databaseId,
    identity: target.identity,
    manifestIntegrity: 'VERIFIED',
    expectedResidueDocs: EXPECTED_RESIDUE,
    matchedResidueDocs: verified.length,
    migrationPlanOverlap: planOverlap,
    migrationJournalOverlap: journalOverlap,
    customerDataLinkage: 0,
    problems,
    state: authorized ? 'CLEANUP_AUTHORIZED' : 'CLEANUP_REFUSED',
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

  // ---- execution: one exact path at a time, each re-checked immediately before its delete --------
  const deleted = [];
  const failures = [];
  for (const document of manifest.documents) {
    try {
      const result = await target.deleteManifestDocument(document.path);
      deleted.push(result.path);
    } catch (error) {
      failures.push({ path: document.path, code: error?.code ?? null, message: error?.message });
      break; // A surprise on one document says the manifest is stale; stop rather than press on.
    }
  }

  const absence = [];
  for (const path of deleted) absence.push(await target.confirmAbsent(path));
  const stillPresent = absence.filter((item) => !item.absent).map((item) => item.path);

  report = {
    ...summary,
    status: failures.length ? CLEANUP_STATUS.PARTIAL_FAILURE : CLEANUP_STATUS.COMPLETE,
    actualDeletes: deleted.length,
    deletedPaths: deleted,
    failures,
    confirmedAbsent: absence.filter((item) => item.absent).length,
    stillPresentAfterDelete: stillPresent,
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
