#!/usr/bin/env node
/**
 * Firestore Security Rules controls.
 *
 * The matrix below is the point of the file: for every protected collection,
 * anonymous / owner / other tenant / admin are each checked against read,
 * create, update and delete. A rule that is right for the owner and wrong for
 * the neighbour is the failure mode that matters.
 *
 * The last section is a negative control on the RULES THEMSELVES: deliberately
 * insecure rules are loaded into the emulator and the suite requires that the
 * cross-tenant checks start failing. A security suite that still passes against
 * `allow read: if true` is not a security suite.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node --test migration/firestore/tests/rules.test.mjs
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RulesClient, isDenied, isAllowed } from '../lib/rules-client.mjs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'mydesck-migration-proof';
const RULES_PATH = 'migration/firestore/rules/firestore.rules';
const options = { host: HOST, projectId: PROJECT };

const UID_A = 'rules-test-owner-a';
const UID_B = 'rules-test-owner-b';
const BUSINESS_A = 'rules-test-business-a';
const BUSINESS_B = 'rules-test-business-b';
const TRIP_A = 'rules-test-trip-a';
const PLAN_A = 'rules-test-plan-a';
const INSTALLMENT_A = 'rules-test-installment-a';
const AUDIT_A = 'rules-test-audit-a';
const EVENT_A = 'rules-test-event-a';

const admin = RulesClient.asAdminBypass(options);
const anon = RulesClient.asAnonymous(options);
const alice = RulesClient.asUser(UID_A, options);
const bob = RulesClient.asUser(UID_B, options);
const superuser = RulesClient.asUser('rules-test-admin', options, { admin: true });

/** Load a rules source into the running emulator. */
async function loadRules(content) {
  const response = await fetch(
    `http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED: ${response.status}`);
}

const PRODUCTION_RULES = readFileSync(RULES_PATH, 'utf8');

const amount = (unitsText, scale = 2) => ({ unitsText, scale, units: Number(unitsText), currency: 'ILS' });

/** Fixtures are seeded with the admin bypass, never through the rules. */
const FIXTURES = [
  ['users', UID_A, { uid: UID_A, userId: UID_A, role: 'user', isSuspended: false, canViewFinancials: false,
    fullName: 'Alice', businessId: BUSINESS_A, schemaVersion: 1 }],
  ['users', UID_B, { uid: UID_B, userId: UID_B, role: 'user', isSuspended: false, canViewFinancials: false,
    fullName: 'Bob', businessId: BUSINESS_B, schemaVersion: 1 }],
  ['businesses', BUSINESS_A, { ownerUid: UID_A, businessId: BUSINESS_A, businessName: 'Alice Travel', isSuspended: false }],
  ['businesses', BUSINESS_B, { ownerUid: UID_B, businessId: BUSINESS_B, businessName: 'Bob Travel', isSuspended: false }],
  ['trips', TRIP_A, { ownerUid: UID_A, businessId: BUSINESS_A, clientName: 'Client',
    destination: 'Paris', isDeleted: false, status: 'active', paymentStatus: 'unpaid',
    id: TRIP_A, userId: UID_A, currency: 'ILS', revision: 1, moneyScale: 2,
    salePriceMinor: 91843, wholesaleCostMinor: 70000, amountPaidMinor: 0,
    amountDueMinor: 91843, profitMinor: 21843,
    salePrice: amount('91843'), wholesaleCost: amount('70000'), amountPaid: amount('0'),
    amountDue: amount('91843'), profit: amount('21843'), schemaVersion: 1 }],
  ['tripPaymentPlans', PLAN_A, { id: PLAN_A, ownerUid: UID_A, businessId: BUSINESS_A, tripId: TRIP_A, currency: 'ILS',
    cardTotalMinor: 91843, cashTotalMinor: 0 }],
  ['tripInstallments', INSTALLMENT_A, { id: INSTALLMENT_A, ownerUid: UID_A, businessId: BUSINESS_A, tripId: TRIP_A,
    paymentPlanId: PLAN_A, installmentNumber: 1, expectedAmountMinor: 91843 }],
  ['tripFinancialAudit', AUDIT_A, { ownerUid: UID_A, businessId: BUSINESS_A, tripId: TRIP_A, sequence: 1,
    changedField: 'salePrice' }],
  ['tripPaymentEvents', EVENT_A, { ownerUid: UID_A, businessId: BUSINESS_A, tripId: TRIP_A, paymentPlanId: PLAN_A,
    sequence: 1, eventType: 'created' }],
  ['idempotency', `${UID_A}__req-1`, { ownerUid: UID_A, tripId: TRIP_A }],
];

before(async () => {
  await loadRules(PRODUCTION_RULES);
  for (const [collection, docId, fields] of FIXTURES) {
    await admin.set(`${collection}/${docId}`, fields);
  }
});

after(async () => {
  // The emulator is shared with the reconciliation run, so every fixture is
  // removed. A leftover document here would surface later as an unexplained
  // extra document and look like a migration defect.
  await loadRules(PRODUCTION_RULES);
  for (const [collection, docId] of FIXTURES) {
    await admin.delete(`${collection}/${docId}`);
  }
  await admin.delete('users/rules-test-new-user');
  await admin.delete('businesses/rules-test-new-business');
});

// ---------------------------------------------------------------------------

test('anonymous callers are denied everywhere', async () => {
  for (const [collection, docId] of FIXTURES) {
    assert.equal(isDenied(await anon.get(`${collection}/${docId}`)), true,
      `anonymous read of ${collection} must be denied`);
  }
  assert.equal(isDenied(await anon.query('trips')), true);
  assert.equal(isDenied(await anon.update(`trips/${TRIP_A}`, { clientName: 'x' })), true);
});

test('an owner reads their own data and nothing of the other tenant', async () => {
  const owned = ['users/' + UID_A, 'businesses/' + BUSINESS_A, 'trips/' + TRIP_A,
    'tripPaymentPlans/' + PLAN_A, 'tripInstallments/' + INSTALLMENT_A,
    'tripFinancialAudit/' + AUDIT_A, 'tripPaymentEvents/' + EVENT_A];
  for (const path of owned) {
    assert.equal(isAllowed(await alice.get(path)), true, `owner must read ${path}`);
    assert.equal(isDenied(await bob.get(path)), true, `other tenant must not read ${path}`);
  }
});

test('cross-tenant writes are denied on every protected collection', async () => {
  assert.equal(isDenied(await bob.update(`trips/${TRIP_A}`, { clientName: 'stolen' })), true);
  assert.equal(isDenied(await bob.update(`businesses/${BUSINESS_A}`,
    { businessName: 'stolen' })), true);
  assert.equal(isDenied(await bob.update(`users/${UID_A}`, { fullName: 'stolen' })), true);
  assert.equal(isDenied(await bob.delete(`trips/${TRIP_A}`)), true);
  assert.equal(isDenied(await bob.delete(`businesses/${BUSINESS_A}`)), true);
  assert.equal(isDenied(await bob.create('trips', 'bob-made-this',
    { ownerUid: UID_A, clientName: 'x' })), true);
});

test('a query that is not owner-constrained fails rather than returning a subset', async () => {
  // Rules are not filters. An unconstrained list over another tenant's data
  // must be refused outright, and the constrained form must succeed.
  assert.equal(isDenied(await alice.query('trips')), true,
    'an unconstrained trips query must fail');
  const constrained = await alice.query('trips', [
    ['ownerUid', 'EQUAL', UID_A], ['businessId', 'EQUAL', BUSINESS_A],
  ]);
  assert.equal(isAllowed(constrained), true, 'the owner-constrained query must succeed');
  assert.ok(constrained.documents >= 1);
  // Constraining to someone else's uid is denied, not silently empty.
  assert.equal(isDenied(await alice.query('trips', [['ownerUid', 'EQUAL', UID_B]])), true);
});

test('ownership fields cannot be changed by a client', async () => {
  assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, { businessId: BUSINESS_B })), true);
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { ownerUid: UID_B })), true);
  assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, { ownerUid: UID_B })), true,
    'a trip must not be handed to another tenant');
  assert.equal(isDenied(await alice.update(`businesses/${BUSINESS_A}`, { ownerUid: UID_B })), true);
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { uid: UID_B })), true);
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { businessId: BUSINESS_B })), true,
    'a user must not move themselves into another tenant');
});

test('privilege escalation is denied in every shape', async () => {
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { role: 'admin' })), true,
    'self-admin');
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { role: 'owner' })), true);
  // Self-unsuspend, tested where it actually matters: a suspended account
  // trying to clear its own flag. Asserting on an already-false value would
  // only prove that writing an unchanged field is a no-op.
  await admin.update(`users/${UID_A}`, { isSuspended: true });
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { isSuspended: false })), true,
    'a suspended user must not be able to unsuspend itself');
  await admin.update(`users/${UID_A}`, { isSuspended: false });
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { canViewFinancials: true })), true,
    'granting yourself financial visibility is the Phase 1 vulnerability');
  assert.equal(isDenied(await bob.update(`users/${UID_A}`, { role: 'admin' })), true,
    'cross-tenant role mutation');
  // The legitimate edit still works, so the rule is a boundary, not a wall.
  assert.equal(isAllowed(await alice.update(`users/${UID_A}`, { fullName: 'Alice Updated' })), true);
});

test('a new user cannot be created already privileged', async () => {
  const newUser = RulesClient.asUser('rules-test-new-user', options);
  assert.equal(isDenied(await newUser.create('users', 'rules-test-new-user',
    { uid: 'rules-test-new-user', userId: 'rules-test-new-user', role: 'admin', isSuspended: false,
      canViewFinancials: false, businessId: null, fullName: 'X' })), true, 'created as admin');
  assert.equal(isDenied(await newUser.create('users', 'rules-test-new-user',
    { uid: 'rules-test-new-user', userId: 'rules-test-new-user', role: 'user', isSuspended: false,
      canViewFinancials: true, businessId: null, fullName: 'X' })), true, 'created with financial visibility');
  assert.equal(isDenied(await newUser.create('users', UID_A,
    { uid: UID_A, userId: UID_A, role: 'user', isSuspended: false, canViewFinancials: false,
      businessId: null, fullName: 'X' })), true, 'created under another identity');
  assert.equal(isAllowed(await newUser.create('users', 'rules-test-new-user',
    { uid: 'rules-test-new-user', userId: 'rules-test-new-user', role: 'user', isSuspended: false,
      canViewFinancials: false, businessId: null, fullName: 'X' })), true, 'the legitimate signup shape');
});

test('an unknown field cannot be smuggled onto a user document', async () => {
  const newUser = RulesClient.asUser('rules-test-new-user-2', options);
  assert.equal(isDenied(await newUser.create('users', 'rules-test-new-user-2',
    { uid: 'rules-test-new-user-2', userId: 'rules-test-new-user-2', role: 'user', isSuspended: false,
      canViewFinancials: false, businessId: null, fullName: 'X', isSuperuser: true })), true);
});

test('money on a trip is not client-writable', async () => {
  for (const field of ['amountPaid', 'amountDue', 'profit', 'profitPercentage',
    'cashPaidAmount', 'cardPaidAmount', 'paymentStatus']) {
    const patch = field === 'paymentStatus' ? { paymentStatus: 'paid' }
      : { [field]: amount('999999') };
    assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, patch)), true,
      `${field} must be server-owned`);
  }
  // A detached edit is denied too: legitimate edits carry an immutable
  // sparkOperations document in the same atomic request.
  assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, { destination: 'Rome' })), true);
});

test('payment plans and installments are read-only to clients', async () => {
  assert.equal(isAllowed(await alice.get(`tripPaymentPlans/${PLAN_A}`)), true);
  assert.equal(isDenied(await alice.update(`tripPaymentPlans/${PLAN_A}`,
    { cardTotalMinor: 1 })), true);
  assert.equal(isDenied(await alice.update(`tripInstallments/${INSTALLMENT_A}`,
    { paidAmountMinor: 91843 })), true, 'a client must not mark its own installment paid');
  assert.equal(isDenied(await alice.delete(`tripInstallments/${INSTALLMENT_A}`)), true);
  assert.equal(isDenied(await alice.create('tripInstallments', 'client-made',
    { ownerUid: UID_A, tripId: TRIP_A })), true);
});

test('audit and event history is append-only to the server and immutable to clients', async () => {
  for (const path of [`tripFinancialAudit/${AUDIT_A}`, `tripPaymentEvents/${EVENT_A}`]) {
    assert.equal(isAllowed(await alice.get(path)), true, 'the owner may read history');
    assert.equal(isDenied(await alice.update(path, { sequence: 999 })), true,
      'history must not be rewritten');
    assert.equal(isDenied(await alice.delete(path)), true, 'history must not be deleted');
  }
  assert.equal(isDenied(await alice.create('tripFinancialAudit', 'forged',
    { ownerUid: UID_A, tripId: TRIP_A, sequence: 1 })), true, 'history must not be forged');
});

test('the idempotency ledger is invisible to clients', async () => {
  // A client that could read this could learn whether a payment already
  // happened; one that could write it could suppress or replay a payment.
  assert.equal(isDenied(await alice.get(`idempotency/${UID_A}__req-1`)), true);
  assert.equal(isDenied(await alice.update(`idempotency/${UID_A}__req-1`, { tripId: 'x' })), true);
  assert.equal(isDenied(await alice.create('idempotency', `${UID_A}__req-2`,
    { ownerUid: UID_A })), true);
});

test('the migration proof namespace is denied to every client', async () => {
  await admin.set('migration_test_v1_trips/probe', { ownerUid: UID_A });
  assert.equal(isDenied(await alice.get('migration_test_v1_trips/probe')), true);
  assert.equal(isDenied(await anon.get('migration_test_v1_trips/probe')), true);
  assert.equal(isDenied(await superuser.get('migration_test_v1_trips/probe')), true,
    'not even an admin claim opens the proof namespace');
  await admin.delete('migration_test_v1_trips/probe');
});

test('an unmatched collection is denied by the catch-all', async () => {
  await admin.set('someFutureCollection/doc', { ownerUid: UID_A });
  assert.equal(isDenied(await alice.get('someFutureCollection/doc')), true);
  await admin.delete('someFutureCollection/doc');
});

test('the admin claim grants cross-tenant read but never write', async () => {
  assert.equal(isAllowed(await superuser.get(`trips/${TRIP_A}`)), true);
  assert.equal(isAllowed(await superuser.get(`users/${UID_A}`)), true);
  assert.equal(isDenied(await superuser.update(`trips/${TRIP_A}`, { clientName: 'admin edit' })),
    true, 'an admin claim is read-only; privileged writes go through a function');
  assert.equal(isDenied(await superuser.update(`users/${UID_A}`, { role: 'admin' })), true);
  assert.equal(isDenied(await superuser.delete(`trips/${TRIP_A}`)), true);
});

// ---------------------------------------------------------------------------
// Negative controls on the rules themselves
// ---------------------------------------------------------------------------

test('the suite catches deliberately insecure rules', async (t) => {
  const insecure = [
    ['open read', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /{document=**} { allow read: if true; allow write: if false; } } }`,
      async () => isAllowed(await anon.get(`trips/${TRIP_A}`))],

    ['any authenticated user', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /{document=**} { allow read, write: if request.auth != null; } } }`,
      async () => isAllowed(await bob.get(`trips/${TRIP_A}`))],

    ['mutable ownerUid', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /trips/{id} {
          allow read: if request.auth.uid == resource.data.ownerUid;
          allow update: if request.auth.uid == resource.data.ownerUid; }
        match /{document=**} { allow read, write: if false; } } }`,
      async () => isAllowed(await alice.update(`trips/${TRIP_A}`, { ownerUid: UID_B }))],

    ['client-writable admin field', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /users/{uid} {
          allow read, update: if request.auth.uid == uid; }
        match /{document=**} { allow read, write: if false; } } }`,
      async () => isAllowed(await alice.update(`users/${UID_A}`, { role: 'admin' }))],

    ['client-writable money', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /trips/{id} {
          allow read, update: if request.auth.uid == resource.data.ownerUid; }
        match /{document=**} { allow read, write: if false; } } }`,
      async () => isAllowed(await alice.update(`trips/${TRIP_A}`, { amountPaid: amount('999') }))],

    ['writable audit history', `rules_version = '2';
      service cloud.firestore { match /databases/{d}/documents {
        match /tripFinancialAudit/{id} {
          allow read, write: if request.auth != null; }
        match /{document=**} { allow read, write: if false; } } }`,
      async () => isAllowed(await bob.update(`tripFinancialAudit/${AUDIT_A}`, { sequence: 999 }))],
  ];

  insecure.push(
    ['mutable businessId', `rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /trips/{id} { allow update: if request.auth.uid == resource.data.ownerUid; } } }`,
      async () => isAllowed(await alice.update(`trips/${TRIP_A}`, { businessId: BUSINESS_B }))],
    ['client unsuspend', `rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /users/{id} { allow update: if request.auth.uid == id; } } }`,
      async () => { await admin.update(`users/${UID_A}`, { isSuspended: true }); return isAllowed(await alice.update(`users/${UID_A}`, { isSuspended: false })); }],
    ['audit deletion', `rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /tripFinancialAudit/{id} { allow delete: if request.auth != null; } } }`,
      async () => isAllowed(await alice.delete(`tripFinancialAudit/${AUDIT_A}`))],
  );
  for (const [name, rules, breach] of insecure) {
    await t.test(`insecure: ${name}`, async () => {
      await loadRules(rules);
      const succeeded = await breach();
      await loadRules(PRODUCTION_RULES);
      // A successful breach really does change the data — the mutable-ownerUid
      // control hands the trip to the other tenant — so fixtures are restored
      // before the next control runs against them.
      for (const [collection, docId, fields] of FIXTURES) {
        await admin.set(`${collection}/${docId}`, fields);
      }
      // The breach MUST succeed under the insecure rules. If it does not, the
      // corresponding positive test is passing for some unrelated reason and
      // is not actually evidence that the production rule is doing the work.
      assert.equal(succeeded, true,
        `the insecure rule "${name}" did not produce a breach, so the matching ` +
        'positive control proves nothing');
    });
  }

  // And the production rules must close every one of them again.
  await loadRules(PRODUCTION_RULES);
  assert.equal(isDenied(await anon.get(`trips/${TRIP_A}`)), true);
  assert.equal(isDenied(await bob.get(`trips/${TRIP_A}`)), true);
  assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, { ownerUid: UID_B })), true);
  assert.equal(isDenied(await alice.update(`users/${UID_A}`, { role: 'admin' })), true);
  assert.equal(isDenied(await alice.update(`trips/${TRIP_A}`, { amountPaid: amount('999') })), true);
  assert.equal(isDenied(await bob.update(`tripFinancialAudit/${AUDIT_A}`, { sequence: 999 })), true);
});
