#!/usr/bin/env node
/**
 * Phase 8 — Firebase Auth import tool.
 *
 * Modes
 *   --dry-run   (default)  read Supabase, classify, build records, write the
 *                          ledger and a redacted report. NOTHING is sent to
 *                          Firebase. Safe to run against production.
 *   --execute              actually import. Refuses without --i-understand and
 *                          a staging project, and refuses if any blocker exists.
 *
 * Safety properties, all enforced rather than documented:
 *   * every account lands in exactly one class; none is silently dropped
 *   * the Firebase uid is always the original Supabase uuid, never generated
 *   * password hashes are held in memory only and never logged or written
 *   * a blocking account stops the whole run, not just its own record
 *   * --execute against a project whose id looks like production is refused
 *
 *   node migration/tools/firebase-auth-import.mjs --dry-run \
 *     --source "postgres://...supabase..." --out migration/reports/auth-dry-run.json
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import {
  classifyAccount, buildImportRecord, chunk, redact, toLedgerRows, summarize,
  FIREBASE_IMPORT_BATCH_SIZE,
} from './lib/auth-classify.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const EXECUTE = has('--execute');
const SOURCE = val('--source', process.env.SUPABASE_DB_URL);
const OUT = val('--out', 'migration/reports/auth-dry-run.json');
const FIXTURE = val('--fixture');           // offline self-test input

// --------------------------------------------------------------- guard rails

if (EXECUTE) {
  const projectId = val('--firebase-project', process.env.FIREBASE_PROJECT_ID);
  if (!has('--i-understand')) {
    console.error('REFUSED: --execute requires --i-understand.');
    console.error('Read migration/reports/auth-dry-run.json first and confirm zero blockers.');
    process.exit(1);
  }
  if (!projectId) {
    console.error('REFUSED: --execute requires --firebase-project.');
    process.exit(1);
  }
  // The first milestone must run against staging. "mydesckpro" is the project
  // the product will actually use; importing real users there is out of scope
  // until staging has passed every gate.
  if (!/-(staging|stg|test|dev)$/.test(projectId)) {
    console.error(`REFUSED: "${projectId}" does not look like a staging project.`);
    console.error('Expected a project id ending in -staging, -stg, -test or -dev.');
    console.error('Importing into the production project is a separate, later, approved step.');
    process.exit(1);
  }
  console.error('REFUSED: import execution is not enabled in this build.');
  console.error('');
  console.error('  The Firebase Admin SDK path is intentionally not wired up yet:');
  console.error('  no service-account credential has been provisioned, and the');
  console.error('  bcrypt round-trip has not been proved on a throwaway project.');
  console.error('  Wire it only after that proof passes. See the milestone report.');
  process.exit(1);
}

// --------------------------------------------------------------- load source

let rows;
if (FIXTURE) {
  rows = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  console.log(`[auth-import] dry run against fixture ${FIXTURE} (${rows.length} accounts)`);
} else if (SOURCE) {
  const client = new pg.Client({ connectionString: SOURCE });
  await client.connect();
  try {
    const r = await client.query(`
      SELECT u.id, u.email, u.encrypted_password, u.email_confirmed_at, u.phone,
             (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_banned,
             EXISTS (SELECT 1 FROM auth.identities i
                      WHERE i.user_id = u.id AND i.provider <> 'email') AS has_oauth_identity,
             EXISTS (SELECT 1 FROM public.business_profiles b WHERE b.user_id = u.id)
               AS has_business_profile,
             EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = u.id)
               AS has_user_profile
      FROM auth.users u
      ORDER BY u.created_at`);
    rows = r.rows;
    console.log(`[auth-import] read ${rows.length} accounts from the source (read-only)`);
  } finally {
    await client.end();
  }
} else {
  console.error('NOT RUN: no --source connection string and no --fixture.');
  console.error('');
  console.error('  The production auth population has NOT been classified.');
  console.error('  Supabase does not expose auth.users through its API, so this');
  console.error('  requires the direct PostgreSQL connection string.');
  console.error('');
  console.error('  Offline self-test:');
  console.error('    node migration/tools/firebase-auth-import.mjs \\');
  console.error('      --fixture migration/fixtures/auth-population.sample.json');
  process.exit(2);
}

// --------------------------------------------------------------- classify

const emailCounts = new Map();
for (const r of rows) {
  if (r.email) {
    const k = r.email.toLowerCase();
    emailCounts.set(k, (emailCounts.get(k) || 0) + 1);
  }
}

const classifications = rows.map((r) => classifyAccount(r, { emailCounts }));
const summary = summarize(classifications);
const ledger = toLedgerRows(rows, classifications);

// Build the records so construction failures surface now, not mid-import.
const records = [];
const buildFailures = [];
rows.forEach((r, i) => {
  if (classifications[i].blocking) return;
  try { records.push(buildImportRecord(r)); }
  catch (e) { buildFailures.push({ supabase_uid: r.id, error: e.message }); }
});

const blockers = rows
  .map((r, i) => ({ r, c: classifications[i] }))
  .filter((x) => x.c.blocking)
  .map((x) => ({ supabase_uid: x.r.id, email: x.r.email ?? null, reasons: x.c.reasons }));

// Invariant: nobody may be lost between input and output.
const accountedFor = records.length + blockers.length + buildFailures.length;
const conservationOk = accountedFor === rows.length;

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'dry-run',
  sourceKind: FIXTURE ? 'fixture' : 'supabase-postgres',
  totals: {
    sourceAccounts: rows.length,
    importableRecords: records.length,
    blockers: blockers.length,
    buildFailures: buildFailures.length,
    accountedFor,
    conservationOk,
  },
  classification: summary,
  uidPreservation: {
    // Every row: firebase_uid is assigned as supabase_uid by construction.
    allPreserved: ledger.every((l) => l.firebase_uid === l.supabase_uid),
    notPreserved: ledger.filter((l) => l.firebase_uid !== l.supabase_uid).map((l) => l.supabase_uid),
  },
  batching: {
    batchSize: FIREBASE_IMPORT_BATCH_SIZE,
    batchCount: chunk(records).length,
  },
  blockers,
  buildFailures,
  ledgerPreview: redact(ledger.slice(0, 5)),
  verdict: null,
};

report.verdict =
  !conservationOk ? 'NO_GO: account conservation failed'
  : blockers.length ? `NO_GO: ${blockers.length} blocking account(s) need a human decision`
  : buildFailures.length ? `NO_GO: ${buildFailures.length} record(s) could not be built`
  : !report.uidPreservation.allPreserved ? 'NO_GO: at least one UID would not be preserved'
  : 'GO: ready for staging import once the bcrypt round-trip is proved';

mkdirSync('migration/reports', { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

// Ledger SQL, so the mapping is inserted from a reviewed artifact rather than
// generated inline at import time.
const ledgerSql =
  '-- Generated by migration/tools/firebase-auth-import.mjs --dry-run.\n' +
  '-- Contains no password material.\n' +
  ledger.map((l) =>
    `INSERT INTO migration.user_id_map (supabase_uid, firebase_uid, email, auth_class, ` +
    `has_password_hash, hash_format_ok, email_confirmed, has_oauth_identity, has_phone, ` +
    `is_banned, has_business_profile, has_user_profile, failure_reason) VALUES (` +
    [l.supabase_uid, l.firebase_uid, l.email, l.auth_class, l.has_password_hash, l.hash_format_ok,
     l.email_confirmed, l.has_oauth_identity, l.has_phone, l.is_banned, l.has_business_profile,
     l.has_user_profile, l.failure_reason]
      .map((v) => v === null || v === undefined ? 'NULL'
        : typeof v === 'boolean' ? String(v)
        : `'${String(v).replace(/'/g, "''")}'`)
      .join(', ') +
    ')\nON CONFLICT (supabase_uid) DO UPDATE SET ' +
    'firebase_uid=EXCLUDED.firebase_uid, auth_class=EXCLUDED.auth_class, updated_at=now();'
  ).join('\n') + '\n';
const ledgerPath = OUT.replace(/\.json$/, '') + '.ledger.sql';
writeFileSync(ledgerPath, ledgerSql, 'utf8');

console.log('');
console.log(`  source accounts ........... ${report.totals.sourceAccounts}`);
console.log(`  transparent ............... ${summary.transparent}`);
console.log(`  reauth .................... ${summary.reauth}`);
console.log(`  reset_required ............ ${summary.reset_required}`);
console.log(`  manual_review (blocking) .. ${summary.manual_review}`);
console.log(`  importable records ........ ${report.totals.importableRecords} in ${report.batching.batchCount} batch(es)`);
console.log(`  UIDs preserved ............ ${report.uidPreservation.allPreserved ? 'ALL' : 'NO — ' + report.uidPreservation.notPreserved.length + ' exception(s)'}`);
console.log(`  account conservation ...... ${conservationOk ? 'OK' : 'FAILED'}`);
console.log('');
console.log(`  ${report.verdict}`);
console.log('');
console.log(`  report -> ${OUT}`);
console.log(`  ledger -> ${ledgerPath}`);

process.exit(report.verdict.startsWith('GO') ? 0 : 1);
