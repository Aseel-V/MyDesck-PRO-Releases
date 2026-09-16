/**
 * Tourism on Firebase Auth + Firestore + Rules.
 *
 * Repository behaviour runs through FirestoreTravelRepository exactly as the trip screens call it: saving a trip with a
 * cash or a card plan, editing it, the trash, the payment ledger (receipts, reschedules, recalculation), activity and
 * audit history, the notification bell, notification settings, the Visa arrivals materialization, templates, packing
 * lists and the WhatsApp composer's refusals. What the write models decide is proven against the source database by
 * migration/firestore/tools/travel-write-parity.mjs, travel-command-parity.mjs and travel-side-parity.mjs; what is
 * proven here is that the documents reach Firestore through the Rules, read back as the source rows, and that a
 * malicious client cannot write money the ledger does not support.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-travel.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreTravelRepository } from '../src/data/firestore/FirestoreTravelRepository.ts';
import { createFirestoreBackend } from '../src/data/firestore/createFirestoreBackend.ts';
import { registerBackend, resetBackendForTests } from '../src/data/backend.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { storedDecimalToNumber } from '../src/data/firestore/exactValues.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

const PROJECT = process.env.MYDESCK_TEST_PROJECT ?? 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Travel-${RUN}-9!`;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const [HOST, PORT] = FIRESTORE_HOST.split(':');
const options = { projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' };
const accounts = new Set();
const handles = [];
const tenants = [];
const denied = (error) => error?.code === 'permission-denied';
/** Top-level collections a tourism tenant writes into, cleaned up by owner at the end of the run. */
const OWNED = ['trips', 'tripPaymentPlans', 'tripInstallments', 'tripActivityLog', 'tripFinancialAudit',
  'tripPaymentEvents', 'tripInstallmentEvents', 'tripNotifications', 'tripTemplates', 'tripWhatsappTemplates',
  'storageCleanupQueue', 'tripPlans', 'sparkOperations'];

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

function isolatedIdentity() {
  const app = initializeApp(options, `travel-isolated-${randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT));
  return { auth, db, dispose: () => deleteApp(app) };
}

function client(label) {
  const app = initializeApp(options, `travel-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT));
  const config = { mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity };
  const session = new FirebaseSession(config);
  const handle = { label, app, auth, db, config, session, repo: new FirestoreTravelRepository(session) };
  handles.push(handle);
  return handle;
}

const emailOf = (label) => `migration-test--travel-${label}-${RUN}@example.com`;

async function owner(label) {
  const handle = client(label);
  const user = await new FirestoreAuthGateway(handle.session).signUp(emailOf(label), PASSWORD);
  accounts.add(user.id);
  await new FirestoreProfileRepository(handle.session)
    .createOwnerProfiles(user.id, emailOf(label), { businessName: `Travel ${label}`, logoUrl: null, currency: 'ILS', language: 'en' });
  const business = await handle.session.requireOwnedBusiness();
  await bypass.update(`businesses/${business.businessId}`, { businessType: 'tourism' });
  tenants.push({ uid: user.id, businessId: business.businessId });
  return Object.assign(handle, { uid: user.id, businessId: business.businessId, email: emailOf(label) });
}

/** NewTripForm's payload: the fields the form fills, with a payment plan draft when the trip is paid in instalments. */
const form = (overrides = {}) => ({
  destination: 'Athens', client_name: 'Dina Cohen', client_phone: '0521234567',
  travelers: [{ full_name: 'Dina Cohen' }], travelers_count: 2, itinerary: [],
  start_date: '2027-05-01', end_date: '2027-05-06',
  currency: 'ILS', exchange_rate: 1, wholesale_cost: 1000, sale_price: 1500,
  payments: [], payment_status: 'unpaid', amount_paid: 0, payment_date: '2027-04-01',
  payment_method: 'cash', card_paid_amount: null, cash_paid_amount: null, payment_plan: null,
  room_type: {}, board_basis: 'BB', hotel_name: 'Hotel Athens', service_type: 'both',
  trip_type: 'round_trip', notes: '', status: 'active', ...overrides,
});
const cardForm = (overrides = {}) => form({
  payment_method: 'card', sale_price: 1500,
  payment_plan: { card_total: 1500, cash_total: 0, installment_count: 3, first_installment_date: '2030-01-15' }, ...overrides,
});
const mixedForm = (overrides = {}) => form({
  payment_method: 'mixed', sale_price: 1500, cash_paid_amount: 0,
  payment_plan: { card_total: 900, cash_total: 600, installment_count: 3, first_installment_date: '2030-01-15' }, ...overrides,
});

const raw = async (handle, path) => (await getDoc(doc(handle.db, path))).data();
const money = (value) => storedDecimalToNumber(value);
const s = {};

before(async () => {
  await loadRules();
  s.a = await owner('a');
  s.b = await owner('b');
  s.anonymous = client('anonymous');
  // The trip screens reach the backend through the registry; save_trip probes the payment contract through it.
  resetBackendForTests();
  registerBackend(createFirestoreBackend(s.a.config));
});

after(async () => {
  for (const handle of handles) {
    await signOut(handle.auth).catch(() => undefined);
    await deleteApp(handle.app).catch(() => undefined);
  }
  const base = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (const tenant of tenants) {
    for (const name of OWNED) {
      const listing = await fetch(`${base}/${name}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
        .then((response) => response.json()).catch(() => ({}));
      for (const document of listing.documents ?? []) {
        const path = document.name.split('/documents/')[1];
        const fields = document.fields ?? {};
        const uid = fields.ownerUid?.stringValue ?? fields.actorUid?.stringValue ?? null;
        if (uid === tenant.uid) await bypass.delete(path);
      }
    }
    const requests = await fetch(`${base}/idempotency?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
      .then((response) => response.json()).catch(() => ({}));
    for (const document of requests.documents ?? []) {
      if (document.fields?.ownerUid?.stringValue === tenant.uid) await bypass.delete(document.name.split('/documents/')[1]);
    }
    await bypass.delete(`users/${tenant.uid}/settings/${tenant.uid}`);
    await bypass.delete(`businesses/${tenant.businessId}`);
    await bypass.delete(`businessOwners/${tenant.uid}`);
    await bypass.delete(`users/${tenant.uid}`);
  }
  for (const localId of accounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
  resetBackendForTests();
});

test('a cash trip saves as one transaction: the trip, its plan, the index, history and the request ledger', async () => {
  const requestId = randomUUID();
  const saved = await s.a.repo.saveTrip(s.a.uid, form(), undefined, requestId);
  assert.equal(saved.destination, 'Athens');
  assert.equal(saved.sale_price, 1500);

  const trip = await raw(s.a, `trips/${saved.id}`);
  assert.equal(trip.ownerUid, s.a.uid);
  assert.equal(trip.businessId, s.a.businessId);
  assert.equal(trip.revision, 1);
  assert.equal(trip.salePriceMinor, 150000);
  assert.equal(trip.amountDueMinor, 150000, 'amount_due is generated from sale price and amount paid');
  assert.equal(trip.profitMinor, 50000);
  assert.equal(money(trip.salePrice), 1500);
  assert.equal(trip.searchDocument, 'athens dina cohen hotel athens active unpaid');
  assert.equal(trip.clientPhone, '+972521234567', 'normalize_trip_client_phone');

  const index = await raw(s.a, `tripPlans/${saved.id}`);
  assert.ok(index, 'the trip has a live native plan, so the index names it');
  const plan = await raw(s.a, `tripPaymentPlans/${index.planId}`);
  assert.equal(plan.tripId, saved.id);
  assert.equal(plan.paymentMethod, 'cash');
  assert.equal(plan.cashTotalMinor, 150000);
  assert.equal(plan.cardTotalMinor, 0);

  const ledger = await s.a.repo.getTripPaymentPlan(saved.id);
  assert.equal(ledger.plan.id, index.planId);
  assert.deepEqual(ledger.installments, []);

  const activity = await s.a.repo.getTripActivityPage(saved.id, 1);
  assert.ok(activity.total_count >= 2, 'the trigger row and the transaction row');
  assert.ok(activity.items.every((item) => item.trip_id === saved.id));
  const audit = await s.a.repo.getTripFinancialAuditPage(saved.id, 1);
  assert.ok(audit.total_count >= 1, 'the financial audit trigger wrote the initial values');

  const request = await bypass.get(`idempotency/${s.a.uid}__${requestId}`);
  assert.equal(request.status, 200, 'the write request is recorded for replay');
  s.cashTrip = saved.id;
});

test('a replayed save returns the first result and writes nothing new', async () => {
  const requestId = randomUUID();
  const first = await s.a.repo.saveTrip(s.a.uid, form({ destination: 'Rhodes' }), undefined, requestId);
  const owned = () => query(collection(s.a.db, 'trips'), where('ownerUid', '==', s.a.uid), where('businessId', '==', s.a.businessId));
  const countBefore = (await getDocs(owned())).size;
  const second = await s.a.repo.saveTrip(s.a.uid, form({ destination: 'Rhodes' }), undefined, requestId);
  assert.equal(second.id, first.id);
  const countAfter = (await getDocs(owned())).size;
  assert.equal(countAfter, countBefore, 'a replay creates no second trip');
});

test('a card plan divides exactly, with the remainder on the last instalment', async () => {
  const saved = await s.a.repo.saveTrip(s.a.uid, cardForm({
    sale_price: 1000.03,
    payment_plan: { card_total: 1000.03, cash_total: 0, installment_count: 3, first_installment_date: '2030-01-15' },
  }), undefined, randomUUID());
  const { plan, installments } = await s.a.repo.getTripPaymentPlan(saved.id);
  assert.equal(plan.card_total_minor, 100003);
  assert.equal(installments.length, 3);
  assert.deepEqual(installments.map((row) => row.expected_amount_minor), [33334, 33334, 33335]);
  assert.deepEqual(installments.map((row) => row.due_date), ['2030-01-15', '2030-02-15', '2030-03-15']);
  assert.equal(installments.reduce((sum, row) => sum + row.expected_amount_minor, 0), 100003);
  s.cardTrip = saved.id;
  s.cardPlan = plan.id;
  s.cardInstallments = installments.map((row) => row.id);
});

test('an edit keeps the trip, moves the revision and appends history', async () => {
  const before = await raw(s.a, `trips/${s.cashTrip}`);
  const saved = await s.a.repo.saveTrip(s.a.uid, form({ sale_price: 1800, hotel_name: 'Hotel Plaka' }), s.cashTrip, randomUUID());
  assert.equal(saved.id, s.cashTrip);
  const after = await raw(s.a, `trips/${s.cashTrip}`);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.salePriceMinor, 180000);
  assert.equal(after.profitMinor, 80000, 'profit follows the new sale price');
  assert.equal(after.searchDocument, 'athens dina cohen hotel plaka active unpaid');
  const audit = await s.a.repo.getTripFinancialAuditPage(s.cashTrip, 1);
  assert.ok(audit.items.some((item) => item.changed_field === 'sale_price'), 'the sale price change is audited');
});

test('a manual Visa receipt moves the plan total and the trip together', async () => {
  await s.a.repo.recordInstallmentPayment(s.cardInstallments[0], 33334, '2030-01-16T09:00:00Z', ' paid ');
  const plan = await raw(s.a, `tripPaymentPlans/${s.cardPlan}`);
  assert.equal(plan.cardPaidMinor, 33334, 'card_paid_minor is the sum of receipted instalments');
  const trip = await raw(s.a, `trips/${s.cardTrip}`);
  assert.equal(trip.amountPaidMinor, 33334, 'the trip total is derived from the ledger');
  assert.equal(trip.paymentStatus, 'partial');
  const events = await s.a.repo.listInstallmentEvents(s.cardInstallments[0]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'paid');

  await s.a.repo.recordInstallmentPayment(s.cardInstallments[0], 0, '2030-01-17T09:00:00Z', null);
  const undone = await raw(s.a, `tripPaymentPlans/${s.cardPlan}`);
  assert.equal(undone.cardPaidMinor, 0, 'undoing a receipt takes it back out');
  assert.equal((await raw(s.a, `trips/${s.cardTrip}`)).paymentStatus, 'unpaid');
});

test('reschedule, recalculate and the plan creation defect the source still has', async () => {
  await s.a.repo.rescheduleInstallment(s.cardInstallments[1], '2030-04-01');
  const { installments } = await s.a.repo.getTripPaymentPlan(s.cardTrip);
  assert.equal(installments.find((row) => row.id === s.cardInstallments[1]).due_date, '2030-04-01');

  await s.a.repo.recalculateFutureInstallments(s.cardPlan, 120000);
  const after = await s.a.repo.getTripPaymentPlan(s.cardTrip);
  assert.equal(after.plan.card_total_minor, 120000);
  assert.equal(after.installments.reduce((sum, row) => sum + row.expected_amount_minor, 0), 120000);

  // create_trip_payment_plan aliases trip_installments as `i`, which collides with its loop variable:
  // production fails a card or mixed plan with 42702, and so does this.
  const plain = await s.a.repo.saveTrip(s.a.uid, form({ payment_method: null, payment_plan: null }), undefined, randomUUID());
  await assert.rejects(
    () => s.a.repo.createTripPaymentPlan({ tripId: plain.id, method: 'card', currency: 'ILS', cardTotalMinor: 150000, cashTotalMinor: 0, installmentCount: 3, firstDate: '2030-02-28' }),
    (error) => error.code === '42702');
  assert.equal(await raw(s.a, `tripPlans/${plain.id}`), undefined, 'the refused plan left no index behind');
});

test('the trash: soft delete, restore, and a permanent delete that takes the ledger with it', async () => {
  const saved = await s.a.repo.saveTrip(s.a.uid, mixedForm({ destination: 'Crete' }), undefined, randomUUID());
  const planId = (await raw(s.a, `tripPlans/${saved.id}`)).planId;
  await s.a.repo.deleteTrip(s.a.uid, saved.id);
  const trash = await s.a.repo.getDeletedTripsPage(1, '', 20);
  assert.ok(trash.items.some((item) => item.id === saved.id));
  assert.equal(await s.a.repo.restoreDeletedTrips([saved.id]), 1);
  assert.equal((await raw(s.a, `trips/${saved.id}`)).isDeleted, false);

  await s.a.repo.deleteTrip(s.a.uid, saved.id);
  assert.equal(await s.a.repo.permanentlyDeleteTrips([saved.id]), 1);
  assert.equal(await raw(s.a, `trips/${saved.id}`), undefined, 'the trip is gone');
  assert.equal(await raw(s.a, `tripPaymentPlans/${planId}`), undefined, 'the plan cascaded');
  assert.equal(await raw(s.a, `tripPlans/${saved.id}`), undefined, 'the index went with it');
  const installments = await getDocs(query(collection(s.a.db, 'tripInstallments'), where('ownerUid', '==', s.a.uid), where('businessId', '==', s.a.businessId), where('tripId', '==', saved.id)));
  assert.equal(installments.size, 0, 'the schedule cascaded');
  const jobs = await s.a.repo.listFailedCleanupJobs();
  assert.equal(jobs.length, 0, 'the queued cleanup job is pending, not failed');
  const activity = await getDocs(query(collection(s.a.db, 'tripActivityLog'), where('ownerUid', '==', s.a.uid), where('businessId', '==', s.a.businessId), where('tripId', '==', saved.id)));
  assert.ok(activity.size > 0, 'trip_activity_log has no foreign key, so its rows survive the purge');
});

test('trip state, itinerary and the phone the WhatsApp dialog writes', async () => {
  await s.a.repo.archiveTrip(s.a.uid, s.cashTrip, true);
  assert.equal((await raw(s.a, `trips/${s.cashTrip}`)).status, 'archived');
  await s.a.repo.archiveTrip(s.a.uid, s.cashTrip, false);
  await s.a.repo.toggleExport(s.a.uid, s.cashTrip, true);
  assert.equal((await raw(s.a, `trips/${s.cashTrip}`)).exportToPdf, true);
  await s.a.repo.updateTripItinerary(s.cashTrip, [{ day: 1, title: 'Arrival', description: 'Check in' }]);
  const details = await s.a.repo.getTripDetails(s.cashTrip);
  assert.equal(details.itinerary.length, 1);
  await s.a.repo.updateTripClientPhone(s.a.uid, s.cashTrip, '+972 54 765 4321');
  assert.equal((await raw(s.a, `trips/${s.cashTrip}`)).clientPhone, '+972547654321');
  await assert.rejects(() => s.a.repo.updateTripClientPhone(s.a.uid, s.cashTrip, 'call me'),
    (error) => error.message === 'PHONE_UPDATE_FAILED');
});

test('activity logging refuses an unsupported type and unsafe metadata', async () => {
  await s.a.repo.logTripActivity(s.cashTrip, 'whatsapp_prepared', { action: 'whatsapp_opened' });
  const page = await s.a.repo.getTripActivityPage(s.cashTrip, 1);
  assert.ok(page.items.some((item) => item.activity_type === 'whatsapp_prepared'));
  await assert.rejects(() => s.a.repo.logTripActivity(s.cashTrip, 'trip_edited', {}), (error) => error.code === 'P0001');
  await assert.rejects(() => s.a.repo.logTripActivity(s.cashTrip, 'pdf_generated', { url: 'https://example.invalid/x' }),
    (error) => error.code === 'P0001');
});

test('the notification bell, its settings and the Visa arrivals materialization', async () => {
  const codec = s.a.session.codec();
  const notification = encodeInsert('trip_notifications', {
    id: randomUUID(), user_id: s.a.uid, trip_id: s.cashTrip, notification_type: 'upcoming_trip',
    title_key: 'notifications.travel.upcomingTitle', body_key: 'notifications.travel.upcomingBody',
    params: { destination: 'Athens' }, dedupe_key: `upcoming:${s.cashTrip}:${RUN}`,
    scheduled_for: '2027-04-01T00:00:00Z', created_at: '2027-04-01T00:00:00Z',
  }, codec, { ownerUid: s.a.uid, businessId: s.a.businessId });
  assert.equal((await bypass.create('tripNotifications', notification.id, notification.data)).ok, true, 'seeded as the generator writes it');

  assert.ok((await s.a.repo.listTripNotifications()).some((row) => row.id === notification.id));
  await s.a.repo.markAllTripNotificationsRead();
  assert.ok((await s.a.repo.listTripNotifications()).find((row) => row.id === notification.id).read_at);
  await s.a.repo.snoozeTripNotification(notification.id, '2027-04-05T00:00:00Z');
  await s.a.repo.dismissTripNotification(notification.id);
  assert.equal((await s.a.repo.listTripNotifications()).some((row) => row.id === notification.id), false,
    'a dismissed notification leaves the bell');

  assert.equal(await s.a.repo.getTripNotificationSettings(s.a.uid), null);
  await s.a.repo.saveTripNotificationSettings(s.a.uid, {
    timezone: 'Asia/Jerusalem', upcoming_enabled: true, upcoming_days: 14, trip_reminder_days: [30, 7, 0],
    payment_enabled: true, payment_reminder_days: [7, 0], cleanup_enabled: false, retention_enabled: true,
  });
  const settings = await s.a.repo.getTripNotificationSettings(s.a.uid);
  assert.equal(settings.upcoming_days, 14);
  assert.deepEqual(settings.trip_reminder_days, [30, 7, 0]);
  assert.equal(settings.cleanup_enabled, false);

  // Visa arrivals: a due instalment on a native plan, after the feature rollout, becomes one event.
  await bypass.set('featureRollouts/visa-date-collection-v1', encodeInsert('travel_payment_feature_rollouts',
    { feature_key: 'visa-date-collection-v1', installed_at: '2020-01-01T00:00:00Z' }, codec, { ownerUid: null, businessId: null }).data);
  const dueTrip = await s.a.repo.saveTrip(s.a.uid, cardForm({ destination: 'Larnaca', payment_plan: { card_total: 1500, cash_total: 0, installment_count: 2, first_installment_date: '2021-01-15' } }), undefined, randomUUID());
  const arrivals = await s.a.repo.listUnseenVisaArrivalRows();
  const mine = arrivals.filter((row) => row.trip_id === dueTrip.id);
  assert.equal(mine.length, 2, 'both elapsed instalments materialized');
  assert.equal(mine[0].params.destination, 'Larnaca');
  const again = await s.a.repo.listUnseenVisaArrivalRows();
  assert.equal(again.filter((row) => row.trip_id === dueTrip.id).length, 2, 'the dedupe key makes it idempotent');
});

test('templates, packing lists and the WhatsApp composer the production table cannot serve', async () => {
  await s.a.repo.saveTripTemplate(s.a.uid, { name: 'Athens 5 nights', description: ' city break ', data: { destination: 'Athens', duration_days: 5 }, templateType: 'full_trip' });
  const [template] = await s.a.repo.listTripTemplates('', undefined, false);
  assert.equal(template.name, 'Athens 5 nights');
  assert.equal(template.description, 'city break');
  assert.equal(template.usage_count, 0);
  await s.a.repo.recordTripTemplateUse(template.id);
  assert.equal((await s.a.repo.getTripTemplate(template.id)).usage_count, 1);
  await s.a.repo.toggleTripTemplateFavorite(template.id, true);
  await s.a.repo.updateTripTemplateStatus(template.id, 'archived');
  assert.equal((await s.a.repo.listTripTemplates('', undefined, false)).length, 0, 'an archived template leaves the active list');
  await s.a.repo.softDeleteTripTemplate(template.id);
  assert.equal((await s.a.repo.listTripTemplates('', undefined, true)).length, 0);

  await s.a.repo.createPackingList(s.a.uid, s.cashTrip, 'Carry on', [{ category: 'bag', label: 'Charger', checked: false }]);
  const lists = await getDocs(query(collection(s.a.db, 'trips', s.cashTrip, 'packingLists'),
    where('ownerUid', '==', s.a.uid), where('businessId', '==', s.a.businessId)));
  assert.equal(lists.size, 1);
  assert.equal(lists.docs[0].data().name, 'Carry on');

  await assert.rejects(() => s.a.repo.listWhatsappTemplates(), (error) => error.code === '42703');
  await assert.rejects(
    () => s.a.repo.saveWhatsappTemplate(s.a.uid, { name: 'Reminder', body: 'Hello', language: 'en', category: 'payment' }),
    (error) => error.code === 'PGRST204', 'production has no category column, so the composer save fails there and here');
});

test('another tenant sees nothing and can write nothing', async () => {
  assert.deepEqual((await s.b.repo.searchTrips(s.b.uid)).map((trip) => trip.id), []);
  assert.equal((await s.b.repo.getTripsPage({ year: '2027', page: 1, pageSize: 20 })).total_count, 0);
  assert.equal(await s.b.repo.getTripDetails(s.cashTrip), null, 'a trip of another tenant does not exist to this one');
  await assert.rejects(() => updateDoc(doc(s.b.db, `trips/${s.cashTrip}`), { destination: 'Stolen' }), denied);
  await assert.rejects(() => getDoc(doc(s.anonymous.db, `trips/${s.cashTrip}`)), denied);
});

test('malicious clients cannot write money the ledger does not support', async () => {
  const trip = await raw(s.a, `trips/${s.cardTrip}`);
  const operationId = trip.lastOperationId;

  await assert.rejects(() => updateDoc(doc(s.a.db, `trips/${s.cardTrip}`), {
    amountPaid: { unitsText: '150000', units: 150000, scale: 2, decimal: '1500.00' }, amountPaidMinor: 150000,
    amountDue: { unitsText: '0', units: 0, scale: 2, decimal: '0.00' }, amountDueMinor: 0, paymentStatus: 'paid',
    revision: trip.revision + 1, lastOperationId: operationId,
  }), denied, 'an operation that already exists cannot authorise a new write');

  await assert.rejects(() => updateDoc(doc(s.a.db, `trips/${s.cardTrip}`), { destination: 'Detached' }), denied,
    'a trip edit without its operation document is refused');

  await assert.rejects(() => setDoc(doc(s.a.db, `tripActivityLog/${'0'.repeat(19)}`), {
    id: 0, sequence: 0, tripId: s.cardTrip, userId: s.a.uid, ownerUid: s.a.uid, businessId: s.a.businessId,
    activityType: 'trip_edited', metadata: {}, metadataEncoding: 'native', createdAt: new Date(), isDeleted: false,
    schemaVersion: 1, transformVersion: 'app-v1', lastOperationId: operationId, sequenceParent: s.cardTrip,
  }), denied, 'history cannot be forged in front of the rows that exist');

  await assert.rejects(() => updateDoc(doc(s.a.db, `tripInstallments/${s.cardInstallments[2]}`), {
    paidAmountMinor: 40000, status: 'paid', paidAt: new Date(),
  }), denied, 'an instalment cannot mark itself paid without moving the plan');

  await assert.rejects(() => setDoc(doc(s.a.db, `tripPlans/${s.cardTrip}`), {
    tripId: s.cardTrip, planId: randomUUID(), ownerUid: s.a.uid, businessId: s.a.businessId,
    lastOperationId: operationId, schemaVersion: 1,
  }), denied, 'the plan index cannot be pointed at a plan that does not exist');

  await assert.rejects(() => getDoc(doc(s.a.db, `idempotency/${s.a.uid}__anything`)), denied,
    'the request ledger stays invisible, so a client cannot learn whether a payment happened');
});
