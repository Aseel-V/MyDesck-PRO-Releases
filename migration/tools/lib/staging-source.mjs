import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';

export function localConfig() {
  const keys = ['SUPABASE_DB_URL', 'SUPABASE_CA_FILE', 'PGURL', 'STAGING_TARGET_URL'];
  const config = {};
  for (const file of ['migration/.env.local']) {
    if (existsSync(file)) {
      const values = parseEnv(readFileSync(file, 'utf8'));
      for (const key of keys) if (values[key]) config[key] = values[key];
    }
  }
  for (const key of keys) if (process.env[key]) config[key] = process.env[key];
  return config;
}

export function sourceOptions(config) {
  const url = new URL(config.SUPABASE_DB_URL);
  const user = decodeURIComponent(url.username);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !(url.hostname === 'db.pubugnfaqqukelvgckdr.supabase.co' ||
        (url.hostname.endsWith('.pooler.supabase.com') && user.endsWith('.pubugnfaqqukelvgckdr')))) {
    throw new Error('SOURCE_PROJECT_MISMATCH');
  }
  // Do not let URL query parameters override TLS or read-only startup options.
  return { host: url.hostname, port: Number(url.port || 5432), user,
    password: decodeURIComponent(url.password), database: url.pathname.slice(1) || 'postgres',
    ssl: { rejectUnauthorized: true,
      ...(config.SUPABASE_CA_FILE ? { ca: readFileSync(config.SUPABASE_CA_FILE, 'utf8') } : {}) },
    connectionTimeoutMillis: 10000, statement_timeout: 15000,
    options: '-c default_transaction_read_only=on',
    application_name: 'migration-test--staging-read-only',
  };
}

export const qi = value => '"' + value.replaceAll('"', '""') + '"';

/** Exposes only SELECT, on a single repeatable-read, read-only snapshot. */
export async function withSourceSnapshot(config, work, evidence = {}) {
  const client = new pg.Client(sourceOptions(config));
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const check = async () => {
      const { rows: [row] } = await client.query(`SELECT
        current_setting('transaction_read_only') AS read_only,
        current_setting('transaction_isolation') AS isolation`);
      if (row.read_only !== 'on' || row.isolation !== 'repeatable read') throw new Error('SOURCE_NOT_READ_ONLY');
      return row;
    };
    evidence.start = await check();
    // A false predicate cannot affect a row even if the guard regresses. PostgreSQL
    // must reject the write statement with 25006, not merely affect zero rows.
    await client.query('SAVEPOINT source_write_control');
    let state;
    try { await client.query('UPDATE public.trips SET id = id WHERE false'); }
    catch (error) { state = error.code; }
    await client.query('ROLLBACK TO SAVEPOINT source_write_control');
    if (state !== '25006') throw new Error('SOURCE_WRITE_CONTROL_FAILED');
    evidence.rejectedWriteSqlState = state;
    evidence.successfulWrites = 0;
    const select = async (sql, values = []) => {
      // Internal catalog/row queries only; no arbitrary SQL supplied by callers.
      if (!/^SELECT\s/i.test(sql.trim()) || /;|\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|CALL|COPY|DO|SET|RESET)\b/i.test(sql)) {
        throw new Error('SOURCE_QUERY_NOT_SELECT');
      }
      return client.query(sql, values);
    };
    const result = await work(select);
    evidence.end = await check();
    return result;
  } finally {
    try { await client.query('ROLLBACK'); evidence.transactionOutcome = 'ROLLBACK'; }
    catch { evidence.transactionOutcome = 'CONNECTION_CLOSED'; }
    await client.end().catch(() => {});
  }
}

export function approvedIdentities() {
  const manifest = JSON.parse(readFileSync('migration/reports/firebase-auth-cleanup-manifest.json', 'utf8'));
  if (manifest.deletionApproved !== false) throw new Error('CLEANUP_APPROVAL_CHANGED');
  const users = manifest.identities.filter(x => x.source === 'Supabase');
  if (users.length !== 3 || new Set(users.map(x => x.uid)).size !== 3 ||
      users.some(x => !x.email.startsWith('migration-test--') || !manifest.identities.some(
        y => y.source === 'Firebase' && y.uid === x.uid && y.email === x.email))) {
    throw new Error('SYNTHETIC_SLICE_INVALID');
  }
  return users;
}
