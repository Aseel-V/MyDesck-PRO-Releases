#!/usr/bin/env node
/**
 * Provision a synthetic Firebase identity whose uid is an explicit UUID.
 *
 * This is the operator/migration path, not the client path. The production Auth migration preserves
 * each Supabase `auth.users.id` (a uuid) verbatim as the Firebase uid
 * (`auth-readiness-ledger.mjs:46`, enforced by `production-auth-import.mjs:10`), so a migrated
 * identity has a UUID-shaped uid. Firebase's own `signUp` cannot produce one: it mints a
 * 28-character id. To exercise anything that depends on the uid's *shape* — a Storage RLS predicate
 * that casts to uuid, for instance — the identity has to be created here, the way the import creates
 * it, with `localId` supplied.
 *
 * Safety: the uid must be a syntactically valid UUID and the email must sit in the synthetic
 * `migration-test--` namespace. Both are refused otherwise, in create and in delete, so this can
 * never mint or remove a real customer identity. Passwords are never logged.
 *
 *   --mode=create --uid=<uuid> --email=migration-test--... --password=...
 *   --mode=delete --uid=<uuid>
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT = 'mydesckpro';
const SYNTHETIC_PREFIX = 'migration-test--';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = arg('--mode', 'create');
const uid = arg('--uid');
const email = arg('--email');
const password = arg('--password');

if (!['create', 'delete'].includes(mode)) throw Error('UNSUPPORTED_MODE');
// The UUID requirement exists because this tool provisions MIGRATED identity shapes. Reclaiming an
// abandoned synthetic prefix in Storage needs the opposite: an identity whose uid is the
// Firebase-generated string that owns the residue, so it can delete its own object through the
// supported owner path instead of anyone mutating storage.objects directly. That is allowed only
// behind this explicit flag, and the synthetic-email namespace guard below still applies in full.
const allowNonUuid = process.argv.includes('--allow-nonuuid');
if (!uid || (!UUID_V4.test(uid) && !allowNonUuid)) throw Error('UUID_SHAPED_UID_REQUIRED');
if (allowNonUuid && !/^[A-Za-z0-9]{20,40}$/.test(uid) && !UUID_V4.test(uid)) throw Error('UNRECOGNISED_UID_SHAPE');

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const token = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'], { encoding: 'utf8', timeout: 60000 }).trim();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const base = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

/** Refuses to touch anything outside the synthetic namespace. */
async function assertSynthetic(localId) {
  const response = await fetch(`${base}/accounts:lookup`, { method: 'POST', headers,
    body: JSON.stringify({ localId: [localId] }) });
  const data = await response.json();
  if (!response.ok) throw Error(`LOOKUP_FAILED_${response.status}`);
  const user = (data.users ?? [])[0];
  if (!user) return null;
  if (!String(user.email ?? '').startsWith(SYNTHETIC_PREFIX)) throw Error('REFUSED_NON_SYNTHETIC_IDENTITY');
  return user;
}

if (mode === 'create') {
  if (!email || !email.startsWith(SYNTHETIC_PREFIX)) throw Error('SYNTHETIC_EMAIL_REQUIRED');
  if (!password) throw Error('PASSWORD_REQUIRED');
  const response = await fetch(`${base}/accounts`, { method: 'POST', headers,
    body: JSON.stringify({ localId: uid, email, password, emailVerified: false }) });
  const data = await response.json();
  if (!response.ok) throw Error(`CREATE_FAILED_${response.status}:${JSON.stringify(data.error ?? {}).slice(0, 200)}`);
  // Confirm the uid landed exactly as supplied rather than being reassigned.
  const created = await assertSynthetic(uid);
  if (!created || created.localId !== uid) throw Error('UID_NOT_PRESERVED_BY_PROVIDER');
  console.log(JSON.stringify({ mode, uidPreserved: true, uidIsUuid: UUID_V4.test(uid),
    uidFingerprint: fingerprint(uid), emailNamespace: SYNTHETIC_PREFIX, customerRecordsModified: 0 }));
} else {
  const existing = await assertSynthetic(uid);
  if (!existing) { console.log(JSON.stringify({ mode, deleted: false, reason: 'ALREADY_ABSENT', customerRecordsModified: 0 })); }
  else {
    const response = await fetch(`${base}/accounts:delete`, { method: 'POST', headers,
      body: JSON.stringify({ localId: uid }) });
    if (!response.ok) throw Error(`DELETE_FAILED_${response.status}`);
    console.log(JSON.stringify({ mode, deleted: true, uidFingerprint: fingerprint(uid), customerRecordsModified: 0 }));
  }
}
