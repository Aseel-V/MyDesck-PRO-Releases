#!/usr/bin/env node
/**
 * Verify the migration target database before any harness runs.
 * Refuses to proceed against anything that looks like production.
 */
import pg from 'pg';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;
if (!PGURL) { console.error('NOT RUN: no PGURL'); process.exit(2); }

if (/supabase\.(co|com)/i.test(PGURL) || /pooler\.supabase/i.test(PGURL)) {
  console.error('ABORT: PGURL points at Supabase. This harness must never run against production.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: PGURL, connectionTimeoutMillis: 10000 });
await c.connect();
const { rows: [r] } = await c.query(`
  SELECT current_setting('server_version') AS sv,
         current_setting('server_version_num')::int AS num,
         current_database() AS db, current_user AS usr,
         inet_server_addr()::text AS addr, inet_server_port() AS port`);
const { rows: [t] } = await c.query(`
  SELECT count(*)::int AS n FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog','information_schema')`);

const isPg17 = r.num >= 170000 && r.num < 180000;
// inet_server_addr() returns an inet value, which renders with a /32 or /128
// suffix. Strip it before comparing, or a genuinely local server reports as
// remote and the operator learns to ignore this line.
const bareAddr = r.addr ? r.addr.split('/')[0] : null;
const isLocal = ['127.0.0.1', '::1', 'localhost', null].includes(bareAddr);

console.log(`  server_version .... ${r.sv}  (num ${r.num})`);
console.log(`  major 17 .......... ${isPg17 ? 'YES' : 'NO'}`);
console.log(`  database .......... ${r.db}`);
console.log(`  connected as ...... ${r.usr}`);
console.log(`  listening ......... ${r.addr}:${r.port}`);
console.log(`  local/disposable .. ${isLocal ? 'YES' : 'NO — review before use'}`);
console.log(`  pre-existing tables ${t.n}`);
await c.end();

if (!isPg17) { console.error('\nFAIL: target is not PostgreSQL 17.'); process.exit(1); }
console.log('\n  target verified.');
