import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const migration = JSON.parse(readFileSync('migration/reports/firestore-full-import.json', 'utf8'));
const ledger = JSON.parse(readFileSync('migration/full-rehearsal.local/ledger.json', 'utf8'));
const expected = JSON.parse(readFileSync('migration/full-rehearsal.local/expected.json', 'utf8'));
const entries = ledger.entries;
const distinctLedgerKeys = new Set(entries.map((entry) => entry.key)).size;
const distinctTargetPaths = new Set(expected.expected.map((entry) => entry.targetPath)).size;
const retried = entries.filter((entry) => entry.attemptCount > 1
  && entry.state === 'VERIFIED').length;
const carried = migration.migration.ledger.carriedOver;
const reused = migration.migration.reusedVerified;
const failed = entries.filter((entry) => entry.state === 'FAILED').length;
const pass = carried === 200 && reused === 199 && retried === 1 && failed === 0
  && distinctLedgerKeys === entries.length && distinctTargetPaths === expected.expected.length;

const report = {
  generatedAt: new Date().toISOString(),
  status: pass ? 'PASS' : 'FAIL',
  injected: { transientWriteFailure: 1, processInterruptionAfterEntities: 200 },
  resume: { carriedLedgerEntries: carried, verifiedDocumentsReusedWithoutRewrite: reused,
    failedEntitiesRetriedToVerified: retried, remainingFailed: failed },
  idempotency: { ledgerEntries: entries.length, distinctLedgerKeys,
    expectedTargetDocuments: expected.expected.length, distinctTargetPaths,
    duplicateLedgerKeys: entries.length - distinctLedgerKeys,
    duplicateTargetPaths: expected.expected.length - distinctTargetPaths },
};
writeReport('migration/reports/firestore-full-restart-proof.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = pass ? 0 : 1;

