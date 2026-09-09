#!/usr/bin/env node
/** Read-only prerequisites. Does not sign up, import, export or delete users. */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { writeReport } from './lib/write-report.mjs';

const allowed = ['SUPABASE_DB_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'FIREBASE_WEB_API_KEY'];
const config = {};
for (const file of ['.env', '.env.local', 'migration/.env.local']) {
  if (!existsSync(file)) continue;
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const key of allowed) if (parsed[key]) config[key] = parsed[key];
}
for (const key of allowed) if (process.env[key]) config[key] = process.env[key];

const report = { generatedAt: new Date().toISOString(), status: 'NOT RUN',
  sourceProject: 'pubugnfaqqukelvgckdr', firebaseProject: 'mydesckpro',
  inputs: Object.fromEntries(allowed.map(key => [key, Boolean(config[key])])),
  sourceDatabaseReadOnlyConnection: 'NOT RUN', customerRowsRead: 0,
  customerHashesRead: 0, usersCreated: 0, blockers: [],
};
for (const key of allowed) if (!config[key]) report.blockers.push(`MISSING_${key}`);

let client;
try {
  if (config.VITE_SUPABASE_URL && new URL(config.VITE_SUPABASE_URL).origin !==
      'https://pubugnfaqqukelvgckdr.supabase.co') throw new Error('SOURCE_API_PROJECT_MISMATCH');
  if (report.blockers.length === 0) {
    const url = new URL(config.SUPABASE_DB_URL);
    const user = decodeURIComponent(url.username);
    const direct = url.hostname === 'db.pubugnfaqqukelvgckdr.supabase.co';
    const pooler = url.hostname.endsWith('.pooler.supabase.com') && user.endsWith('.pubugnfaqqukelvgckdr');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(direct || pooler)) {
      throw new Error('SOURCE_DATABASE_PROJECT_MISMATCH');
    }
    // Explicit fields prevent URL sslmode/no-verify options overriding TLS.
    client = new pg.Client({ host: url.hostname, port: Number(url.port || 5432),
      user, password: decodeURIComponent(url.password), database: url.pathname.slice(1) || 'postgres',
      ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000,
      statement_timeout: 10000, application_name: 'migration-test--auth-proof-preflight',
    });
    await client.connect();
    await client.query('BEGIN READ ONLY');
    // Privilege metadata only: no auth rows or hashes are selected.
    const { rows: [permissions] } = await client.query(`SELECT
      has_column_privilege(current_user, 'auth.users', 'id', 'SELECT') AS id,
      has_column_privilege(current_user, 'auth.users', 'email', 'SELECT') AS email,
      has_column_privilege(current_user, 'auth.users', 'encrypted_password', 'SELECT') AS hash,
      has_column_privilege(current_user, 'auth.users', 'email_confirmed_at', 'SELECT') AS verification`);
    await client.query('ROLLBACK');
    if (!Object.values(permissions).every(Boolean)) throw new Error('SOURCE_SYNTHETIC_HASH_READ_PERMISSION_MISSING');
    report.sourceDatabaseReadOnlyConnection = 'PASS';
  }
} catch (error) {
  const safeCodes = ['SOURCE_API_PROJECT_MISMATCH', 'SOURCE_DATABASE_PROJECT_MISMATCH', 'SOURCE_SYNTHETIC_HASH_READ_PERMISSION_MISSING'];
  report.blockers.push(safeCodes.includes(error.message) ? error.message : 'SOURCE_DATABASE_CONNECTION_FAILED');
  report.sourceDatabaseReadOnlyConnection = 'FAIL';
} finally {
  if (client) await client.end().catch(() => {});
}
report.status = report.blockers.length ? 'BLOCKED' : 'INPUTS_READY_ONLY';
writeReport('migration/reports/firebase-auth-proof-inputs.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.blockers.length ? 2 : 0;
