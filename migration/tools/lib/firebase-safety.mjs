/**
 * Firebase production safe-test guards.
 *
 * `mydesckpro` is the live production project. It is being used deliberately as
 * the migration test target, which means every Admin operation is one mistake
 * away from touching a real customer. These guards make that mistake fail loudly
 * instead of silently succeeding.
 *
 * Nothing here initialises the Admin SDK or performs any Firebase call. It is
 * pure policy, so it can be unit tested with no credential present — which is
 * exactly when it needs to be correct.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------- credentials

/**
 * Service-account key IDs known to be compromised.
 *
 * A `private_key_id` is a public identifier, not secret material — it is safe to
 * record here, and recording it is the point: an operator (or this tooling)
 * must be able to recognise a key that has been exposed.
 *
 * b1ceff39a8… was pasted into a chat transcript on 2026-09-09 and must be
 * revoked in the Firebase console. Nothing may initialise the Admin SDK with it.
 */
export const REVOKED_KEY_IDS = new Set([
  'b1ceff39a8d768ffe9d5d98fe459fbdd2dcc6ca8',
]);

/** Projects that hold real customer data. Safe-test rules apply in full. */
export const PRODUCTION_PROJECT_IDS = new Set(['mydesckpro']);

/**
 * Inspect a service-account file WITHOUT reading or returning key material.
 *
 * Returns only the fields needed to make a safety decision. `private_key` is
 * never read into the returned object, never logged, and never returned.
 */
export function inspectCredential(path) {
  const raw = readFileSync(path, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { ok: false, reason: 'not_valid_json' }; }

  const { project_id: projectId, private_key_id: keyId, client_email: clientEmail, type } = parsed;

  return {
    ok: true,
    type: type ?? null,
    projectId: projectId ?? null,
    keyId: keyId ?? null,
    clientEmail: clientEmail ?? null,
    // Fingerprint of the key ID, for logs that should not carry even the ID.
    keyFingerprint: keyId ? createHash('sha256').update(keyId).digest('hex').slice(0, 16) : null,
    isRevoked: keyId ? REVOKED_KEY_IDS.has(keyId) : false,
    isProductionProject: projectId ? PRODUCTION_PROJECT_IDS.has(projectId) : false,
  };
}

/**
 * The gate every Admin-SDK entry point must pass through.
 * Throws with a machine-readable `code` so callers can report the right verdict.
 */
export function assertCredentialUsable(info) {
  if (!info?.ok) {
    const e = new Error('credential file could not be parsed');
    e.code = 'CREDENTIAL_UNREADABLE';
    throw e;
  }
  if (info.type !== 'service_account') {
    const e = new Error(`expected a service_account credential, got "${info.type}"`);
    e.code = 'CREDENTIAL_WRONG_TYPE';
    throw e;
  }
  if (info.isRevoked) {
    const e = new Error(
      `service-account key ${info.keyId?.slice(0, 10)}… is on the revoked list. ` +
      'It was exposed and must be rotated in the Firebase console before any Admin operation runs.'
    );
    e.code = 'CREDENTIAL_REVOKED';
    throw e;
  }
  return true;
}

// ---------------------------------------------------------------- namespace

/**
 * Every synthetic identity this migration creates lives under one prefix, so it
 * is trivially distinguishable from a real customer by inspection, by query and
 * by cleanup tooling.
 */
export const TEST_EMAIL_PREFIX = 'migration-test--';

/** `migration-test--<label>@<domain>` where label is [a-z0-9-]. */
const TEST_EMAIL_RE = new RegExp(`^${TEST_EMAIL_PREFIX}[a-z0-9-]+@[a-z0-9.-]+\\.[a-z]{2,}$`);

export function isTestEmail(email) {
  return typeof email === 'string' && TEST_EMAIL_RE.test(email.toLowerCase());
}

export function makeTestEmail(label, domain = 'mydesck-migration.invalid') {
  const clean = String(label).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  if (!clean) throw new Error('test email label must contain at least one alphanumeric character');
  const email = `${TEST_EMAIL_PREFIX}${clean}@${domain}`;
  if (!isTestEmail(email)) throw new Error(`generated email is not in the test namespace: ${email}`);
  return email;
}

/**
 * Refuse to operate on anything outside the synthetic namespace.
 *
 * This is the boundary between "creating a test user" and "modifying a paying
 * customer's account". It is deliberately a throw, not a boolean: a caller that
 * forgets to check gets an exception, not a silent production write.
 */
export function assertTestIdentity({ email, uid }, operation = 'operation') {
  if (!isTestEmail(email)) {
    const e = new Error(
      `refusing ${operation}: "${email}" is not in the ${TEST_EMAIL_PREFIX} namespace. ` +
      'This project holds production customers.'
    );
    e.code = 'OUTSIDE_TEST_NAMESPACE';
    throw e;
  }
  if (uid !== undefined && (typeof uid !== 'string' || uid.length === 0 || uid.length > 128)) {
    const e = new Error(`refusing ${operation}: uid "${uid}" is not a valid Firebase uid`);
    e.code = 'INVALID_UID';
    throw e;
  }
  return true;
}

/**
 * Given what a lookup found in Firebase, decide whether creating this identity
 * is safe. Any pre-existing record is treated as production until proven
 * otherwise — the caller must never "adopt" an account it did not create.
 */
export function assertSafeToCreate({ email, uid }, existing) {
  assertTestIdentity({ email, uid }, 'create');

  if (existing?.byEmail) {
    const e = new Error(
      `refusing create: email ${email} already exists (uid ${existing.byEmail.uid}). ` +
      'Pick a fresh label rather than reusing or modifying an existing account.'
    );
    e.code = 'EMAIL_ALREADY_EXISTS';
    throw e;
  }
  if (existing?.byUid) {
    const e = new Error(
      `refusing create: uid ${uid} already exists. Generate a new uid; never overwrite.`
    );
    e.code = 'UID_ALREADY_EXISTS';
    throw e;
  }
  return true;
}

// ---------------------------------------------------------------- manifest

/**
 * Cleanup manifest. Records every synthetic identity created so nothing is
 * orphaned in a production project, and so deletion is a reviewed list rather
 * than a wildcard query.
 *
 * Deletion is never automatic — the manifest is produced, a human approves it.
 */
export function buildCleanupManifest(created, { projectId, note = null } = {}) {
  for (const c of created) assertTestIdentity(c, 'manifest entry');

  return {
    generatedAt: new Date().toISOString(),
    projectId,
    isProductionProject: PRODUCTION_PROJECT_IDS.has(projectId),
    note,
    deletionApproved: false,          // must be flipped by a human, never by tooling
    count: created.length,
    identities: created.map((c) => ({
      uid: c.uid,
      email: c.email,
      createdAt: c.createdAt ?? null,
      purpose: c.purpose ?? 'bcrypt round-trip validation',
    })),
    deletionCommand:
      'node migration/tools/cleanup-test-identities.mjs --manifest <this file> --i-understand',
  };
}
