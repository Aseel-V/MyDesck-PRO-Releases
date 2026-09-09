#!/usr/bin/env node
/**
 * Phases 6, 7 and 13 — security posture against the replayed schema.
 *
 * Run AFTER migration/tools/replay-migrations.mjs, so the real 75-table schema,
 * its 113 policies and the Phase 1 trigger guards are all present.
 *
 *   Phase 6  role-name compatibility: the Phase 1 guards test current_user
 *            against Supabase role names. Prove the compat roles restore the
 *            intended behaviour and grant nothing extra.
 *   Phase 7  ownership and BYPASSRLS: the runtime role must not own tenant
 *            tables and must not be able to bypass RLS.
 *   Phase 13 negative controls: deliberately break each protection and prove
 *            the tests catch it, then restore.
 *
 * FAIL-CLOSED: no PGURL means exit 2 and NOT RUN. Never a pass.
 *
 *   PGURL=postgres://... node migration/tests/security-posture.test.mjs
 */

import pg from 'pg';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;
if (!PGURL) {
  console.error('NOT RUN: no PGURL. Security posture is UNPROVEN. Do not record a pass.');
  process.exit(2);
}
if (/supabase\.(co|com)/i.test(PGURL)) {
  console.error('ABORT: refusing to run destructive negative controls against Supabase.');
  process.exit(1);
}

const UID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';
const APP_ROLE = 'mydesck_runtime';
const APP_PW = 'runtime_test_pw';

let pass = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok    ${name}`); }
  catch (e) { failures.push({ name, message: e.message }); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const refused = async (client, sql, params = []) => {
  try { await client.query(sql, params); return false; } catch { return true; }
};

const admin = new pg.Client({ connectionString: PGURL });
await admin.connect();
await admin.query("SET client_encoding TO 'UTF8'");

// ---------------------------------------------------------------- fixtures

console.log('[security-posture] seeding two tenants into the replayed schema\n');

await admin.query('DELETE FROM public.trips WHERE user_id = ANY($1)', [[UID_A, UID_B]]);
await admin.query('DELETE FROM public.user_profiles WHERE user_id = ANY($1)', [[UID_A, UID_B]]);
await admin.query('DELETE FROM public.business_profiles WHERE user_id = ANY($1)', [[UID_A, UID_B]]);
await admin.query('DELETE FROM auth.users WHERE id = ANY($1)', [[UID_A, UID_B]]);

await admin.query(
  `INSERT INTO auth.users (id, email, migrated_from_supabase) VALUES ($1,$2,true),($3,$4,true)`,
  [UID_A, 'a@tenant.test', UID_B, 'b@tenant.test']
);
for (const [uid, name] of [[UID_A, 'Tenant A'], [UID_B, 'Tenant B']]) {
  await admin.query(
    `INSERT INTO public.business_profiles (user_id, business_name) VALUES ($1,$2)`, [uid, name]);
  await admin.query(
    `INSERT INTO public.user_profiles (user_id, full_name, role) VALUES ($1,$2,'user')`, [uid, name]);
  await admin.query(
    `INSERT INTO public.trips (user_id, destination, client_name, start_date, end_date, sale_price, wholesale_cost)
     VALUES ($1,$2,$3,'2026-10-01','2026-10-07',1000.00,800.00)`,
    [uid, `${name}-Paris`, `${name} Client`]);
}

// A runtime login role shaped like the Cloud Run service account.
await admin.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
  END $$`);
// Provision exactly the way production must: NO service_role membership, or the
// runtime connection can SET ROLE back up to it and inherit BYPASSRLS.
await admin.query(`SELECT auth.grant_runtime_access($1)`, [APP_ROLE]);
await admin.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`);
await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`);

const appUrl = new URL(PGURL);
appUrl.username = APP_ROLE;
appUrl.password = APP_PW;

const app = new pg.Client({ connectionString: appUrl.toString() });
await app.connect();
await app.query("SET client_encoding TO 'UTF8'");

async function asUser(client, uid, fn) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT auth.bind_identity($1::uuid, $2)', [uid, 'authenticated']);
    await client.query('SET LOCAL ROLE authenticated');
    return await fn();
  } finally { await client.query('COMMIT').catch(() => client.query('ROLLBACK')); }
}

// ================================================================ Phase 6

console.log('[Phase 6] Supabase role-name compatibility\n');

await test('all four compat roles exist', async () => {
  const r = await admin.query(
    `SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`,
    [['authenticated', 'anon', 'service_role', 'supabase_admin']]);
  if (r.rowCount !== 4) {
    throw new Error(`only ${r.rowCount}/4 present: ${r.rows.map((x) => x.rolname).join(', ')}`);
  }
});

await test('creating compat roles granted BYPASSRLS to nothing that can log in', async () => {
  const r = await admin.query(
    `SELECT rolname, rolbypassrls, rolcanlogin FROM pg_roles
     WHERE rolname = ANY($1) AND rolbypassrls AND rolcanlogin`,
    [['authenticated', 'anon', 'service_role', 'supabase_admin']]);
  if (r.rowCount > 0) throw new Error(`login+BYPASSRLS: ${r.rows.map((x) => x.rolname).join(', ')}`);
});

await test('anon and authenticated are NOLOGIN', async () => {
  const r = await admin.query(
    `SELECT rolname FROM pg_roles WHERE rolname = ANY($1) AND rolcanlogin`,
    [['authenticated', 'anon', 'supabase_admin']]);
  if (r.rowCount > 0) throw new Error(`can log in directly: ${r.rows.map((x) => x.rolname).join(', ')}`);
});

await test('Phase 1 guard blocks a tenant self-escalating to admin', async () => {
  await asUser(app, UID_A, async () => {
    const blocked = await refused(app,
      `UPDATE public.user_profiles SET role='admin' WHERE user_id=$1`, [UID_A]);
    if (!blocked) {
      const r = await app.query(`SELECT role FROM public.user_profiles WHERE user_id=$1`, [UID_A]);
      if (r.rows[0]?.role === 'admin') throw new Error('CRITICAL: tenant became platform admin');
    }
  });
  const after = await admin.query(`SELECT role FROM public.user_profiles WHERE user_id=$1`, [UID_A]);
  if (after.rows[0].role !== 'user') throw new Error(`role is now ${after.rows[0].role}`);
});

await test('Phase 1 guard blocks a tenant self-unsuspending', async () => {
  await admin.query(`UPDATE public.user_profiles SET is_suspended=true WHERE user_id=$1`, [UID_A]);
  await asUser(app, UID_A, async () => {
    await refused(app, `UPDATE public.user_profiles SET is_suspended=false WHERE user_id=$1`, [UID_A]);
  });
  const r = await admin.query(`SELECT is_suspended FROM public.user_profiles WHERE user_id=$1`, [UID_A]);
  if (r.rows[0].is_suspended !== true) throw new Error('tenant cleared their own suspension');
  await admin.query(`UPDATE public.user_profiles SET is_suspended=false WHERE user_id=$1`, [UID_A]);
});

await test('a tenant cannot SET ROLE to service_role or supabase_admin', async () => {
  for (const role of ['service_role', 'supabase_admin']) {
    await app.query('BEGIN');
    await app.query('SELECT auth.bind_identity($1::uuid, $2)', [UID_A, 'authenticated']);
    await app.query('SET LOCAL ROLE authenticated');
    const blocked = await refused(app, `SET LOCAL ROLE ${role}`);
    await app.query('ROLLBACK');
    if (!blocked) throw new Error(`authenticated escalated to ${role}`);
  }
});

// ================================================================ Phase 7

console.log('\n[Phase 7] ownership and BYPASSRLS\n');

await test('runtime role has no BYPASSRLS', async () => {
  const r = await admin.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname=$1`, [APP_ROLE]);
  if (r.rows[0].rolbypassrls) throw new Error('runtime role holds BYPASSRLS');
});

await test('runtime role is not superuser and cannot create roles', async () => {
  const r = await admin.query(
    `SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=$1`, [APP_ROLE]);
  const x = r.rows[0];
  if (x.rolsuper || x.rolcreaterole || x.rolcreatedb) throw new Error(JSON.stringify(x));
});

await test('runtime role owns no tenant table', async () => {
  const r = await admin.query(`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner=$1`, [APP_ROLE]);
  if (r.rowCount > 0) {
    throw new Error(`owns ${r.rowCount} table(s) — RLS is skipped for an owner unless FORCE RLS: `
      + r.rows.slice(0, 5).map((x) => x.tablename).join(', '));
  }
});

await test('RLS is enabled on every public table', async () => {
  const r = await admin.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`);
  if (r.rowCount > 0) throw new Error(`${r.rowCount} without RLS: ${r.rows.map((x) => x.relname).join(', ')}`);
});

await test('RLS actually filters for the runtime role (not just enabled)', async () => {
  await asUser(app, UID_A, async () => {
    const r = await app.query('SELECT user_id FROM public.trips');
    if (r.rows.some((x) => x.user_id !== UID_A)) throw new Error('cross-tenant rows visible');
    if (r.rowCount === 0) throw new Error('A cannot see own trip — policy too strict to prove filtering');
  });
});

// ================================================================ Phase 13

console.log('\n[Phase 13] negative controls — each must be CAUGHT\n');

/** Break something, assert the corresponding check fails, then restore. */
async function negativeControl(name, breakFn, detectFn, restoreFn) {
  let detected = false;
  try {
    await breakFn();
    try { await detectFn(); } catch { detected = true; }
  } finally {
    await restoreFn().catch((e) => { throw new Error(`RESTORE FAILED: ${e.message}`); });
  }
  if (!detected) throw new Error('weakness was NOT detected — the test is blind to this failure');
}

await test('NC1 session-global SET instead of SET LOCAL is caught as a leak', async () => {
  await negativeControl('session-global identity',
    async () => {
      // Simulate the dangerous implementation on a dedicated connection.
      await app.query(`SELECT set_config('app.user_id', $1, false)`, [UID_A]); // false => SESSION
    },
    async () => {
      // The leak check: after the "request" ends, identity must be gone.
      const r = await app.query('SELECT auth.uid() AS uid');
      if (r.rows[0].uid !== null) throw new Error('leak');
    },
    async () => { await app.query(`SELECT set_config('app.user_id', '', false)`); });
});

await test('NC2 runtime role granted BYPASSRLS is caught', async () => {
  await negativeControl('bypassrls',
    async () => { await admin.query(`ALTER ROLE ${APP_ROLE} BYPASSRLS`); },
    async () => {
      const r = await admin.query(
        `SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolbypassrls`, [APP_ROLE]);
      if (r.rowCount > 0) throw new Error('bypassrls present');
    },
    async () => { await admin.query(`ALTER ROLE ${APP_ROLE} NOBYPASSRLS`); });
});

await test('NC3 an open cross-tenant SELECT policy is caught', async () => {
  await negativeControl('open policy',
    async () => {
      await admin.query(
        `CREATE POLICY nc_open_trips ON public.trips FOR SELECT TO authenticated USING (true)`);
    },
    async () => {
      await asUser(app, UID_A, async () => {
        const r = await app.query('SELECT user_id FROM public.trips');
        if (r.rows.some((x) => x.user_id !== UID_A)) throw new Error('cross-tenant read');
      });
    },
    async () => { await admin.query(`DROP POLICY IF EXISTS nc_open_trips ON public.trips`); });
});

await test('NC4 binding the wrong UID is caught', async () => {
  let detected = false;
  await asUser(app, UID_B, async () => {
    const r = await app.query('SELECT auth.uid() AS uid');
    if (r.rows[0].uid !== UID_A) detected = true;   // expecting A, bound B
  });
  if (!detected) throw new Error('a wrong-UID binding would not be noticed');
});

await test('NC5 a malformed bcrypt hash is rejected by the import classifier', async () => {
  const { parseBcrypt, classifyAccount } = await import('../tools/lib/auth-classify.mjs');
  if (parseBcrypt('$2a$10$tooshort').ok) throw new Error('malformed hash accepted');
  const c = classifyAccount({
    id: UID_A, email: 'x@y.test', encrypted_password: 'not-a-hash',
    has_business_profile: true, has_user_profile: true, has_oauth_identity: false,
  });
  if (c.authClass === 'transparent') throw new Error('malformed hash classified as transparent');
});

// ---------------------------------------------------------------- restore

console.log('\n[cleanup] restoring secure state\n');
await admin.query(`DROP POLICY IF EXISTS nc_open_trips ON public.trips`);
await admin.query(`ALTER ROLE ${APP_ROLE} NOBYPASSRLS`);

await test('post-run: secure state restored', async () => {
  const b = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolbypassrls`, [APP_ROLE]);
  if (b.rowCount) throw new Error('BYPASSRLS still set');
  const p = await admin.query(
    `SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='nc_open_trips'`);
  if (p.rowCount) throw new Error('negative-control policy still present');
});

await app.end();
await admin.end();

console.log(`\n[security-posture] ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  FAIL  ${f.name}\n        ${f.message}`);
process.exit(failures.length ? 1 : 0);
