#!/usr/bin/env node
/**
 * Restaurant staff membership Rules.
 *
 * This is the replacement for `authenticate_staff`, the SECURITY DEFINER RPC that read
 * `restaurant_staff.password` and verified it with `crypt()`. Identity now comes from Firebase
 * Auth and authorisation from these documents, so no password, hash or PIN exists in Firestore
 * to verify or to leak.
 *
 * Every check below is a raw client write against the rules engine, not a call through an
 * application service. The client is assumed hostile: an Electron renderer can issue any write
 * it likes, so a rule that is only enforced in the UI is not enforced at all.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node --test migration/firestore/tests/restaurant-staff-rules.test.mjs
 */

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RulesClient, isDenied, isAllowed } from '../lib/rules-client.mjs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'mydesck-migration-proof';
const options = { host: HOST, projectId: PROJECT };

const OWNER = 'staff-rules-owner';
const ADMIN_STAFF = 'staff-rules-super-admin';
const WAITER = 'staff-rules-waiter';
const KITCHEN = 'staff-rules-kitchen';
const SUSPENDED = 'staff-rules-suspended';
const OUTSIDER = 'staff-rules-outsider';
const BUSINESS = 'staff-rules-business-a';
// Self-registration is a create, so the newcomer must be unique per run or a second run
// fails on ALREADY_EXISTS rather than on a rule.
const RUN = `newcomer-${Date.now().toString(36)}`;
const OTHER_BUSINESS = 'staff-rules-business-b';

const id = (businessId, uid) => `${businessId}__${uid}`;
const membership = (businessId, uid, role, status) => ({
  uid, businessId, staffId: `staff-${uid}`, role, status,
  enabled: status === 'active', schemaVersion: 1, approvedBy: OWNER,
});

const admin = RulesClient.asAdminBypass(options);
const anon = RulesClient.asAnonymous(options);
const owner = RulesClient.asUser(OWNER, options);
const adminStaff = RulesClient.asUser(ADMIN_STAFF, options);
const waiter = RulesClient.asUser(WAITER, options);
const kitchen = RulesClient.asUser(KITCHEN, options);
const suspended = RulesClient.asUser(SUSPENDED, options);
const outsider = RulesClient.asUser(OUTSIDER, options);

async function loadRules(content) {
  const response = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED: ${response.status}`);
}

before(async () => {
  await loadRules(readFileSync('migration/firestore/rules/firestore.rules', 'utf8'));
  // Fixtures are seeded with the admin bypass, never through the rules under test.
  await admin.create('businesses', BUSINESS,
    { ownerUid: OWNER, businessId: BUSINESS, businessName: 'Rules Diner', isSuspended: false });
  await admin.create('businesses', OTHER_BUSINESS,
    { ownerUid: OUTSIDER, businessId: OTHER_BUSINESS, businessName: 'Other Diner', isSuspended: false });
  for (const [uid, role, status] of [
    [ADMIN_STAFF, 'super_admin', 'active'],
    [WAITER, 'waiter', 'active'],
    [KITCHEN, 'kitchen_staff', 'active'],
    [SUSPENDED, 'waiter', 'suspended'],
  ]) {
    await admin.create('restaurantMemberships', id(BUSINESS, uid), membership(BUSINESS, uid, role, status));
  }
  await admin.create('restaurantMemberships', id(OTHER_BUSINESS, OUTSIDER),
    membership(OTHER_BUSINESS, OUTSIDER, 'super_admin', 'active'));
});

test('a member reads its own membership and an administrator reads the roster', async () => {
  assert.ok(isAllowed(await waiter.get(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isAllowed(await adminStaff.get(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isAllowed(await owner.get(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
});

test('another restaurant and anonymous are denied', async () => {
  assert.ok(isDenied(await outsider.get(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isDenied(await anon.get(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isDenied(await waiter.get(`restaurantMemberships/${id(OTHER_BUSINESS, OUTSIDER)}`)));
});

test('self-registration may only create a pending, role-less membership for its own uid', async () => {
  const newcomer = RulesClient.asUser(RUN, options);
  assert.ok(isAllowed(await newcomer.create('restaurantMemberships', id(BUSINESS, RUN),
    { uid: RUN, businessId: BUSINESS, status: 'pending', enabled: false, schemaVersion: 1 })));
  // A role at creation time would be self-granted privilege.
  assert.ok(isDenied(await newcomer.create('restaurantMemberships', id(BUSINESS, `${RUN}-role-grab`),
    { uid: RUN, businessId: BUSINESS, status: 'pending', enabled: false,
      role: 'super_admin', schemaVersion: 1 })));
  // Active at creation time bypasses approval entirely.
  assert.ok(isDenied(await newcomer.create('restaurantMemberships', id(BUSINESS, `${RUN}-active-grab`),
    { uid: RUN, businessId: BUSINESS, status: 'active', enabled: true, schemaVersion: 1 })));
});

test('a membership cannot be created for somebody else, or under a mismatched id', async () => {
  const attacker = RulesClient.asUser('staff-rules-attacker', options);
  assert.ok(isDenied(await attacker.create('restaurantMemberships', id(BUSINESS, WAITER),
    { uid: WAITER, businessId: BUSINESS, status: 'pending', enabled: false, schemaVersion: 1 })));
  assert.ok(isDenied(await attacker.create('restaurantMemberships', 'staff-rules-forged-key',
    { uid: 'staff-rules-attacker', businessId: BUSINESS, status: 'pending', enabled: false, schemaVersion: 1 })));
});

test('a waiter cannot promote itself to super_admin', async () => {
  assert.ok(isDenied(await waiter.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
    membership(BUSINESS, WAITER, 'super_admin', 'active'))));
});

test('kitchen staff cannot administer anyone', async () => {
  assert.ok(isDenied(await kitchen.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
    membership(BUSINESS, WAITER, 'branch_manager', 'active'))));
});

test('suspended staff cannot re-enable themselves', async () => {
  assert.ok(isDenied(await suspended.set(`restaurantMemberships/${id(BUSINESS, SUSPENDED)}`,
    membership(BUSINESS, SUSPENDED, 'waiter', 'active'))));
});

test('an administrator cannot approve its own membership', async () => {
  assert.ok(isDenied(await adminStaff.set(`restaurantMemberships/${id(BUSINESS, ADMIN_STAFF)}`,
    { ...membership(BUSINESS, ADMIN_STAFF, 'super_admin', 'active'), approvedBy: ADMIN_STAFF })));
});

test('the owner and an active administrator may approve another member', async () => {
  const target = id(BUSINESS, RUN);
  assert.ok(isAllowed(await owner.set(`restaurantMemberships/${target}`,
    { uid: RUN, businessId: BUSINESS, staffId: 'staff-new', role: 'waiter',
      status: 'active', enabled: true, schemaVersion: 1, approvedBy: OWNER })));
  assert.ok(isAllowed(await adminStaff.set(`restaurantMemberships/${target}`,
    { uid: RUN, businessId: BUSINESS, staffId: 'staff-new', role: 'kitchen_staff',
      status: 'suspended', enabled: false, schemaVersion: 1, approvedBy: ADMIN_STAFF })));
});

test('businessId and uid are immutable, and an unknown role is refused', async () => {
  const target = id(BUSINESS, WAITER);
  assert.ok(isDenied(await owner.set(`restaurantMemberships/${target}`,
    { ...membership(BUSINESS, WAITER, 'waiter', 'active'), businessId: OTHER_BUSINESS })));
  assert.ok(isDenied(await owner.set(`restaurantMemberships/${target}`,
    { ...membership(BUSINESS, WAITER, 'waiter', 'active'), uid: OUTSIDER })));
  assert.ok(isDenied(await owner.set(`restaurantMemberships/${target}`,
    { ...membership(BUSINESS, WAITER, 'owner_of_everything', 'active') })));
});

test('an administrator of another restaurant cannot touch this roster', async () => {
  assert.ok(isDenied(await outsider.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
    membership(BUSINESS, WAITER, 'super_admin', 'active'))));
});

test('enabled must agree with status, so a disabled member cannot stay active', async () => {
  assert.ok(isDenied(await owner.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
    { ...membership(BUSINESS, WAITER, 'waiter', 'active'), enabled: false })));
  assert.ok(isDenied(await owner.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
    { ...membership(BUSINESS, WAITER, 'waiter', 'suspended'), enabled: true })));
});

test('memberships are never deleted, so the audit trail survives', async () => {
  assert.ok(isDenied(await owner.delete(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isDenied(await adminStaff.delete(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
  assert.ok(isDenied(await waiter.delete(`restaurantMemberships/${id(BUSINESS, WAITER)}`)));
});

test('no password, hash or PIN field is ever accepted on a membership', async () => {
  // The whole point of the redesign: there is nothing here to verify or to leak.
  for (const secret of ['password', 'pin_code', 'pinHash', 'passwordHash']) {
    assert.ok(isDenied(await owner.set(`restaurantMemberships/${id(BUSINESS, WAITER)}`,
      { ...membership(BUSINESS, WAITER, 'waiter', 'active'), [secret]: 'should-never-exist' })),
    `${secret} must not be writable onto a membership`);
  }
});
