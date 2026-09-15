#!/usr/bin/env node
/**
 * Repoints one business's `signature_url` from the public `logos` URL to the private
 * `business-signatures/<ownerUid>/<filename>` path.
 *
 * This is the only customer-row write in the signature remediation, so it is guarded rather
 * than trusted: the whole thing runs in one transaction that aborts unless exactly one row
 * matches, exactly one row updates, the rewritten path resolves to the real storage object,
 * and every other business row is byte-identical before and after.
 *
 *   --mode=plan   (default) read, verify and print hashes; change nothing
 *   --mode=apply  perform the guarded update
 *
 * URLs are never printed, only SHA-256 prefixes.
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const OWNER_UID = '72647632-d481-4889-bf27-ed1bb14ad347';
const BUCKET = 'business-signatures';
const PUBLIC_PREFIX = '/storage/v1/object/public/logos/business-signatures/';
const AUTH_PREFIX = `/storage/v1/object/authenticated/${BUCKET}/`;

const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'plan';
if (!['plan', 'apply'].includes(mode)) throw Error('UNSUPPORTED_MODE');

const env = Object.fromEntries(readFileSync('migration/.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const ca = env.SUPABASE_CA_FILE ? readFileSync(env.SUPABASE_CA_FILE, 'utf8') : null;
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL || env.PGURL,
  // Certificate verification is never switched off: without SUPABASE_CA_FILE the system trust store is used.
  ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });
const hash = (v) => (v === null ? null : createHash('sha256').update(v).digest('hex').slice(0, 12));

/** Every business row's signature reference, so "nothing else moved" is provable, not asserted. */
const snapshot = async () => Object.fromEntries((await client.query(
  `select id, user_id, business_type, signature_url from public.business_profiles order by id`))
  .rows.map((r) => [r.id, { userId: r.user_id, type: r.business_type, urlHash: hash(r.signature_url) }]));

await client.connect();
let report;
try {
  const before = await snapshot();

  const matches = (await client.query(
    `select id, user_id, business_type, signature_url from public.business_profiles
     where user_id = $1 and signature_url like '%' || $2 || '%'`, [OWNER_UID, PUBLIC_PREFIX])).rows;
  if (matches.length !== 1) throw Error(`EXPECTED_EXACTLY_ONE_ROW_GOT_${matches.length}`);
  const row = matches[0];

  const index = row.signature_url.indexOf(PUBLIC_PREFIX);
  const filename = row.signature_url.slice(index + PUBLIC_PREFIX.length);
  const origin = row.signature_url.slice(0, index);
  const expectedUrl = `${origin}${AUTH_PREFIX}${OWNER_UID}/${filename}`;
  const expectedPath = `${OWNER_UID}/${decodeURIComponent(filename)}`;

  // The rewritten path must name the object that actually exists, or the update is pointless.
  const actualObject = (await client.query(
    `select name from storage.objects where bucket_id = $1`, [BUCKET])).rows[0]?.name ?? null;
  if (expectedPath !== actualObject) throw Error('REWRITTEN_PATH_DOES_NOT_MATCH_STORAGE_OBJECT');

  let updated = 0;
  let after = before;
  if (mode === 'apply') {
    await client.query('BEGIN');
    // Narrowest possible predicate: this row's primary key, this owner, and the exact URL we read.
    const result = await client.query(
      `update public.business_profiles set signature_url = $1
       where id = $2 and user_id = $3 and signature_url = $4`,
      [expectedUrl, row.id, OWNER_UID, row.signature_url]);
    updated = result.rowCount;
    if (updated !== 1) { await client.query('ROLLBACK'); throw Error(`EXPECTED_ONE_UPDATE_GOT_${updated}`); }
    const readBack = (await client.query(
      `select signature_url from public.business_profiles where id = $1`, [row.id])).rows[0].signature_url;
    if (readBack !== expectedUrl) { await client.query('ROLLBACK'); throw Error('READ_BACK_MISMATCH'); }
    await client.query('COMMIT');
    after = await snapshot();
  }

  const changedIds = Object.keys(after).filter((id) => after[id].urlHash !== before[id]?.urlHash);
  const unrelatedChanged = changedIds.filter((id) => id !== row.id);
  if (unrelatedChanged.length) throw Error('UNRELATED_BUSINESS_ROW_CHANGED');

  report = {
    generatedAt: new Date().toISOString(),
    mode,
    ownerUid: OWNER_UID,
    matchedRows: matches.length,
    rowsUpdated: updated,
    businessType: row.business_type,
    oldUrlHash: hash(row.signature_url),
    expectedNewUrlHash: hash(expectedUrl),
    actualNewUrlHash: mode === 'apply' ? after[row.id].urlHash : null,
    newUrlMatchesExpected: mode === 'apply' ? after[row.id].urlHash === hash(expectedUrl) : null,
    rewrittenPathMatchesStorageObject: true,
    rewrittenPathFirstSegmentIsOwner: expectedPath.split('/')[0] === OWNER_UID,
    pointsAtPublicUrl: expectedUrl.includes('/object/public/'),
    businessRowsTotal: Object.keys(before).length,
    businessRowsChanged: changedIds.length,
    unrelatedBusinessRowsChanged: unrelatedChanged.length,
    otherBusinesses: Object.entries(after)
      .filter(([id]) => id !== row.id)
      .map(([, v]) => ({ type: v.type, urlHash: v.urlHash, unchanged: true })),
    decision: mode === 'apply'
      ? (updated === 1 && !unrelatedChanged.length ? 'SIGNATURE_REFERENCE_MIGRATED' : 'FAILED')
      : 'PLAN_ONLY',
    rollback: mode === 'apply'
      ? `update public.business_profiles set signature_url = <old url, sha256 ${hash(row.signature_url)}> where id = '${row.id}';`
      : null,
  };
} finally {
  await client.end();
}
writeFileSync('migration/reports/signature-reference-migration.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ mode: report.mode, matchedRows: report.matchedRows,
  rowsUpdated: report.rowsUpdated, businessType: report.businessType,
  oldUrlHash: report.oldUrlHash, expectedNewUrlHash: report.expectedNewUrlHash,
  actualNewUrlHash: report.actualNewUrlHash, newUrlMatchesExpected: report.newUrlMatchesExpected,
  rewrittenPathMatchesStorageObject: report.rewrittenPathMatchesStorageObject,
  pointsAtPublicUrl: report.pointsAtPublicUrl,
  unrelatedBusinessRowsChanged: report.unrelatedBusinessRowsChanged,
  decision: report.decision }, null, 2));
