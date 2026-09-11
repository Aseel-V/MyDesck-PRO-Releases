#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { RulesClient, isAllowed, isDenied } from '../lib/rules-client.mjs';
import { openTarget } from '../lib/firestore-target.mjs';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('FIRESTORE_EMULATOR_REQUIRED');
const state = JSON.parse(readFileSync('migration/full-rehearsal.local/expected.json', 'utf8'));
const options = { host: process.env.FIRESTORE_EMULATOR_HOST, projectId: 'mydesck-migration-proof' };
const anon = RulesClient.asAnonymous(options);
const businesses = state.expected.filter((item) => item.entityType === 'business_profiles');
const trips = state.expected.filter((item) => item.entityType === 'trips');
const checks = [];
const check = async (name, promise, expected) => {
  const result = await promise;
  const pass = expected === 'ALLOW' ? isAllowed(result) : isDenied(result);
  checks.push({ name, expected, pass });
};

for (const business of businesses) {
  const client = RulesClient.asUser(business.ownerUid, options);
  await check('owner_business_read', client.get(business.targetPath), 'ALLOW');
  await check('anonymous_business_read', anon.get(business.targetPath), 'DENY');
  const foreign = businesses.find((item) => item.ownerUid !== business.ownerUid);
  if (foreign) await check('cross_tenant_business_read', client.get(foreign.targetPath), 'DENY');
  const ownTrips = trips.filter((item) => item.ownerUid === business.ownerUid);
  if (ownTrips.length) {
    await check('owner_trip_read', client.get(ownTrips[0].targetPath), 'ALLOW');
    await check('anonymous_trip_read', anon.get(ownTrips[0].targetPath), 'DENY');
  }
  const foreignTrip = trips.find((item) => item.ownerUid !== business.ownerUid);
  if (foreignTrip) await check('cross_tenant_trip_read', client.get(foreignTrip.targetPath), 'DENY');
  const query = client.query('trips', [['ownerUid', 'EQUAL', business.ownerUid]], 200);
  await check('tenant_constrained_trip_query', query, 'ALLOW');
  await check('global_trip_query_denied', client.query('trips', [], 10), 'DENY');
}

const ownerBusiness = businesses.find((item) => trips.some((trip) => trip.ownerUid === item.ownerUid));
const ownerClient = RulesClient.asUser(ownerBusiness.ownerUid, options);
const ownerTrip = trips.find((item) => item.ownerUid === ownerBusiness.ownerUid);
const adminTarget = await openTarget('emulator');
let user = null;
for (const candidate of state.expected.filter((item) => item.entityType === 'user_profiles')) {
  const document = await adminTarget.db.doc(candidate.targetPath).get();
  if (document.data()?.isSuspended === true) { user = candidate; break; }
}
user ??= state.expected.find((item) => item.entityType === 'user_profiles'
  && item.ownerUid === ownerBusiness.ownerUid) ?? state.expected.find((item) => item.entityType === 'user_profiles');
const selectedUser = await adminTarget.db.doc(user.targetPath).get();
const selfSuspendAttempt = selectedUser.data()?.isSuspended === true ? false : true;
await adminTarget.close();
const plan = state.expected.find((item) => item.entityType === 'trip_payment_plans');
const audit = state.expected.find((item) => item.entityType === 'trip_financial_audit');
const serverOnly = state.expected.find((item) => item.entityType === 'trip_write_requests');

await check('ownership_mutation_denied', ownerClient.update(ownerBusiness.targetPath,
  { ownerUid: '__attacker__' }), 'DENY');
await check('business_id_mutation_denied', ownerClient.update(ownerTrip.targetPath,
  { businessId: '__other__' }), 'DENY');
await check('financial_summary_overwrite_denied', ownerClient.update(ownerTrip.targetPath,
  { amountPaid: { unitsText: '1', scale: 2 } }), 'DENY');
if (user) {
  const userClient = RulesClient.asUser(user.ownerUid, options);
  await check('role_escalation_denied', userClient.update(user.targetPath, { role: 'admin' }), 'DENY');
  await check('self_unsuspend_denied', userClient.update(user.targetPath,
    { isSuspended: selfSuspendAttempt }), 'DENY');
}
if (plan) await check('payment_plan_client_write_denied', RulesClient.asUser(plan.ownerUid, options)
  .update(plan.targetPath, { status: 'paid' }), 'DENY');
if (audit) await check('audit_mutation_denied', RulesClient.asUser(audit.ownerUid, options)
  .delete(audit.targetPath), 'DENY');
if (serverOnly) await check('server_only_collection_denied', RulesClient.asUser(serverOnly.ownerUid, options)
  .get(serverOnly.targetPath), 'DENY');

const report = {
  generatedAt: new Date().toISOString(),
  status: checks.every((item) => item.pass) ? 'PASS' : 'FAIL',
  representativeBusinesses: businesses.length,
  representativeUsers: new Set(businesses.map((item) => item.ownerUid)).size,
  checks: checks.length,
  passed: checks.filter((item) => item.pass).length,
  failed: checks.filter((item) => !item.pass).length,
  categories: Object.fromEntries([...new Set(checks.map((item) => item.name))]
    .map((name) => [name, checks.filter((item) => item.name === name).every((item) => item.pass) ? 'PASS' : 'FAIL'])),
};
writeReport('migration/reports/firestore-full-security.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;
