#!/usr/bin/env node
/**
 * Prove the extracted planner reproduces the verified rehearsal, document for document.
 *
 * The rehearsal built its 1,477 documents inline and recorded every one in
 * migration/full-rehearsal.local/expected.json. The planner extracted from it must produce exactly
 * that set from the same source, or it is not the same migration. This compares the two by target
 * path and by the rehearsal's own raw document hash, so a field-level difference fails rather than
 * passing on matching counts.
 *
 * Read-only: opens the source in the same READ ONLY snapshot and writes no Firestore document.
 *
 *   node migration/firestore/tools/verify-plan-equivalence.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';

const ORACLE = 'migration/full-rehearsal.local/expected.json';
if (!existsSync(ORACLE)) throw new Error('REHEARSAL_ORACLE_ABSENT');

const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const built = await withSourceSnapshot(localConfig(), async (select) =>
  buildMigrationPlan({ select, Timestamp }), evidence);

if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw new Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

const oracleRaw = JSON.parse(readFileSync(ORACLE, 'utf8'));
const oracle = Array.isArray(oracleRaw) ? oracleRaw : (oracleRaw.expected ?? oracleRaw.documents ?? []);
const oracleByPath = new Map(oracle.map((entry) => [entry.targetPath, entry]));
const planByPath = new Map(built.plan.map((entry) => [entry.path, entry]));

const missing = [...oracleByPath.keys()].filter((path) => !planByPath.has(path));
const unexpected = [...planByPath.keys()].filter((path) => !oracleByPath.has(path));
const hashMismatches = [];
for (const [path, entry] of planByPath) {
  const expected = oracleByPath.get(path);
  if (!expected) continue;
  if (expected.rawHash && entry.documentFingerprint !== expected.rawHash) {
    hashMismatches.push(path);
  }
}

// Determinism: the same snapshot planned twice must be byte-identical.
const secondEvidence = {};
const again = await withSourceSnapshot(localConfig(), async (select) =>
  buildMigrationPlan({ select, Timestamp }), secondEvidence);
const firstFingerprints = built.plan.map((e) => `${e.path}#${e.documentFingerprint}`).sort().join('\n');
const secondFingerprints = again.plan.map((e) => `${e.path}#${e.documentFingerprint}`).sort().join('\n');

const report = {
  generatedAt: new Date().toISOString(), mode: 'READ_ONLY_EQUIVALENCE_CHECK',
  firestoreWrites: 0, sourceWrites: 0,
  oracle: { artifact: ORACLE, documents: oracle.length },
  planned: built.counts,
  comparison: {
    missingFromPlan: missing.length,
    unexpectedInPlan: unexpected.length,
    documentHashMismatches: hashMismatches.length,
    missingSample: missing.slice(0, 5),
    unexpectedSample: unexpected.slice(0, 5),
    mismatchSample: hashMismatches.slice(0, 5),
  },
  deterministic: firstFingerprints === secondFingerprints,
  snapshot: {
    isolationLevel: evidence.start?.isolation ?? null,
    readOnly: evidence.start?.read_only ?? null,
    rejectedWriteSqlState: evidence.rejectedWriteSqlState,
    successfulWrites: evidence.successfulWrites,
    transactionOutcome: evidence.transactionOutcome,
  },
};
report.equivalent = missing.length === 0 && unexpected.length === 0
  && hashMismatches.length === 0 && report.deterministic
  && built.counts.plannedDocuments === oracle.length;

writeReport('migration/reports/migration-plan-equivalence.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ equivalent: report.equivalent, planned: report.planned,
  oracleDocuments: report.oracle.documents, comparison: report.comparison,
  deterministic: report.deterministic, snapshot: report.snapshot }, null, 2));
