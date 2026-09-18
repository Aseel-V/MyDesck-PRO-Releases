#!/usr/bin/env node
/**
 * Roll back one Firestore production bulk copy, by journal, on explicit operator instruction.
 *
 * Deliberately a separate command that is never invoked automatically. A failed copy leaves the
 * target in a known, journalled state; whether to unwind it or inspect it first is an operator
 * decision, and a tool that rolled back on its own would take that decision away at the worst
 * possible moment.
 *
 * It can only delete paths that satisfy all four conditions at once: recorded in this run's journal
 * as successfully written, present in the authorized mutation plan, in the same project and
 * database the journal names, and reached through the authorized production target — which has no
 * wildcard, collection or query-based delete to offer. Re-planning from the source is required so
 * the plan allowlist is real rather than taken from the journal's own word.
 *
 *   node migration/firestore/tools/production-rollback.mjs \
 *     --journal=<path> --ack=I_ACKNOWLEDGE_MYDESCK_FIRESTORE_PRODUCTION_ROLLBACK \
 *     --go-manifest=<path> [--validate-only]
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { authorize, STAGES } from '../lib/production-execution-authorization.mjs';
import { openAuthorizedProductionTarget, sealMutationPlan } from '../lib/authorized-production-target.mjs';
import { ProductionJournal } from '../lib/production-journal.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';

const ROLLBACK_ACK = 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_PRODUCTION_ROLLBACK';
const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;

const journalPath = value('--journal');
const acknowledgement = value('--ack');
const validateOnly = process.argv.includes('--validate-only');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');
if (acknowledgement !== ROLLBACK_ACK) throw Error('ROLLBACK_ACKNOWLEDGEMENT_REQUIRED');

const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const readinessPath = 'migration/reports/firestore-production-dry-run.json';
const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, 'utf8')) : null;

// The journal verifies its own integrity on load; a hand-edited journal fails here.
const journal = ProductionJournal.load(journalPath);
if (journal.body.firebaseProject !== config.firebaseProject) throw Error('JOURNAL_PROJECT_MISMATCH');
if (journal.body.firestoreDatabaseId !== config.firestoreDatabaseId) throw Error('JOURNAL_DATABASE_MISMATCH');
if (journal.body.stage !== 'firestore-bulk-copy') throw Error('JOURNAL_STAGE_MISMATCH');

// Rollback is itself a production mutation, so it needs the same authorization as the copy.
const decision = authorize({ mode: 'production-copy', stage: STAGES.firestoreBulkCopy,
  acknowledgement: 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_PRODUCTION_COPY',
  goManifestPath: value('--go-manifest', null), config, readiness });
if (!decision.authorized) {
  console.error(JSON.stringify({ authorized: false, reasons: decision.reasons, deleted: 0 }, null, 2));
  throw Error(`ROLLBACK_REFUSED:${decision.reasons.join(',')}`);
}

// Re-plan from the source so the allowlist is derived, not taken from the journal's own claim.
const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const built = await withSourceSnapshot(localConfig(), async (select) =>
  buildMigrationPlan({ select, Timestamp }), evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}
const sealed = sealMutationPlan(built.plan);

const confirmed = journal.confirmedSet();
const paths = journal.writtenPaths;
const outsidePlan = paths.filter((path) => !sealed.allowlist.has(path));
if (outsidePlan.length) throw Error(`JOURNAL_PATHS_OUTSIDE_PLAN:${outsidePlan.length}`);

const target = await openAuthorizedProductionTarget({
  capability: decision.capability, mutationPlan: sealed.plan,
  projectId: config.firebaseProject, databaseId: config.firestoreDatabaseId,
  sourceProject: config.supabaseProject, stage: STAGES.firestoreBulkCopy,
});

try {
  const summary = { migrationRunId: journal.body.migrationRunId, journal: journalPath,
    journalStatus: journal.status, projectId: target.projectId, databaseId: target.databaseId,
    journalConfirmedPaths: paths.length, pathsOutsidePlan: 0,
    authImports: 0, storageMutations: 0, sourceMutations: 0 };
  if (validateOnly) {
    console.log(JSON.stringify({ ...summary, state: 'ROLLBACK_VALIDATED', deleted: 0 }, null, 2));
    await target.close();
    process.exit(0);
  }
  const result = await target.rollbackJournalPaths(paths, { journalConfirmed: confirmed });
  console.log(JSON.stringify({ ...summary, state: 'ROLLED_BACK', deleted: result.deleted }, null, 2));
  await target.close();
} catch (error) {
  await target.close().catch(() => undefined);
  throw error;
}
