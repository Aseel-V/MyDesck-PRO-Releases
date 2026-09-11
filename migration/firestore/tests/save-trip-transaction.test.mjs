#!/usr/bin/env node
/**
 * save_trip_transaction controls, against the Firestore emulator.
 *
 * The properties under test are the ones that cost money when they are wrong:
 * a replayed request must not create a second payment, two concurrent requests
 * must not both win, a caller must not be able to name someone else as the
 * owner, and confirmed collection must survive an edit.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node --test migration/firestore/tests/save-trip-transaction.test.mjs
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openTarget } from '../lib/firestore-target.mjs';
import {
  saveTripTransaction, makeCallable, validatePaymentPlan, derivePaymentSummary, addMonths,
} from '../functions/save-trip-transaction.mjs';

const UID_A = 'fn-test-owner-a';
const UID_B = 'fn-test-owner-b';
const BUSINESS_A = 'fn-test-business-a';

let target;
let deps;

const throwsCode = async (fn, code) => assert.rejects(fn, (e) => e.code === code,
  `expected ${code}`);

const tripInput = (overrides = {}) => ({
  clientRequestId: randomUUID(),
  trip: {
    clientName: 'عميل לדוגמה Client',
    destination: 'Paris / باريس / פריז',
    startDate: '2026-12-01',
    endDate: '2026-12-08',
    currency: 'ILS',
    travelersCount: 2,
    salePriceMinor: 100000,
    wholesaleCostMinor: 70000,
    ...overrides.trip,
  },
  paymentPlan: overrides.paymentPlan === null ? null : {
    method: 'card',
    cardTotalMinor: 100000,
    cashTotalMinor: 0,
    confirmedCashMinor: 0,
    installmentCount: 3,
    firstDate: '2026-12-01',
    ...overrides.paymentPlan,
  },
  ...(overrides.clientRequestId ? { clientRequestId: overrides.clientRequestId } : {}),
});

/** Remove everything this suite created, so reconciliation stays meaningful. */
async function cleanup() {
  for (const collection of ['trips', 'tripPaymentPlans', 'tripInstallments',
    'tripActivityLog', 'tripFinancialAudit', 'idempotency', 'users', 'businesses']) {
    const snapshot = await target.db.collection(collection)
      .where('ownerUid', 'in', [UID_A, UID_B]).get().catch(() => ({ docs: [] }));
    await Promise.all(snapshot.docs.map((d) => d.ref.delete()));
  }
}

before(async () => {
  target = await openTarget('emulator');
  deps = { db: target.db, Timestamp: target.Timestamp, FieldValue: target.FieldValue };
  await cleanup();
  for (const [uid, businessId] of [[UID_A, BUSINESS_A], [UID_B, 'fn-test-business-b']]) {
    await target.db.collection('users').doc(uid).set({
      schemaVersion: 1, uid, userId: uid, ownerUid: uid, fullName: 'Test',
      role: 'user', isSuspended: false, canViewFinancials: false,
      businessId, isDeleted: false });
    await target.db.collection('businesses').doc(businessId).set({
      schemaVersion: 1, ownerUid: uid, businessId, businessName: 'Test', isDeleted: false });
  }
});

after(async () => {
  await cleanup();
  await target.close();
});

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

test('the payment split must equal the sale price exactly', () => {
  assert.doesNotThrow(() => validatePaymentPlan(
    { method: 'card', cardTotalMinor: 100000, cashTotalMinor: 0,
      confirmedCashMinor: 0, installmentCount: 3 }, 100000));
  // One minor unit out is a mismatch, not a rounding difference.
  assert.throws(() => validatePaymentPlan(
    { method: 'card', cardTotalMinor: 99999, cashTotalMinor: 0,
      confirmedCashMinor: 0, installmentCount: 3 }, 100000),
  (e) => e.code === 'PAYMENT_PLAN_SPLIT_MISMATCH');
  assert.throws(() => validatePaymentPlan(
    { method: 'card', cardTotalMinor: 100000, cashTotalMinor: 1,
      confirmedCashMinor: 0, installmentCount: 3 }, 100001),
  (e) => e.code === 'PAYMENT_PLAN_SPLIT_MISMATCH', 'a card plan may not carry cash');
  assert.throws(() => validatePaymentPlan(
    { method: 'mixed', cardTotalMinor: 100000, cashTotalMinor: 0,
      confirmedCashMinor: 0, installmentCount: 3 }, 100000),
  (e) => e.code === 'PAYMENT_PLAN_SPLIT_MISMATCH', 'mixed needs both sides');
  assert.throws(() => validatePaymentPlan(
    { method: 'cash', cardTotalMinor: 0, cashTotalMinor: 100000,
      confirmedCashMinor: 100001, installmentCount: 0 }, 100000),
  (e) => e.code === 'INVALID_CONFIRMED_CASH_AMOUNT', 'cannot confirm more than the total');
  assert.throws(() => validatePaymentPlan(
    { method: 'card', cardTotalMinor: 100000, cashTotalMinor: 0,
      confirmedCashMinor: 0, installmentCount: 121 }, 100000),
  (e) => e.code === 'INVALID_PAYMENT_PLAN_CARD_PARAMETERS');
});

test('due dates advance by month and clamp to a real day', () => {
  assert.equal(addMonths('2026-12-01', 0), '2026-12-01');
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28', 'a 31st cannot roll into March');
  assert.equal(addMonths('2026-12-31', 2), '2027-02-28', 'and it crosses the year correctly');
});

test('the payment summary is derived, not asserted', () => {
  const summary = derivePaymentSummary({
    plan: { currency: 'ILS', cardTotalMinor: 100000, cashTotalMinor: 0, cashPaidMinor: 0 },
    installments: [
      { status: 'paid', paidAmountMinor: 33333 },
      { status: 'scheduled', paidAmountMinor: 0 },
      { status: 'cancelled', paidAmountMinor: 99999 },
    ],
  });
  assert.equal(summary.visaConfirmedMinor, 33333, 'a cancelled row contributes nothing');
  assert.equal(summary.confirmedTotalMinor, 33333);
  assert.equal(summary.totalUnpaidMinor, 66667);
  assert.equal(summary.derivedPaymentStatus, 'partial');
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

test('an unauthenticated call is refused', async () => {
  await throwsCode(() => saveTripTransaction(deps, { auth: null, data: tripInput() }),
    'USER_NOT_AUTHENTICATED');
  await throwsCode(() => makeCallable(deps)({ data: tripInput() }), 'USER_NOT_AUTHENTICATED');
});

test('the caller cannot name someone else as the owner', async () => {
  // The schema is strict, so a smuggled ownership field is rejected outright
  // rather than being quietly ignored — which would be indistinguishable from
  // it being honoured, from the caller's point of view.
  const payload = tripInput();
  payload.trip.userId = UID_B;
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_A }, data: payload }),
    'INVALID_INPUT');

  const withOwner = tripInput();
  withOwner.ownerUid = UID_B;
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_A }, data: withOwner }),
    'INVALID_INPUT');
});

test('the written document is owned by the verified caller', async () => {
  const result = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() });
  const doc = (await target.db.collection('trips').doc(result.id).get()).data();
  assert.equal(doc.ownerUid, UID_A);
  assert.equal(doc.userId, UID_A);
  assert.equal(doc.businessId, BUSINESS_A, 'the tenant is resolved server-side');
});

test('another tenant cannot edit a trip, and cannot learn it exists', async () => {
  const created = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() });
  const edit = tripInput({ trip: { id: created.id, clientName: 'Stolen' } });
  // The same error as a genuinely missing trip, so the response cannot be used
  // to probe for other tenants' trip ids.
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_B }, data: edit }),
    'TRIP_NOT_FOUND_OR_ACCESS_DENIED');
  const missing = tripInput({ trip: { id: randomUUID(), clientName: 'X' } });
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_B }, data: missing }),
    'TRIP_NOT_FOUND_OR_ACCESS_DENIED');

  const after = (await target.db.collection('trips').doc(created.id).get()).data();
  assert.equal(after.clientName, 'عميل לדוגמה Client', 'the trip is unchanged');
});

test('a suspended user cannot write', async () => {
  await target.db.collection('users').doc(UID_A).update({ isSuspended: true });
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() }),
    'USER_SUSPENDED');
  await target.db.collection('users').doc(UID_A).update({ isSuspended: false });
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

test('installments divide exactly, with the remainder on the last row', async () => {
  const result = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() });
  const installments = (await target.db.collection('tripInstallments')
    .where('tripId', '==', result.id).get()).docs
    .map((d) => d.data())
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  assert.equal(installments.length, 3);
  assert.deepEqual(installments.map((i) => i.expectedAmountMinor), [33333, 33333, 33334]);
  // The schedule must sum to the card total exactly; a schedule that loses a
  // minor unit is a schedule that can never be paid off.
  assert.equal(installments.reduce((n, i) => n + i.expectedAmountMinor, 0), 100000);
  assert.deepEqual(installments.map((i) => i.dueDate),
    ['2026-12-01', '2027-01-01', '2027-02-01']);
});

test('server-computed totals ignore whatever the client believes', async () => {
  const result = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() });
  assert.equal(result.salePrice, '1000.00');
  assert.equal(result.profit, '300.00');
  assert.equal(result.amountPaid, '0.00', 'nothing is paid yet');
  assert.equal(result.amountDue, '1000.00');
  assert.equal(result.paymentStatus, 'unpaid');

  const doc = (await target.db.collection('trips').doc(result.id).get()).data();
  assert.equal(doc.amountPaid.unitsText, '0');
  assert.equal(doc.salePrice.unitsText, '100000');
  assert.equal(typeof doc.salePrice, 'object', 'money is never a bare number');
});

test('confirmed collection survives an edit', async () => {
  const created = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() });
  const installments = (await target.db.collection('tripInstallments')
    .where('tripId', '==', created.id).get()).docs
    .sort((a, b) => a.data().installmentNumber - b.data().installmentNumber);

  // Confirm the first installment, the way a payment workflow would.
  await installments[0].ref.update({ paidAmountMinor: 33333, status: 'paid' });

  // An edit that does not change the schedule is allowed and preserves it.
  const same = tripInput({ trip: { id: created.id, clientName: 'Renamed' } });
  const edited = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: same });
  assert.equal(edited.amountPaid, '333.33', 'the confirmed payment is counted');
  assert.equal(edited.paymentStatus, 'partial');

  const afterEdit = (await installments[0].ref.get()).data();
  assert.equal(afterEdit.paidAmountMinor, 33333, 'a confirmed row is not reset');
  assert.equal(afterEdit.status, 'paid');

  // A structural change to a plan with confirmed history is refused.
  const restructure = tripInput({
    trip: { id: created.id, clientName: 'Renamed' },
    paymentPlan: { installmentCount: 6 },
  });
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_A }, data: restructure }),
    'PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT');
});

// ---------------------------------------------------------------------------
// Idempotency and concurrency
// ---------------------------------------------------------------------------

test('a replayed request returns the original result and creates nothing new', async () => {
  const payload = tripInput();
  const first = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: payload });
  assert.equal(first.idempotentReplay, false);

  const second = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: payload });
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.id, first.id, 'the replay returns the same trip');
  assert.equal(second.amountDue, first.amountDue);

  const trips = await target.db.collection('trips').where('ownerUid', '==', UID_A)
    .where('clientRequestIdProbe', '==', 'never').get().catch(() => null);
  assert.equal(trips === null || trips.size === 0, true);

  const installments = await target.db.collection('tripInstallments')
    .where('tripId', '==', first.id).get();
  assert.equal(installments.size, 3, 'a replay must not duplicate the schedule');
  const activity = await target.db.collection('tripActivityLog')
    .where('tripId', '==', first.id).get();
  assert.equal(activity.size, 1, 'a replay must not duplicate the activity record');
});

test('the same request key from another user is a different request', async () => {
  const payload = tripInput();
  const a = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: payload });
  const b = await saveTripTransaction(deps, { auth: { uid: UID_B }, data: payload });
  assert.notEqual(a.id, b.id, 'the idempotency key is scoped to the caller');
  const aDoc = (await target.db.collection('trips').doc(a.id).get()).data();
  const bDoc = (await target.db.collection('trips').doc(b.id).get()).data();
  assert.equal(aDoc.ownerUid, UID_A);
  assert.equal(bDoc.ownerUid, UID_B);
});

test('concurrent duplicates produce exactly one trip', async () => {
  const payload = tripInput();
  // Fired together, these race on the idempotency document inside the
  // transaction. Firestore serialises them, so one commits and the rest either
  // replay it or retry into the replay path.
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => saveTripTransaction(
      deps, { auth: { uid: UID_A }, data: payload })));

  const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  assert.ok(fulfilled.length >= 1, 'at least one call must succeed');
  const ids = new Set(fulfilled.map((r) => r.id));
  assert.equal(ids.size, 1, 'every successful call must describe the same trip');

  const tripId = [...ids][0];
  const installments = await target.db.collection('tripInstallments')
    .where('tripId', '==', tripId).get();
  assert.equal(installments.size, 3, 'no duplicated installments');
  const activity = await target.db.collection('tripActivityLog')
    .where('tripId', '==', tripId).get();
  assert.equal(activity.size, 1, 'no duplicated activity events');
  const ledger = await target.db.collection('idempotency')
    .where('tripId', '==', tripId).get();
  assert.equal(ledger.size, 1, 'exactly one idempotency record');
});

test('two different trips saved concurrently both survive', async () => {
  const results = await Promise.all([
    saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() }),
    saveTripTransaction(deps, { auth: { uid: UID_A }, data: tripInput() }),
  ]);
  assert.notEqual(results[0].id, results[1].id);
  for (const r of results) {
    assert.equal((await target.db.collection('trips').doc(r.id).get()).exists, true);
  }
});

test('a rejected request leaves nothing behind', async () => {
  const before = (await target.db.collection('trips').where('ownerUid', '==', UID_A).get()).size;
  const bad = tripInput({ paymentPlan: { cardTotalMinor: 99999 } });
  await throwsCode(() => saveTripTransaction(deps, { auth: { uid: UID_A }, data: bad }),
    'PAYMENT_PLAN_SPLIT_MISMATCH');
  const after = (await target.db.collection('trips').where('ownerUid', '==', UID_A).get()).size;
  assert.equal(after, before, 'a rejected save must not create a partial trip');

  // And the idempotency key stays free, so a corrected retry can proceed.
  const fixed = { ...bad, paymentPlan: { ...bad.paymentPlan, cardTotalMinor: 100000 } };
  const ok = await saveTripTransaction(deps, { auth: { uid: UID_A }, data: fixed });
  assert.equal(ok.idempotentReplay, false);
});

test('the transaction body performs no external side effect', async () => {
  // A transaction body can run several times. Anything with an outside effect
  // in it would happen several times too, so the source is checked for the
  // shapes that would do that.
  const source = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../functions/save-trip-transaction.mjs', import.meta.url), 'utf8'));
  const body = source.slice(source.indexOf('runTransaction'));
  for (const forbidden of [/\bfetch\s*\(/, /\baxios\b/, /sendMail/, /\bhttps?\.request/,
    /child_process/, /writeFile/, /\bconsole\.(log|error|warn)\s*\(/]) {
    assert.equal(forbidden.test(body), false,
      `the transaction body must not contain ${forbidden}`);
  }
  // Math.random and Date.now inside a retried body produce different values on
  // each attempt; `now` is injected once, before the transaction starts.
  assert.equal(/Math\.random\(\)/.test(body), false);
});
