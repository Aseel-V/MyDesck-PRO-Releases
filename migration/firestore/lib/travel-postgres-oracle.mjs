/**
 * The tourism write oracle: a disposable local PostgreSQL 17 with the source schema, so the Firestore trip commands
 * can be compared with what save_trip_transaction, the payment functions and the trip triggers actually write.
 *
 * Built only from repository files: scripts/security/postgres-platform-fixture.sql (roles, auth.uid() from the
 * request.jwt.claims setting, storage stubs), every supabase/migrations file in order, then
 * migration/firestore/oracle/travel-production-overlay.sql (the production catalog facts the migrations lack).
 * Nothing connects to production; the database lives in a temporary directory and is removed on stop.
 *
 * embedded-postgres reads its binaries from node_modules, and initdb fails when that path contains non-ASCII characters
 * (this repository sits under a Hebrew folder name): run from an ASCII drive mapped with subst.
 */
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const ORACLE_OVERLAY = 'migration/firestore/oracle/travel-production-overlay.sql';

export async function startTravelOracle({ port = 55443 } = {}) {
  if (/[^\x00-\x7F]/.test(process.cwd())) {
    throw new Error('TRAVEL_ORACLE_REQUIRES_ASCII_PATH: map the repository to a drive with subst.exe and run from it');
  }
  // As scripts/test-security-postgres.mjs does: initdb on Windows fails on non-ASCII environment values.
  for (const [key, value] of Object.entries(process.env)) {
    if (/[^\x00-\x7F]/.test(key) || /[^\x00-\x7F]/.test(value ?? '')) delete process.env[key];
  }
  if (process.platform === 'win32' && process.env.SystemRoot) process.env.PATH = `${process.env.PATH};${process.env.SystemRoot}\\System32`;
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const directory = mkdtempSync(join(tmpdir(), 'mydesck-travel-oracle-'));
  const pg = new EmbeddedPostgres({
    databaseDir: join(directory, 'data'), user: 'postgres', password: randomBytes(24).toString('hex'), port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  // PostgREST sessions on the source run in UTC: now()::date, date + interval and to_jsonb timestamps follow it.
  await client.query("SET TIME ZONE 'UTC'");
  const applied = [];
  try {
    await client.query(readFileSync('scripts/security/postgres-platform-fixture.sql', 'utf8'));
    for (const file of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
      try { await client.query(readFileSync(`supabase/migrations/${file}`, 'utf8')); } catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
      applied.push(file);
    }
    await client.query(readFileSync(ORACLE_OVERLAY, 'utf8'));
  } catch (error) {
    await client.end().catch(() => undefined);
    await pg.stop().catch(() => undefined);
    throw error;
  }

  return {
    client,
    migrations: applied.length,
    /** A source owner: the auth user and the business profile the trip functions and the rehearsal key on. */
    async createOwner(uid, { businessId, businessType = 'tourism', email = `${uid}@example.invalid` } = {}) {
      await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [uid, email]);
      if (businessId) {
        await client.query(`INSERT INTO public.business_profiles (id, user_id, business_name, business_type)
          VALUES ($1, $2, $3, $4::text::business_type) ON CONFLICT (id) DO NOTHING`, [businessId, uid, `Oracle ${uid.slice(0, 8)}`, businessType])
          .catch(async () => client.query(`INSERT INTO public.business_profiles (id, user_id, business_name, business_type)
            VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [businessId, uid, `Oracle ${uid.slice(0, 8)}`, businessType]));
      }
    },
    /** One transaction as the signed-in owner, as PostgREST runs an authenticated request. */
    async asOwner(uid, work) {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE authenticated');
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
          [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    },
    /** Rows as PostgREST renders them (json_agg): UTC timestamps, NUMERIC as JSON numbers. */
    async rows(sql, params = []) {
      const { rows: [row] } = await client.query(`SELECT coalesce(json_agg(t), '[]'::json)::text AS rows FROM (${sql}) t`, params);
      return JSON.parse(row.rows);
    },
    async stop() {
      await client.end().catch(() => undefined);
      await pg.stop();
    },
  };
}
