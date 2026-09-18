#!/usr/bin/env node
/**
 * A Firestore operation budget for the post-reset continuation, computed offline.
 *
 * The quota was exhausted by reads, not by writes: every smoke run's cleanup sweep scanned about
 * thirty collection groups, which reads the whole corpus, and every reconciliation reads all 1,474
 * planned documents plus its own scan. Ten runs of that is tens of thousands of reads against a
 * 50,000/day allowance. The writes involved were trivial by comparison.
 *
 * So the budget is mostly about reads, and the plan is shaped accordingly: cleanup uses the exact
 * paths already in the residue manifest instead of scanning, tourism gets one attempt instead of
 * iterating, and reconciliation runs once rather than after every step.
 *
 * Fails closed if the plan would consume a material share of a fresh day's allowance, because the
 * point of the allowance is to serve customers, not to be spent proving things to ourselves.
 *
 *   node migration/firestore/tools/post-reset-budget.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const REPORT = 'migration/reports/post-reset-quota-budget.json';
// Spark daily free allowances for Firestore.
const DAILY = Object.freeze({ reads: 50_000, writes: 20_000, deletes: 20_000 });
/** Refuse the plan if it would take more than this share of a fresh day. */
const CEILING = 0.25;

const residue = JSON.parse(readFileSync('migration/post-cutover-smoke.local/residue-manifest.json', 'utf8'));
const reconciliation = JSON.parse(readFileSync('migration/reports/firestore-production-reconciliation.json', 'utf8'));
const corpus = reconciliation.coverage?.firestoreDocuments ?? 1474;

const deterministic = residue.deterministicPaths.length;
const derivableLookups = residue.derivable.length;
const enumerableParents = residue.enumerable.length + derivableLookups;
// Each unswept client-path run created at most one document per vertical operation beyond the
// bootstrap; the successful sweeps removed seven paths each, of which six were bootstrap.
const verticalDocsPerRun = 8;
const unsweptRuns = residue.unsweptRuns.length;

const steps = [
  { step: '1. resolve business ids for the run that never recorded them',
    reads: derivableLookups, writes: 0, deletes: 0 },
  { step: '1. list subcollections of our own business documents',
    reads: enumerableParents * 12, writes: 0, deletes: 0,
    note: 'listCollections per business, then listDocuments per subcollection; no global scan' },
  { step: '1. delete deterministic residue paths',
    reads: deterministic, writes: 0, deletes: deterministic,
    note: 'each delete is preceded by the boundary re-reading and hash-checking the document' },
  { step: '1. delete enumerated vertical residue',
    reads: unsweptRuns * verticalDocsPerRun, writes: 0, deletes: unsweptRuns * verticalDocsPerRun },
  { step: '1. verify absence of every listed path',
    reads: deterministic + unsweptRuns * verticalDocsPerRun, writes: 0, deletes: 0 },
  { step: '2. tourism: two tenant bootstraps',
    reads: 8, writes: 6, deletes: 0 },
  { step: '2. tourism: one create/read/update/delete lifecycle',
    reads: 20, writes: 30, deletes: 8,
    note: 'saveTrip writes the trip, its derived plan, the activity and audit rows and an '
      + 'idempotency record; the edit path rewrites the same set' },
  { step: '2. tourism: tenant isolation and cross-tenant victim check',
    reads: 6, writes: 0, deletes: 0 },
  { step: '3. clean the tourism run',
    reads: 40, writes: 0, deletes: 40 },
  { step: '4. one full reconciliation',
    reads: corpus * 2 + 200, writes: 0, deletes: 0,
    note: 'reads every planned document once and scans the collection groups once' },
  { step: '5. recompute gates',
    reads: 0, writes: 0, deletes: 0,
    note: 'staged-go reads local artifacts; role claim and Storage checks do not touch Firestore' },
];

const total = steps.reduce((sum, step) => ({
  reads: sum.reads + step.reads, writes: sum.writes + step.writes, deletes: sum.deletes + step.deletes,
}), { reads: 0, writes: 0, deletes: 0 });

const share = {
  reads: total.reads / DAILY.reads,
  writes: total.writes / DAILY.writes,
  deletes: total.deletes / DAILY.deletes,
};
const worst = Math.max(share.reads, share.writes, share.deletes);
const withinCeiling = worst <= CEILING;

const budget = {
  generatedAt: new Date().toISOString(),
  artifact: 'post-reset-quota-budget',
  mode: 'OFFLINE_NO_FIRESTORE_CONTACT',
  firestoreOperationsUsed: 0,
  dailyAllowance: DAILY,
  ceilingShare: CEILING,
  corpus,
  residue: { unsweptRuns, deterministicPaths: deterministic, derivableLookups, enumerableParents },
  steps,
  total,
  shareOfDailyAllowance: {
    reads: Number((share.reads * 100).toFixed(2)),
    writes: Number((share.writes * 100).toFixed(2)),
    deletes: Number((share.deletes * 100).toFixed(2)),
  },
  headroomForCustomers: {
    reads: DAILY.reads - total.reads, writes: DAILY.writes - total.writes,
    deletes: DAILY.deletes - total.deletes,
  },
  whatExhaustedItLastTime: 'repeated cleanup sweeps and reconciliations, each reading the whole '
    + 'corpus; roughly ten such passes against a 50,000 read allowance',
  rulesForThisContinuation: [
    'no rerun of carParts, supermarket, restaurant or autoRepair: already proven',
    'tourism gets exactly one production attempt; a failure is investigated offline',
    'cleanup uses exact manifest paths, never a global collection-group scan',
    'reconciliation runs once, at the end',
  ],
  decision: withinCeiling ? 'BUDGET_APPROVED' : 'BUDGET_REFUSED_TOO_LARGE',
};
writeFileSync(REPORT, `${JSON.stringify(budget, null, 2)}\n`);
console.log(JSON.stringify({ decision: budget.decision, total, shareOfDailyAllowance:
  budget.shareOfDailyAllowance, headroomForCustomers: budget.headroomForCustomers,
  ceilingShare: CEILING, worstShare: Number((worst * 100).toFixed(2)),
  firestoreOperationsUsed: 0, report: REPORT }, null, 2));
process.exitCode = withinCeiling ? 0 : 1;
