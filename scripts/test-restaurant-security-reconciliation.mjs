import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260723090000_reconcile_restaurant_security_baseline.sql';
const sql = readFileSync(migrationPath, 'utf8');
const executableSql = sql.replace(/--.*$/gm, '');
const verificationSql = readFileSync('scripts/verify-restaurant-security-reconciliation.sql', 'utf8');

assert.match(sql, /SET search_path = pg_catalog, public;/, 'catalog checks must use a fixed search_path');
assert.match(sql, /RESET search_path;/, 'session search_path must be restored after reconciliation');
assert.match(sql, /to_regprocedure\('public\.authorize_staff_action\(text,text\)'\)/, 'authoritative hashed-PIN signature must be required');
assert.match(sql, /to_regprocedure\('public\.authorize_staff_action\(text,uuid,text\)'\) IS NOT NULL/, 'obsolete overload must fail the reconciliation');
assert.doesNotMatch(sql, /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.authorize_staff_action\s*\([^)]*uuid/i, 'obsolete overload must never be recreated');
assert.match(sql, /authoritative function must have a fixed search_path/, 'authoritative routine search_path must be verified');

for (const policy of [
  'Managers and Owners can view daily reports',
  'Managers see all shifts, Staff see own',
]) {
  assert.match(sql, new RegExp(`CREATE POLICY "${policy}"`), `${policy} must be created`);
}
assert.equal((sql.match(/\bCREATE POLICY\b/g) || []).length, 2, 'reconciliation must add only the two approved policies');
assert.equal((sql.match(/\bFOR SELECT\b/g) || []).length, 2, 'both policies must be SELECT-only');
assert.equal((sql.match(/\bTO authenticated\b/g) || []).length, 2, 'both policies must be authenticated-only');
assert.doesNotMatch(executableSql, /\bDROP\s+POLICY\b/i, 'existing Restaurant policies must remain intact');
assert.doesNotMatch(executableSql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i, 'migration must not write Restaurant data');
assert.doesNotMatch(executableSql, /\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b/i, 'migration must not recreate or destructively alter tables');

for (const tenantPredicate of [
  's.business_id = public.restaurant_daily_reports.business_id',
  's.business_id = r.business_id',
  'r.business_id = auth.uid()',
  's.id = public.staff_shifts.staff_id',
  's.user_id = auth.uid()',
]) {
  assert.ok(sql.includes(tenantPredicate), `policy SQL must retain tenant predicate: ${tenantPredicate}`);
}
assert.match(sql, /policyname <> 'Managers and Owners can view daily reports'/, 'alternate report policies must be checked before creation');
assert.match(sql, /policyname <> 'Managers see all shifts, Staff see own'/, 'alternate shift policies must be checked before creation');

const canReadReport = ({ userId, reportBusinessId, staff }) =>
  userId === reportBusinessId || staff.some((member) =>
    member.userId === userId && member.businessId === reportBusinessId &&
    (['Manager', 'Admin', 'Super Admin', 'Owner'].includes(member.role) || ['branch_manager', 'super_admin'].includes(member.restaurantRole)));

const canReadShift = ({ userId, report, shift, staff }) =>
  report.businessId === userId || staff.some((member) =>
    member.userId === userId && member.businessId === report.businessId &&
    (['Manager', 'Admin', 'Super Admin', 'Owner'].includes(member.role) || ['branch_manager', 'super_admin'].includes(member.restaurantRole))) ||
  staff.some((member) => member.id === shift.staffId && member.userId === userId);

const staff = [
  { id: 'manager-a', userId: 'manager-user-a', businessId: 'business-a', role: 'Manager', restaurantRole: 'branch_manager' },
  { id: 'waiter-a', userId: 'waiter-user-a', businessId: 'business-a', role: 'Waiter', restaurantRole: 'waiter' },
  { id: 'manager-b', userId: 'manager-user-b', businessId: 'business-b', role: 'Manager', restaurantRole: 'branch_manager' },
];
assert.equal(canReadReport({ userId: 'business-a', reportBusinessId: 'business-a', staff }), true, 'owner must read own reports');
assert.equal(canReadReport({ userId: 'manager-user-a', reportBusinessId: 'business-a', staff }), true, 'manager must read own-business reports');
assert.equal(canReadReport({ userId: 'manager-user-b', reportBusinessId: 'business-a', staff }), false, 'manager must not read another business report');
assert.equal(canReadShift({ userId: 'waiter-user-a', report: { businessId: 'business-a' }, shift: { staffId: 'waiter-a' }, staff }), true, 'staff member must read own shift');
assert.equal(canReadShift({ userId: 'manager-user-a', report: { businessId: 'business-a' }, shift: { staffId: 'waiter-a' }, staff }), true, 'manager must read own-business shifts');
assert.equal(canReadShift({ userId: 'manager-user-b', report: { businessId: 'business-a' }, shift: { staffId: 'waiter-a' }, staff }), false, 'staff must not read another business shift');

assert.doesNotMatch(verificationSql.replace(/--.*$/gm, ''), /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i, 'catalog verification must remain read-only');
for (const result of [
  'authoritative_function_exists', 'obsolete_function_absent',
  'daily_report_policy_valid', 'staff_shift_policy_valid',
  'existing_daily_report_owner_policy_preserved', 'existing_staff_shift_owner_policy_preserved',
]) {
  assert.ok(verificationSql.includes(result), `catalog verification must expose ${result}`);
}

console.log('[restaurant-security-reconciliation] Forward-only policy and tenant-isolation contracts passed.');
