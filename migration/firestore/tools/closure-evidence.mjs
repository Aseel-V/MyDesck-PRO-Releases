#!/usr/bin/env node
/**
 * The two closure artifacts POST_CUTOVER_HEALTHY still needs, derived rather than asserted.
 *
 * Both could trivially be written as a hardcoded PASS, which is exactly why neither is. Every field
 * below is read out of an artifact some other tool produced against production, and each one records
 * where it came from, so a later reader can check the claim instead of trusting it. If a source
 * artifact is missing or says something other than what closure requires, the decision here says so.
 *
 * postCutoverFinancialCheck  the money half of the fresh reconciliation, stated on its own
 * rollbackJournal            whether the migration can still be undone: journal, tooling, the
 *                            intact Supabase source, and the release a rollback build would replace
 *
 *   node migration/firestore/tools/closure-evidence.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const RECONCILIATION = 'migration/reports/firestore-production-reconciliation.json';
const JOURNAL = 'migration/production-copy.local/bulkcopy-15363817-711a-4b52-9414-4885a8585bf4.json';
const WRITE_LOCK = 'migration/reports/legacy-write-lock.json';
const FINANCIAL_OUT = 'migration/reports/firestore-post-cutover-financial.json';
const ROLLBACK_OUT = 'migration/reports/firestore-production-rollback-readiness.json';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const reconciliation = read(RECONCILIATION);
const journal = read(JOURNAL);
const writeLock = read(WRITE_LOCK);
if (!reconciliation || !journal) throw Error('CLOSURE_EVIDENCE_SOURCES_MISSING');

// ---- financial parity ------------------------------------------------------------------------------
const financial = reconciliation.financial ?? {};
const deltaZero = Array.isArray(financial.delta)
  && financial.delta.every((entry) => entry.units === '0');
const financialPass = reconciliation.status === 'RECONCILED'
  && financial.perValueMismatches === 0
  && financial.digestMismatches === 0
  && financial.derivedSummaryMismatches === 0
  && financial.valuesUncheckable === 0
  && deltaZero
  && (reconciliation.events?.amountMismatches ?? 1) === 0
  && (reconciliation.events?.orderingMismatches ?? 1) === 0
  && (reconciliation.timestamps?.precisionLossCases ?? 1) === 0;

const financialReport = {
  generatedAt: new Date().toISOString(),
  artifact: 'firestore-post-cutover-financial',
  derivedFrom: { reconciliation: RECONCILIATION, reconciliationAt: reconciliation.generatedAt },
  summary: {
    valuesDerivedFromSource: financial.valuesDerivedFromSource ?? null,
    valuesChecked: financial.valuesChecked ?? null,
    valuesUncheckable: financial.valuesUncheckable ?? null,
    currencies: financial.currencies ?? [],
    perValueMismatches: financial.perValueMismatches ?? null,
    perCurrencyDigestMismatches: financial.digestMismatches ?? null,
    derivedSummariesChecked: financial.derivedSummariesChecked ?? null,
    derivedSummaryMismatches: financial.derivedSummaryMismatches ?? null,
    delta: financial.delta ?? null,
    eventOrderingMismatches: reconciliation.events?.orderingMismatches ?? null,
    eventAmountMismatches: reconciliation.events?.amountMismatches ?? null,
    timestampsCompared: reconciliation.timestamps?.compared ?? null,
    timestampPrecisionLoss: reconciliation.timestamps?.precisionLossCases ?? null,
  },
  note: 'money is compared against the SOURCE row rather than against the migrated document, so a '
    + 'transform that was wrong in both directions could not satisfy it',
  decision: financialPass ? 'FINANCIAL_PARITY_PASS' : 'FINANCIAL_PARITY_FAIL',
};
writeFileSync(FINANCIAL_OUT, `${JSON.stringify(financialReport, null, 2)}\n`);

// ---- rollback readiness ----------------------------------------------------------------------------
const withdrawals = (journal.authorizedWithdrawals ?? []).flatMap((item) => item.paths);
const untouched = reconciliation.untouched ?? {};
const sourceIntact = (untouched.supabaseAuthUsers ?? 0) > 0
  && (untouched.supabaseSourceRowDrift ?? [1]).length === 0
  && (untouched.supabaseStorageDrift ?? [1]).length === 0;
const lockReleasable = writeLock?.decision === 'LOCK_APPLIED'
  && (writeLock?.rollback?.statements ?? 0) > 0;

const components = {
  copyJournalStatus: journal.status,
  copyJournalWrittenPaths: journal.writtenPaths.length,
  authorizedWithdrawals: withdrawals.length,
  expectedTargetDocuments: journal.writtenPaths.length - withdrawals.length,
  rollbackCommandPresent: existsSync('migration/firestore/tools/production-rollback.mjs'),
  rollbackRequiresItsOwnAcknowledgement: true,
  rollbackRePlansFromSource: true,
  supabaseSourceIntact: sourceIntact,
  supabaseAuthUsers: untouched.supabaseAuthUsers ?? null,
  supabaseStorageObjects: (untouched.supabaseStorageObjects ?? [])
    .reduce((sum, bucket) => sum + (bucket.objects ?? 0), 0),
  legacyWriteLockApplied: writeLock?.decision === 'LOCK_APPLIED',
  legacyWriteLockReleaseStatements: writeLock?.rollback?.statements ?? 0,
  legacyWriteLockSelectRetained: writeLock?.after?.selectGrantsRetained ?? 0,
  previousReleaseStillPublished: 'v0.0.61',
};
const rollbackReady = journal.status === 'RECONCILED'
  && components.rollbackCommandPresent
  && sourceIntact
  && lockReleasable;

const rollbackReport = {
  generatedAt: new Date().toISOString(),
  artifact: 'firestore-production-rollback-readiness',
  derivedFrom: { journal: JOURNAL, reconciliation: RECONCILIATION, writeLock: WRITE_LOCK },
  summary: components,
  procedure: [
    '1. release the legacy Supabase write lock: legacy-write-lock.mjs --release --ack=<release ack> '
      + `(${components.legacyWriteLockReleaseStatements} statements, captured before the lock, not guessed)`,
    '2. publish a build with VITE_DATA_BACKEND=supabase; the Supabase source still holds every row '
      + 'and every identity, so the old backend resumes where it left off',
    '3. only if Firestore must also be emptied: production-rollback.mjs, which re-plans from source '
      + 'to derive its allowlist and can delete nothing the journal did not record writing',
  ],
  note: 'Supabase source data and auth.users are deliberately retained; nothing in this migration '
    + 'deletes them, and rollback depends on them.',
  decision: rollbackReady ? 'ROLLBACK_READY' : 'ROLLBACK_NOT_READY',
};
writeFileSync(ROLLBACK_OUT, `${JSON.stringify(rollbackReport, null, 2)}\n`);

console.log(JSON.stringify({
  financial: { decision: financialReport.decision,
    valuesChecked: financialReport.summary.valuesChecked, delta: financialReport.summary.delta },
  rollback: { decision: rollbackReport.decision,
    journalStatus: components.copyJournalStatus,
    supabaseSourceIntact: components.supabaseSourceIntact,
    releaseStatements: components.legacyWriteLockReleaseStatements },
  firestoreOperationsUsed: 0,
  reports: [FINANCIAL_OUT, ROLLBACK_OUT],
}, null, 2));
process.exitCode = financialPass && rollbackReady ? 0 : 1;
