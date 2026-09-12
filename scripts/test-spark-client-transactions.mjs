import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  connectFirestoreEmulator, collection, doc, getDoc, getDocs, getFirestore,
  query, updateDoc, where,
} from 'firebase/firestore';
import { SparkTransactionService } from '../src/data/SparkTransactionService.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

const projectId = 'mydesck-migration-proof';
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const credentials = JSON.parse(readFileSync('migration/app-layer.local/app-credentials.json', 'utf8'));
assert.ok(credentials.users.every(user => user.email.startsWith('migration-test--')));
const admin = RulesClient.asAdminBypass({ host, projectId });
const created = [];
let passed = false;

async function clientFor(user, name) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  await signInWithEmailAndPassword(auth, user.email, credentials.password);
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const profile = userDoc.data();
  const businesses = await getDocs(query(collection(db, 'businesses'), where('ownerUid', '==', user.uid)));
  assert.equal(businesses.size, 1);
  return { app, auth, db, scope: { uid: user.uid, businessId: profile.businessId ?? businesses.docs[0].id } };
}

const alice = await clientFor(credentials.users[0], `spark-alice-${Date.now()}`);
const bob = await clientFor(credentials.users[1], `spark-bob-${Date.now()}`);
const service = new SparkTransactionService(alice.db);
const requestId = crypto.randomUUID();
const input = {
  clientRequestId: requestId,
  trip: {
    clientName: 'migration-test-- Spark client',
    destination: 'Paris / פריז / باريس',
    startDate: '2027-01-01',
    endDate: '2027-01-08',
    currency: 'ILS',
    travelersCount: 2,
    travelers: [{ name: 'migration-test-- traveler' }],
    salePriceMinor: 123457,
    wholesaleCostMinor: 98713,
  },
  paymentPlan: {
    method: 'mixed',
    cardTotalMinor: 100001,
    cashTotalMinor: 23456,
    confirmedCashMinor: 0,
    installmentCount: 3,
    firstDate: '2027-01-01',
  },
};

try {
  const first = await service.saveTrip(alice.scope, input);
  console.log('spark-stage=trip-created');
  created.push(['trips', first.id], ['tripPaymentPlans', `plan__${first.id}`],
    ...[1, 2, 3].map(n => ['tripInstallments', `installment__${first.id}__${n}`]),
    ['tripActivityLog', `${alice.scope.uid}__${requestId}`],
    ['sparkOperations', `${alice.scope.uid}__${requestId}`]);
  assert.equal(first.id, requestId);
  assert.equal(first.idempotentReplay, false);
  const replay = await service.saveTrip(alice.scope, input);
  assert.deepEqual(replay, { id: first.id, idempotentReplay: true });

  const trip = (await getDoc(doc(alice.db, 'trips', first.id))).data();
  assert.equal(trip.amountDueMinor, 123457);
  assert.equal(trip.profitMinor, 24744);
  const installments = await getDocs(query(collection(alice.db, 'tripInstallments'),
    where('ownerUid', '==', alice.scope.uid), where('businessId', '==', alice.scope.businessId),
    where('tripId', '==', first.id)));
  assert.equal(installments.size, 3);
  assert.deepEqual(installments.docs.map(row => row.data().expectedAmountMinor).sort((a, b) => a - b),
    [33333, 33333, 33335]);

  const paymentRequest = crypto.randomUUID();
  const payment = { clientRequestId: paymentRequest, tripId: first.id, currency: 'ILS', amount: '12.03' };
  const results = await Promise.all([service.recordPayment(alice.scope, payment), service.recordPayment(alice.scope, payment)]);
  console.log('spark-stage=cash-payment-created');
  assert.equal(new Set(results.map(result => result.eventId)).size, 1);
  assert.equal((await getDoc(doc(alice.db, 'trips', first.id))).data().amountPaidMinor, 1203);
  for (const name of ['sparkOperations','tripPaymentEvents','tripFinancialAudit','tripActivityLog'])
    created.push([name, `${alice.scope.uid}__${paymentRequest}`]);

  const installmentRequest = crypto.randomUUID();
  const installmentId = `installment__${first.id}__1`;
  await service.recordPayment(alice.scope, {
    clientRequestId: installmentRequest, tripId: first.id, installmentId, currency: 'ILS', amount: '100.01',
  }, true);
  console.log('spark-stage=installment-payment-created');
  for (const name of ['sparkOperations','tripPaymentEvents','tripInstallmentEvents','tripFinancialAudit','tripActivityLog'])
    created.push([name, `${alice.scope.uid}__${installmentRequest}`]);
  assert.equal((await getDoc(doc(alice.db, 'trips', first.id))).data().amountPaidMinor, 11204);
  assert.equal((await getDoc(doc(alice.db, 'tripInstallments', installmentId))).data().paidAmountMinor, 10001);

  await assert.rejects(() => updateDoc(doc(bob.db, 'trips', first.id), { businessId: bob.scope.businessId }),
    error => error?.code === 'permission-denied');
  await assert.rejects(() => updateDoc(doc(alice.db, 'trips', first.id), { amountPaidMinor: 999999 }),
    error => error?.code === 'permission-denied');
  await assert.rejects(() => updateDoc(doc(alice.db, 'users', alice.scope.uid), { role: 'admin' }),
    error => error?.code === 'permission-denied');
  await assert.rejects(() => updateDoc(doc(alice.db, 'tripPaymentEvents', `${alice.scope.uid}__${paymentRequest}`),
    { amountMinor: 1 }), error => error?.code === 'permission-denied');

  const stateRequest = crypto.randomUUID();
  await service.setTripState(alice.scope, first.id, 'archive', stateRequest);
  created.push(['sparkOperations', `${alice.scope.uid}__${stateRequest}`],
    ['tripActivityLog', `${alice.scope.uid}__${stateRequest}`]);
  assert.equal((await getDoc(doc(alice.db, 'trips', first.id))).data().status, 'archived');

  passed = true;
  console.log('Spark client-SDK atomic operations and malicious-client denials: PASS (18 assertions)');
} finally {
  for (const [name, id] of [...created].reverse()) await admin.delete(`${name}/${id}`);
  await signOut(alice.auth); await signOut(bob.auth);
  await deleteApp(alice.app); await deleteApp(bob.app);
}
if (passed) writeFileSync('migration/reports/firestore-spark-client-smoke.json', `${JSON.stringify({
  generatedAt: new Date().toISOString(), target: 'EMULATOR', status: 'PASS', clientSdk: true,
  auth: 'PASS', trip: 'PASS', payment: 'PASS', installment: 'PASS', idempotency: 'PASS',
  crossTenant: 'DENIED', financialTamper: 'DENIED', selfAdmin: 'DENIED', cleanup: 'PASS',
  productionCustomerWrites: 0,
}, null, 2)}\n`);
