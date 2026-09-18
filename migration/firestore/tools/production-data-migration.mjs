#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { assertMode, assertReadOnlySource } from '../lib/production-guard.mjs';
import { authorize, STAGES } from '../lib/production-execution-authorization.mjs';
import { openAuthorizedProductionTarget, sealMutationPlan, planHash, isRetryable, DEFAULT_BATCH_SIZE }
  from '../lib/authorized-production-target.mjs';
import { ProductionJournal, bulkCopyGate } from '../lib/production-journal.mjs';
import { buildMigrationPlan, partitionBatches } from '../lib/migration-plan.mjs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { sha256 } from '../lib/production-guard.mjs';
import { randomUUID } from 'node:crypto';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
assertMode(mode, ['dry-run', 'rehearsal', 'production-copy', 'final-delta'], value('--ack', null));
const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
// The rehearsal this migration is pinned to. It is the reference half of the source-drift check:
// the plan's own live measurement is the other half, so neither side is a hand-maintained constant.
const rehearsalImport = JSON.parse(readFileSync('migration/reports/firestore-full-import.json', 'utf8'));
const delta = JSON.parse(readFileSync('migration/firestore/config/production-delta-map.json', 'utf8'));
assertReadOnlySource({ readOnly: config.sourceSnapshot.readOnly,
  isolationLevel: config.sourceSnapshot.isolationLevel, writeAttemptRejected: true });
if (delta.tables !== 77 || delta.unknown !== 0) throw Error('DELTA_MAP_INCOMPLETE');
// The preparation-milestone refusal is replaced by the controlled authorization gate, not
// removed. Every condition in authorize() must hold; --mode=production-copy alone grants
// nothing, and there is no force/skip/env bypass. See production-execution-authorization.mjs.
if (mode === 'production-copy' || mode === 'final-delta') {
  const readinessPath = 'migration/reports/firestore-production-dry-run.json';
  const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, 'utf8')) : null;
  const decision = authorize({
    mode,
    stage: mode === 'final-delta' ? STAGES.firestoreFinalDelta : STAGES.firestoreBulkCopy,
    acknowledgement: value('--ack', null),
    goManifestPath: value('--go-manifest', null),
    config,
    readiness,
  });
  if (!decision.authorized) {
    console.error(JSON.stringify({ authorized: false, stage: mode, reasons: decision.reasons,
      checks: decision.checks, firestoreWrites: 0, authImports: 0, sourceWrites: 0 }, null, 2));
    throw Error(`PRODUCTION_EXECUTION_REFUSED:${decision.reasons.join(',')}`);
  }
  const validateOnly = process.argv.includes('--validate-only');
  const stage = mode === 'final-delta' ? STAGES.firestoreFinalDelta : STAGES.firestoreBulkCopy;
  if (mode === 'final-delta') throw Error('FINAL_DELTA_EXECUTOR_NOT_IMPLEMENTED');

  // ---- source: one READ ONLY snapshot, proven, used for both drift and the plan ----------------
  const { Timestamp } = await import('firebase-admin/firestore');
  const snapshotEvidence = {};
  const built = await withSourceSnapshot(localConfig(), async (select) =>
    buildMigrationPlan({ select, Timestamp }), snapshotEvidence);
  if (snapshotEvidence.rejectedWriteSqlState !== '25006' || snapshotEvidence.successfulWrites !== 0) {
    throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
  }

  // ---- source drift: the plan's own measurement against the pinned rehearsal -------------------
  const expectedSourceRows = rehearsalImport.sourceCoverage?.rows;
  const expectedMigratable = rehearsalImport.sourceCoverage?.migrated;
  const expectedExcluded = rehearsalImport.sourceCoverage?.excluded;
  const driftReasons = [];
  if (built.counts.sourceRows !== expectedSourceRows) driftReasons.push(`SOURCE_ROWS:${built.counts.sourceRows}!=${expectedSourceRows}`);
  if (built.counts.migratableRows !== expectedMigratable) driftReasons.push(`MIGRATABLE:${built.counts.migratableRows}!=${expectedMigratable}`);
  if (built.counts.excludedRows !== expectedExcluded) driftReasons.push(`EXCLUDED:${built.counts.excludedRows}!=${expectedExcluded}`);
  if (built.counts.plannedDocuments !== rehearsalImport.migration?.written) {
    driftReasons.push(`PLANNED_DOCS:${built.counts.plannedDocuments}!=${rehearsalImport.migration?.written}`);
  }
  if (driftReasons.length) throw Error(`SOURCE_DRIFT_REFUSED:${driftReasons.join(',')}`);

  // ---- seal the plan, derive the allowlist, partition batches ----------------------------------
  const sealed = sealMutationPlan(built.plan);
  const batches = partitionBatches(sealed.plan, DEFAULT_BATCH_SIZE);
  const hashOfPlan = planHash(sealed.plan, sha256);
  const migrationRunId = value('--run-id', `bulkcopy-${randomUUID()}`);
  const journalPath = value('--journal', `migration/production-copy.local/${migrationRunId}.json`);

  // ---- open the one mutation boundary; capability re-checked inside ----------------------------
  const target = await openAuthorizedProductionTarget({
    capability: decision.capability,
    mutationPlan: sealed.plan,
    projectId: config.firebaseProject,
    databaseId: config.firestoreDatabaseId,
    sourceProject: config.supabaseProject,
    stage,
  });

  try {
    // ---- target must be empty, checked by the target itself ------------------------------------
    const emptiness = await target.assertTargetEmpty();

    const preview = {
      state: 'PRODUCTION_TARGET_VALIDATED',
      authorized: true,
      migrationRunId,
      projectId: target.projectId,
      databaseId: target.databaseId,
      plannedSourceRows: built.counts.migratableRows,
      excludedRows: built.counts.excludedRows,
      plannedFirestoreDocs: built.counts.plannedDocuments,
      plannedBatches: batches.length,
      batchSize: DEFAULT_BATCH_SIZE,
      allowlistSize: target.allowlistSize,
      rootCollections: target.rootCollections,
      planHash: hashOfPlan,
      targetDocsBefore: 0,
      collectionsCheckedEmpty: emptiness.collectionsChecked,
      journalPreview: journalPath,
      sourceSnapshot: {
        isolationLevel: snapshotEvidence.start?.isolation ?? null,
        readOnly: snapshotEvidence.start?.read_only ?? null,
        rejectedWriteSqlState: snapshotEvidence.rejectedWriteSqlState,
        successfulWrites: snapshotEvidence.successfulWrites,
      },
      reconciliationExpectation: {
        sourceRowsAccounted: built.counts.sourceRows,
        migratedRows: built.counts.migratableRows,
        excludedRows: built.counts.excludedRows,
        firestoreDocuments: built.counts.plannedDocuments,
        note: 'COPY_COMPLETE does not imply BULK_COPY_GO; full reconciliation is the next required stage',
      },
      actualFirestoreWrites: 0,
      actualAuthImports: 0,
      actualStorageMutations: 0,
      sourceMutations: 0,
    };

    if (validateOnly) {
      // Stops immediately before the first commit. commitPlannedBatch is never called.
      console.log(JSON.stringify({ ...preview, state: 'AUTHORIZED_TO_EXECUTE',
        productionTarget: 'PRODUCTION_TARGET_VALIDATED', validateOnly: true }, null, 2));
      await target.close();
      process.exit(0);
    }

    // ---- real execution -----------------------------------------------------------------------
    const journal = ProductionJournal.create(journalPath, {
      migrationRunId,
      goManifestIntegrityHash: decision.capability.goManifestIntegrityHash,
      approvedPreparationCommit: decision.capability.approvedPreparationCommit,
      sourceSnapshot: preview.sourceSnapshot,
      firebaseProject: target.projectId,
      firestoreDatabaseId: target.databaseId,
      plannedDocumentCount: sealed.plan.length,
      planHash: hashOfPlan,
      batchLayout: batches.map((batch, index) => ({ index, documents: batch.length })),
    });
    journal.beginWriting();

    for (const [index, batch] of batches.entries()) {
      let attempt = 0;
      for (;;) {
        try {
          const result = await target.commitPlannedBatch(batch);
          journal.recordBatch(index, result.paths);
          break;
        } catch (error) {
          // Retry transport faults only. Everything else is a decision and stops the run.
          if (isRetryable(error) && attempt < 4) {
            attempt += 1;
            await new Promise((resolve) => { setTimeout(resolve, 250 * 2 ** attempt); });
            continue;
          }
          journal.recordFailure({ batchIndex: index, code: error?.code ?? null, message: error?.message });
          console.error(JSON.stringify({ state: 'PARTIAL_FAILURE', migrationRunId,
            failedBatch: index, writtenPaths: journal.writtenPaths.length,
            journal: journalPath, authImports: 0, storageMutations: 0, sourceMutations: 0,
            nextStage: 'operator decision: inspect, then optionally roll back with production-rollback.mjs',
          }, null, 2));
          await target.close();
          throw Error(`PRODUCTION_COPY_PARTIAL_FAILURE:batch=${index}`);
        }
      }
    }

    journal.markCopyComplete();
    const gate = bulkCopyGate(journal);
    console.log(JSON.stringify({ state: 'COPY_COMPLETE', migrationRunId,
      firestoreWrites: target.committedCount, plannedFirestoreDocs: sealed.plan.length,
      journal: journalPath, authImports: 0, storageMutations: 0, sourceMutations: 0,
      bulkCopyGo: gate.bulkCopyGo, nextStage: gate.nextStage }, null, 2));
    await target.close();
    process.exit(0);
  } catch (error) {
    await target.close().catch(() => undefined);
    throw error;
  }
}
console.log(JSON.stringify({ mode, sourceProject: config.supabaseProject, targetProject: config.firebaseProject,
  databaseId: config.firestoreDatabaseId, tables: delta.tables, unknown: delta.unknown,
  sourceWrites: 0, targetWrites: 0, status: 'DRY_RUN_READY' }));
