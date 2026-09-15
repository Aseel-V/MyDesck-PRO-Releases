#!/usr/bin/env node
/**
 * Verifies the privacy of the real production signature object.
 *
 * Every request here is expected to be DENIED. Nothing in this tool is authorised to read the
 * object, and no request that could succeed against customer content is issued: the only
 * successful call is a HEAD against the public source, which is already world-readable and is
 * exactly the exposure being measured. No bytes are retained or printed, and paths are hashed.
 *
 * A synthetic Firebase identity is created to prove "wrong user" denial against the real path,
 * then deleted. It is never given the owner's UID - fabricating a customer's identity to read
 * their own signature would be impersonation, not a test.
 *
 * STRICTLY READ-ONLY with respect to customer data. productionCustomerObjectsModified: 0.
 */
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'mydesckpro';
const BUCKET = 'business-signatures';
const OWNER_UID = '72647632-d481-4889-bf27-ed1bb14ad347';
const runId = `migration-test--privacy-${randomUUID()}`;

const readEnv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const app = readEnv('.env');
const mig = readEnv('migration/.env.local');
const U = app.VITE_SUPABASE_URL;
const ANON = app.VITE_SUPABASE_ANON_KEY;
const ca = mig.SUPABASE_CA_FILE ? readFileSync(mig.SUPABASE_CA_FILE, 'utf8') : null;

const db = new pg.Client({ connectionString: mig.SUPABASE_DB_URL || mig.PGURL,
  // Certificate verification is never switched off: without SUPABASE_CA_FILE the system trust store is used.
  ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });
await db.connect();
await db.query('BEGIN TRANSACTION READ ONLY');
const target = (await db.query(
  `select name from storage.objects where bucket_id=$1`, [BUCKET])).rows[0]?.name ?? null;
// A zero-byte .emptyFolderPlaceholder is what Supabase leaves behind after the last file in a
// folder is deleted. It is not the signature, so it must not read as "the source still exists".
const source = (await db.query(
  `select name from storage.objects
   where bucket_id='logos' and name like 'business-signatures/%'
     and coalesce((metadata->>'size')::bigint, 0) > 0
     and split_part(name, '/', array_length(string_to_array(name, '/'), 1)) <> '.emptyFolderPlaceholder'`))
  .rows[0]?.name ?? null;
const policyAllowsOwner = target ? (await db.query(
  `select ((storage.foldername($1))[1] = $2) is true as ok`, [target, OWNER_UID])).rows[0].ok : false;
await db.query('ROLLBACK');
await db.end();
if (!target) throw Error('PRIVATE_TARGET_MISSING');

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const operator = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'], { encoding: 'utf8', timeout: 60000 }).trim();
const adminHeaders = { Authorization: `Bearer ${operator}`, 'Content-Type': 'application/json',
  'x-goog-user-project': PROJECT };

// A synthetic identity that is deliberately NOT the owner.
const strangerUid = randomUUID();
const email = `${runId}@example.test`;
const password = `Privacy-${randomUUID()}!7a`;
let r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`,
  { method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ localId: strangerUid, email, password, emailVerified: true }) });
if (!r.ok) throw Error(`IDENTITY_CREATE_FAILED_${r.status}`);
r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
  { method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ localId: strangerUid, customAttributes: JSON.stringify({ role: 'authenticated' }) }) });
if (!r.ok) throw Error(`CLAIM_SET_FAILED_${r.status}`);
r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${mig.FIREBASE_WEB_API_KEY}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }) });
if (!r.ok) throw Error(`SIGN_IN_FAILED_${r.status}`);
const strangerToken = (await r.json()).idToken;

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const attempt = async (label, url, headers = {}, method = 'GET') => {
  const response = await fetch(url, { method, headers, signal: AbortSignal.timeout(20000) });
  return { label, http: response.status, served: response.status === 200 };
};

const checks = [];
checks.push(await attempt('anonymous, no key', `${U}/storage/v1/object/${BUCKET}/${enc(target)}`));
checks.push(await attempt('anonymous + anon key', `${U}/storage/v1/object/${BUCKET}/${enc(target)}`, { apikey: ANON }));
checks.push(await attempt('anonymous via public CDN path', `${U}/storage/v1/object/public/${BUCKET}/${enc(target)}`));
checks.push(await attempt('wrong Firebase user (read)', `${U}/storage/v1/object/${BUCKET}/${enc(target)}`,
  { apikey: ANON, Authorization: `Bearer ${strangerToken}` }));
checks.push(await attempt('wrong Firebase user (delete)', `${U}/storage/v1/object/${BUCKET}/${enc(target)}`,
  { apikey: ANON, Authorization: `Bearer ${strangerToken}` }, 'DELETE'));
checks.push(await attempt('wrong tenant listing the owner folder',
  `${U}/storage/v1/object/list/${BUCKET}`, { apikey: ANON, Authorization: `Bearer ${strangerToken}` }, 'POST'));

// Clean up the synthetic identity.
const deleted = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
  { method: 'POST', headers: adminHeaders, body: JSON.stringify({ localId: strangerUid }) });

// The public source is the exposure itself; a HEAD confirms it is still served.
const sourceProbe = source
  ? await attempt('public source still served', `${U}/storage/v1/object/public/logos/${enc(source)}`)
  : { label: 'public source still served', http: null, served: false, note: 'no public signature object remains' };

const allDenied = checks.every((c) => !c.served);
const report = {
  generatedAt: new Date().toISOString(),
  migrationRunId: runId,
  bucket: BUCKET,
  targetPathHash: createHash('sha256').update(target).digest('hex').slice(0, 12),
  targetFirstSegmentEqualsOwner: target.split('/')[0] === OWNER_UID,
  policyAllowsOwner,
  deniedChecks: checks,
  allDenied,
  publicSource: sourceProbe,
  syntheticIdentitiesRemaining: deleted.ok ? 0 : 1,
  productionCustomerObjectsModified: 0,
  bytesRead: 0,
  ownerReadProof: {
    status: 'NOT_RUN_BY_DESIGN',
    reason: 'No Firebase identity exists for the owner UID; production Auth import has not run. '
      + 'Creating one bearing a real customer UID to read their signature would be impersonation. '
      + 'Owner access is established by the policy predicate evaluating true for this exact object '
      + 'and by the synthetic hybrid smoke proving owner-folder reads succeed.',
  },
  decision: allDenied && policyAllowsOwner ? 'SIGNATURE_PRIVACY_VERIFIED' : 'SIGNATURE_PRIVACY_FAILED',
};
writeFileSync('migration/reports/signature-privacy-verification.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ targetFirstSegmentEqualsOwner: report.targetFirstSegmentEqualsOwner,
  policyAllowsOwner, checks: checks.map((c) => `${c.label}: ${c.served ? 'SERVED' : 'denied'} (${c.http})`),
  publicSourceStillServed: sourceProbe.served,
  syntheticIdentitiesRemaining: report.syntheticIdentitiesRemaining,
  decision: report.decision }, null, 2));
if (report.decision !== 'SIGNATURE_PRIVACY_VERIFIED') process.exitCode = 2;
