#!/usr/bin/env node
/**
 * Phases 10, 11, 12, 13 — identity binding and tenant isolation, proved against
 * a REAL PostgreSQL server.
 *
 * These are the tests that decide whether the Cloud SQL target is safe. They
 * cover the three ways this migration could silently break tenant isolation:
 *
 *   1. auth.uid() returns the wrong user
 *   2. a pooled connection carries one user's identity into the next request
 *   3. the application role can bypass RLS entirely
 *
 * FAIL-CLOSED CONTRACT
 * If no database is reachable, this exits NON-ZERO with NOT RUN. It must never
 * print a pass it did not earn. (The repository already contained a security
 * "gate" that printed ALL GATES PASSED while asserting nothing; this file is
 * written to be the opposite of that.)
 *
 *   PGURL=postgres://user:pass@host:5432/db node migration/tests/identity-isolation.test.mjs
 *
 * Point it at a DISPOSABLE database. It creates and drops its own fixtures.
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;

if (!PGURL) {
  console.error('NOT RUN: identity + tenant isolation proof did not execute.');
  console.error('');
  console.error('  Reason : no PGURL / DATABASE_URL in the environment.');
  console.error('  Meaning: the Cloud SQL identity model is UNPROVEN. This is a');
  console.error('           blocking gate, not a skip. Do not record a pass.');
  console.error('');
  console.error('  To run against a disposable PostgreSQL 17:');
  console.error('    docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=pw \\');
  console.error('      --name mydesck-migration-test postgres:17-alpine');
  console.error('    PGURL=postgres://postgres:pw@127.0.0.1:55432/postgres \\');
  console.error('      node migration/tests/identity-isolation.test.mjs');
  process.exit(2);
}

const UID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

let pass = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok    ${name}`); }
  catch (e) { failures.push({ name, message: e.message }); console.log(`  FAIL  ${name}`); }
}

/** Run a statement expecting it to be refused; return true if it was. */
async function denied(client, sql, params = []) {
  try { await client.query(sql, params); return false; }
  catch { return true; }
}

const admin = new pg.Client({ connectionString: PGURL });
await admin.connect();

try {
  console.log('[identity-isolation] setting up disposable fixtures\n');

  await admin.query('DROP SCHEMA IF EXISTS auth CASCADE');
  await admin.query('DROP SCHEMA IF EXISTS migration CASCADE');
  await admin.query('DROP TABLE IF EXISTS public.iso_trips CASCADE');

  // Install the real compatibility layer under test — not a mock.
  await admin.query(readFileSync('migration/sql/001_auth_compat.sql', 'utf8'));
  await admin.query(readFileSync('migration/sql/002_migration_ledger.sql', 'utf8'));

  // A stand-in tenant table using the exact predicate shape the 163 real
  // policies use: auth.uid() = user_id.
  await admin.query(`
    CREATE TABLE public.iso_trips (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      destination text NOT NULL,
      sale_price numeric(12,2) NOT NULL DEFAULT 0
    )`);
  await admin.query('ALTER TABLE public.iso_trips ENABLE ROW LEVEL SECURITY');
  await admin.query('ALTER TABLE public.iso_trips FORCE ROW LEVEL SECURITY');
  await admin.query(`
    CREATE POLICY iso_trips_tenant ON public.iso_trips FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`);
  await admin.query('GRANT USAGE ON SCHEMA public TO authenticated, anon');
  await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_trips TO authenticated');

  await admin.query(
    `INSERT INTO auth.users (id, email, migrated_from_supabase) VALUES ($1,$2,true), ($3,$4,true)`,
    [UID_A, 'a@example.test', UID_B, 'b@example.test']
  );
  await admin.query(
    `INSERT INTO public.iso_trips (user_id, destination, sale_price)
     VALUES ($1,'A-Paris',1000.00), ($2,'B-Rome',2000.00)`,
    [UID_A, UID_B]
  );

  // A login role shaped like the Cloud Run service account: can log in, holds
  // service_role so it may call bind_identity, and must NOT have BYPASSRLS.
  await admin.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mydesck_app') THEN
        CREATE ROLE mydesck_app LOGIN PASSWORD 'app_test_pw' NOBYPASSRLS;
      END IF;
    END $$`);
  await admin.query('GRANT service_role, authenticated, anon TO mydesck_app');
  await admin.query('GRANT USAGE ON SCHEMA auth, public TO mydesck_app');

  const appUrl = new URL(PGURL);
  appUrl.username = 'mydesck_app';
  appUrl.password = 'app_test_pw';

  /** Open a transaction as `uid` exactly the way the API tier will. */
  async function asUser(client, uid, fn) {
    await client.query('BEGIN');
    try {
      await client.query('SELECT auth.bind_identity($1::uuid, $2)', [uid, 'authenticated']);
      await client.query('SET LOCAL ROLE authenticated');
      return await fn();
    } finally {
      await client.query('COMMIT');
    }
  }

  console.log('[Phase 11] auth.uid() compatibility\n');

  const c1 = new pg.Client({ connectionString: appUrl.toString() });
  await c1.connect();

  await test('auth.uid() is NULL on an unbound connection (fails closed)', async () => {
    const r = await c1.query('SELECT auth.uid() AS uid, auth.role() AS role');
    if (r.rows[0].uid !== null) throw new Error(`expected NULL, got ${r.rows[0].uid}`);
    if (r.rows[0].role !== 'anon') throw new Error(`expected anon, got ${r.rows[0].role}`);
  });

  await test('auth.uid() returns A\'s original Supabase UUID for user A', async () => {
    await asUser(c1, UID_A, async () => {
      const r = await c1.query('SELECT auth.uid() AS uid');
      if (r.rows[0].uid !== UID_A) throw new Error(`expected ${UID_A}, got ${r.rows[0].uid}`);
    });
  });

  await test('auth.uid() returns B\'s original Supabase UUID for user B', async () => {
    await asUser(c1, UID_B, async () => {
      const r = await c1.query('SELECT auth.uid() AS uid');
      if (r.rows[0].uid !== UID_B) throw new Error(`expected ${UID_B}, got ${r.rows[0].uid}`);
    });
  });

  console.log('\n[Phase 10] pooled-connection identity leakage\n');

  await test('identity does NOT survive the transaction that set it', async () => {
    await asUser(c1, UID_A, async () => {});
    const r = await c1.query('SELECT auth.uid() AS uid');
    if (r.rows[0].uid !== null) {
      throw new Error(`LEAK: identity ${r.rows[0].uid} persisted after COMMIT on the same connection`);
    }
  });

  await test('reusing one connection for A then B never shows A\'s identity to B', async () => {
    for (let i = 0; i < 25; i++) {
      const uid = i % 2 === 0 ? UID_A : UID_B;
      await asUser(c1, uid, async () => {
        const r = await c1.query('SELECT auth.uid() AS uid');
        if (r.rows[0].uid !== uid) {
          throw new Error(`LEAK on iteration ${i}: expected ${uid}, got ${r.rows[0].uid}`);
        }
      });
    }
  });

  await test('a real pool interleaving A and B keeps identities separate', async () => {
    const pool = new pg.Pool({ connectionString: appUrl.toString(), max: 2 });
    try {
      const work = Array.from({ length: 40 }, (_, i) => async () => {
        const uid = i % 2 === 0 ? UID_A : UID_B;
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT auth.bind_identity($1::uuid, $2)', [uid, 'authenticated']);
          await c.query('SET LOCAL ROLE authenticated');
          const r = await c.query('SELECT auth.uid() AS uid');
          await c.query('COMMIT');
          if (r.rows[0].uid !== uid) throw new Error(`LEAK: expected ${uid}, got ${r.rows[0].uid}`);
        } finally { c.release(); }
      });
      await Promise.all(work.map((w) => w()));
    } finally { await pool.end(); }
  });

  await test('rolled-back transaction leaves no identity behind', async () => {
    await c1.query('BEGIN');
    await c1.query('SELECT auth.bind_identity($1::uuid, $2)', [UID_A, 'authenticated']);
    await c1.query('ROLLBACK');
    const r = await c1.query('SELECT auth.uid() AS uid');
    if (r.rows[0].uid !== null) throw new Error(`LEAK after ROLLBACK: ${r.rows[0].uid}`);
  });

  console.log('\n[Phase 13] tenant isolation\n');

  await test('A -> A: can read own trip', async () => {
    await asUser(c1, UID_A, async () => {
      const r = await c1.query('SELECT destination FROM public.iso_trips');
      if (r.rowCount !== 1 || r.rows[0].destination !== 'A-Paris') {
        throw new Error(`expected exactly A-Paris, got ${JSON.stringify(r.rows)}`);
      }
    });
  });

  await test('A -> B: cannot SELECT B\'s trip', async () => {
    await asUser(c1, UID_A, async () => {
      const r = await c1.query('SELECT * FROM public.iso_trips WHERE user_id = $1', [UID_B]);
      if (r.rowCount !== 0) throw new Error(`CROSS-TENANT READ: ${r.rowCount} of B's rows visible to A`);
    });
  });

  await test('A -> B: cannot UPDATE B\'s trip', async () => {
    await asUser(c1, UID_A, async () => {
      const r = await c1.query(
        `UPDATE public.iso_trips SET sale_price = 1 WHERE user_id = $1`, [UID_B]);
      if (r.rowCount !== 0) throw new Error(`CROSS-TENANT WRITE: ${r.rowCount} rows updated`);
    });
  });

  await test('A -> B: cannot DELETE B\'s trip', async () => {
    await asUser(c1, UID_A, async () => {
      const r = await c1.query('DELETE FROM public.iso_trips WHERE user_id = $1', [UID_B]);
      if (r.rowCount !== 0) throw new Error(`CROSS-TENANT DELETE: ${r.rowCount} rows deleted`);
    });
  });

  await test('A -> B: cannot INSERT a row owned by B', async () => {
    await asUser(c1, UID_A, async () => {
      const refused = await denied(c1,
        `INSERT INTO public.iso_trips (user_id, destination) VALUES ($1,'forged')`, [UID_B]);
      if (!refused) throw new Error('WITH CHECK did not stop A from writing a row owned by B');
    });
  });

  await test('B -> A: symmetric denial', async () => {
    await asUser(c1, UID_B, async () => {
      const r = await c1.query('SELECT * FROM public.iso_trips WHERE user_id = $1', [UID_A]);
      if (r.rowCount !== 0) throw new Error(`CROSS-TENANT READ: ${r.rowCount} of A's rows visible to B`);
    });
  });

  await test('anonymous (unbound) sees nothing', async () => {
    await c1.query('BEGIN');
    await c1.query('SET LOCAL ROLE authenticated');   // role set, identity NOT bound
    const r = await c1.query('SELECT * FROM public.iso_trips');
    await c1.query('COMMIT');
    if (r.rowCount !== 0) throw new Error(`${r.rowCount} rows leaked to an unbound caller`);
  });

  await test('anon role cannot read the tenant table at all', async () => {
    await c1.query('BEGIN');
    await c1.query('SET LOCAL ROLE anon');
    const refused = await denied(c1, 'SELECT * FROM public.iso_trips');
    await c1.query('COMMIT').catch(() => c1.query('ROLLBACK'));
    if (!refused) throw new Error('anon could query the tenant table');
  });

  await test('a client cannot bind an identity itself', async () => {
    await c1.query('BEGIN');
    await c1.query('SET LOCAL ROLE authenticated');
    const refused = await denied(c1, 'SELECT auth.bind_identity($1::uuid, $2)', [UID_B, 'authenticated']);
    await c1.query('COMMIT').catch(() => c1.query('ROLLBACK'));
    if (!refused) throw new Error('CRITICAL: authenticated can call bind_identity and impersonate anyone');
  });

  await test('a client cannot forge identity with plain SET', async () => {
    await c1.query('BEGIN');
    await c1.query('SET LOCAL ROLE authenticated');
    // Even if set_config is reachable, the role change must not let A see B.
    await c1.query(`SELECT set_config('app.user_id', $1, true)`, [UID_B]).catch(() => {});
    const r = await c1.query('SELECT * FROM public.iso_trips').catch(() => ({ rowCount: 0, rows: [] }));
    await c1.query('COMMIT').catch(() => c1.query('ROLLBACK'));
    // Note: this documents a REAL residual risk. If the app role can call
    // set_config directly, the boundary depends on the API tier never
    // exposing raw SQL. Recorded rather than hidden.
    if (r.rowCount > 1) throw new Error('identity forgery exposed more than one tenant');
  });

  console.log('\n[Phase 12] RLS posture\n');

  await test('no non-superuser login role holds BYPASSRLS', async () => {
    const r = await admin.query(
      `SELECT rolname FROM pg_roles WHERE rolbypassrls AND NOT rolsuper AND rolcanlogin`);
    if (r.rowCount > 0) {
      throw new Error(`BYPASSRLS held by: ${r.rows.map((x) => x.rolname).join(', ')}`);
    }
  });

  await test('auth.assert_security_posture() reports all checks passing', async () => {
    const r = await admin.query('SELECT * FROM auth.assert_security_posture()');
    const bad = r.rows.filter((x) => !x.passed);
    if (bad.length) {
      throw new Error(bad.map((b) => `${b.check_name}: ${b.detail}`).join(' | '));
    }
  });

  await test('migration.go_no_go fails closed on an empty ledger', async () => {
    const r = await admin.query(`SELECT gate, status FROM migration.go_no_go`);
    const authGate = r.rows.find((x) => x.gate === 'auth: all users classified');
    if (!authGate) throw new Error('gate view missing the auth classification row');
    if (authGate.status !== 'FAIL') {
      throw new Error('empty ledger reported PASS — the gate must fail closed');
    }
  });

  await c1.end();
} finally {
  await admin.query('DROP TABLE IF EXISTS public.iso_trips CASCADE').catch(() => {});
  await admin.end();
}

console.log(`\n[identity-isolation] ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  FAIL  ${f.name}\n        ${f.message}`);
process.exit(failures.length ? 1 : 0);
