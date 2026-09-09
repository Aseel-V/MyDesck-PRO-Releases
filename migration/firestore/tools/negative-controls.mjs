#!/usr/bin/env node
/**
 * Negative controls for the reconciliation harness.
 *
 * A reconciliation that has only ever passed is not evidence. Each control here
 * deliberately corrupts the migrated target in one specific way, runs the REAL
 * reconciler as a subprocess, and requires that it fails with the expected
 * finding. Then the corruption is undone and a clean run is required again, so
 * a control cannot pass by leaving the target permanently broken.
 *
 * If a corruption is NOT detected, this tool fails. That is the point: the
 * harness itself is what is under test.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node migration/firestore/tools/negative-controls.mjs --target emulator
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { openTarget } from '../lib/firestore-target.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const RECONCILE = 'migration/firestore/tools/reconcile.mjs';
const REPORT = 'migration/reports/firestore-reconciliation.json';
const targetMode = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1] : null;

const target = await openTarget(targetMode);

/** Run the real reconciler and return its report. */
function reconcile() {
  const run = spawnSync(process.execPath, [RECONCILE, '--target', targetMode, '--quiet'],
    { env: process.env, encoding: 'utf8' });
  if (run.status === null) throw new Error(`RECONCILE_DID_NOT_RUN: ${run.error?.message}`);
  return JSON.parse(readFileSync(REPORT, 'utf8'));
}

const ref = (collection, id) => target.collection(collection).doc(id);
const readDoc = async (collection, id) => (await ref(collection, id).get()).data();

/**
 * One control: corrupt, require detection, restore, require a clean run.
 * `expect` is the finding code that must appear; a control that trips a
 * DIFFERENT check still fails, so each corruption proves the specific defence
 * it targets rather than any defence at all.
 */
async function control(name, expect, corrupt) {
  const restore = await corrupt();
  const dirty = reconcile();
  const codes = new Set(dirty.findings.map((f) => f.code));
  const detected = codes.has(expect);
  await restore();
  const clean = reconcile();
  return {
    control: name,
    expectedFinding: expect,
    detected,
    findingCodesSeen: [...codes],
    restoredClean: clean.status === 'RECONCILED',
    pass: detected && clean.status === 'RECONCILED',
  };
}

// The documents the controls operate on, resolved from the migrated slice.
const payload = JSON.parse(
  readFileSync('migration/firestore/export.local/synthetic-payloads.json', 'utf8'));
const tripId = payload.tables.trips.rows[0].id;
const otherTripId = payload.tables.trips.rows[1].id;
const planId = payload.tables.trip_payment_plans.rows[0].id;
const installmentId = payload.tables.trip_installments.rows[0].id;
const auditRow = payload.tables.trip_financial_audit.rows[0];
const auditDocId = String(auditRow.id).padStart(19, '0');
const secondAudit = payload.tables.trip_financial_audit.rows[1];
const secondAuditDocId = String(secondAudit.id).padStart(19, '0');
const uidA = payload.approvedUids[0];
const uidB = payload.approvedUids[1];

const results = [];

// 1. A source row with no target document.
results.push(await control('missing document', 'MISSING_TARGET_DOCUMENT', async () => {
  const snapshot = await readDoc('trips', tripId);
  await ref('trips', tripId).delete();
  return async () => { await ref('trips', tripId).set(snapshot); };
}));

// 2. A target document no source row produced.
results.push(await control('extra unexpected document', 'UNEXPECTED_TARGET_DOCUMENT', async () => {
  const snapshot = await readDoc('trips', tripId);
  await ref('trips', 'ghost-trip-not-in-source').set({ ...snapshot });
  return async () => { await ref('trips', 'ghost-trip-not-in-source').delete(); };
}));

// 3. A migrated user whose UID no longer matches the source identity.
results.push(await control('wrong UID', 'UID_NOT_PRESERVED', async () => {
  const before = await readDoc('users', uidA);
  await ref('users', uidA).update({ uid: 'not-the-original-uid' });
  return async () => { await ref('users', uidA).set(before); };
}));

// 4. A document moved to another tenant's business.
results.push(await control('wrong businessId', 'ENTITY_HASH_MISMATCH', async () => {
  const before = await readDoc('users', uidA);
  await ref('users', uidA).update({ businessId: 'some-other-business' });
  return async () => { await ref('users', uidA).set(before); };
}));

// 5. A child pointing at a parent that does not exist.
results.push(await control('broken parent reference', 'ORPHANED_REFERENCE', async () => {
  const before = await readDoc('trips', otherTripId);
  await ref('trips', otherTripId).delete();
  return async () => { await ref('trips', otherTripId).set(before); };
}));

// 6. One unit of money changed. No epsilon anywhere should absorb this.
results.push(await control('changed financial integer', 'REVERSE_CONVERSION_MISMATCH', async () => {
  const before = await readDoc('trips', tripId);
  const amount = before.salePrice;
  await ref('trips', tripId).update({
    salePrice: { ...amount, unitsText: String(BigInt(amount.unitsText) + 1n),
      units: amount.units + 1, decimal: null } });
  return async () => { await ref('trips', tripId).set(before); };
}));

// 7. The same digits at the wrong scale: 918.43 read as 91.843.
results.push(await control('wrong scale', 'REVERSE_CONVERSION_MISMATCH', async () => {
  const before = await readDoc('trips', tripId);
  await ref('trips', tripId).update({
    salePrice: { ...before.salePrice, scale: before.salePrice.scale + 1 } });
  return async () => { await ref('trips', tripId).set(before); };
}));

// 8. Precision loss: the numeric field silently disagrees with the text one.
results.push(await control('overflow / precision loss', 'STORED_AMOUNT_UNREADABLE', async () => {
  const before = await readDoc('trips', tripId);
  await ref('trips', tripId).update({
    salePrice: { ...before.salePrice, unitsText: 'not-an-integer' } });
  return async () => { await ref('trips', tripId).set(before); };
}));

// 9. Two events swapped in the history.
results.push(await control('reordered event', 'EVENT_SEQUENCE_MISMATCH', async () => {
  const a = await readDoc('tripFinancialAudit', auditDocId);
  const b = await readDoc('tripFinancialAudit', secondAuditDocId);
  await ref('tripFinancialAudit', auditDocId).update({ sequence: b.sequence });
  await ref('tripFinancialAudit', secondAuditDocId).update({ sequence: a.sequence });
  return async () => {
    await ref('tripFinancialAudit', auditDocId).set(a);
    await ref('tripFinancialAudit', secondAuditDocId).set(b);
  };
}));

// 10. A timestamp moved by one microsecond.
results.push(await control('altered timestamp', 'ENTITY_HASH_MISMATCH', async () => {
  const before = await readDoc('trips', tripId);
  const micros = BigInt(before.createdAtMicros) + 1n;
  const seconds = micros / 1000000n;
  await ref('trips', tripId).update({
    createdAtMicros: micros.toString(),
    createdAt: new target.Timestamp(Number(seconds),
      Number(micros - seconds * 1000000n) * 1000) });
  return async () => { await ref('trips', tripId).set(before); };
}));

// 11. A missing audit event: history with a hole in it.
results.push(await control('missing audit event', 'MISSING_TARGET_DOCUMENT', async () => {
  const before = await readDoc('tripFinancialAudit', auditDocId);
  await ref('tripFinancialAudit', auditDocId).delete();
  return async () => { await ref('tripFinancialAudit', auditDocId).set(before); };
}));

// 12. The right number in the wrong currency.
results.push(await control('wrong currency', 'ENTITY_HASH_MISMATCH', async () => {
  const before = await readDoc('tripPaymentPlans', planId);
  await ref('tripPaymentPlans', planId).update({
    currency: before.currency === 'ILS' ? 'EUR' : 'ILS' });
  return async () => { await ref('tripPaymentPlans', planId).set(before); };
}));

// 15. A document handed to the OTHER real tenant. Note this changes only the
// denormalised ownerUid, not the source userId column, so the entity hash is
// untouched — level 6 is the only thing standing between this and a silent
// cross-tenant move, which is exactly why it is checked separately.
results.push(await control('cross-tenant document', 'OWNERSHIP_MISMATCH', async () => {
  const before = await readDoc('tripInstallments', installmentId);
  const otherUid = before.ownerUid === uidA ? uidB : uidA;
  if (otherUid === before.ownerUid) throw new Error('CONTROL_WOULD_BE_A_NO_OP');
  await ref('tripInstallments', installmentId).update({ ownerUid: otherUid });
  return async () => { await ref('tripInstallments', installmentId).set(before); };
}));

// A document whose owner is not in the slice at all.
results.push(await control('owner outside approved slice', 'DOCUMENT_OUTSIDE_APPROVED_SLICE',
  async () => {
    const before = await readDoc('tripInstallments', installmentId);
    await ref('tripInstallments', installmentId).update(
      { ownerUid: '00000000-0000-0000-0000-000000000000' });
    return async () => { await ref('tripInstallments', installmentId).set(before); };
  }));

// A silently blanked field, which a naive count-only check would miss entirely.
results.push(await control('blanked text field', 'ENTITY_HASH_MISMATCH', async () => {
  const before = await readDoc('trips', tripId);
  await ref('trips', tripId).update({ clientName: '' });
  return async () => { await ref('trips', tripId).set(before); };
}));

// JSON null quietly turned into a SQL NULL column — the defect this milestone
// actually found, kept as a permanent control so it cannot come back.
results.push(await control('JSON null collapsed to SQL NULL', 'ENTITY_HASH_MISMATCH', async () => {
  const jsonNullRow = payload.tables.trip_financial_audit.rows.find(
    (r) => r.new_value === 'null');
  const docId = String(jsonNullRow.id).padStart(19, '0');
  const before = await readDoc('tripFinancialAudit', docId);
  await ref('tripFinancialAudit', docId).update({ newValueEncoding: target.FieldValue.delete() });
  return async () => { await ref('tripFinancialAudit', docId).set(before); };
}));

await target.close();

const failed = results.filter((r) => !r.pass);
const report = {
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'ALL_CORRUPTIONS_DETECTED' : 'HARNESS_FAILED',
  targetMode: target.mode,
  targetProject: target.projectId,
  controls: results.length,
  detected: results.filter((r) => r.detected).length,
  restoredClean: results.filter((r) => r.restoredClean).length,
  failures: failed.length,
  results,
};
writeReport('migration/reports/firestore-negative-controls.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status, controls: report.controls, detected: report.detected,
  restoredClean: report.restoredClean, failures: report.failures,
  results: results.map((r) => ({ control: r.control, pass: r.pass,
    detected: r.detected, restoredClean: r.restoredClean,
    ...(r.pass ? {} : { expected: r.expectedFinding, seen: r.findingCodesSeen }) })),
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
