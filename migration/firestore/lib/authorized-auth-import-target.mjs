/**
 * The single mutation boundary for the Firebase Auth import.
 *
 * Built to the same shape as the Firestore write boundary, for the same reason: the thing that can
 * create production identities should be able to create exactly the identities that were authorized
 * and nothing else. There is no `createUser`, no way to name a uid that is not in the sealed plan,
 * and no delete — undoing an import is a separate decision with a separate command.
 *
 * It runs as the OPERATOR identity, not the migration service account, and that is deliberate. The
 * migration identity holds a least-privilege Firestore role; Identity Toolkit administration was
 * never granted to it, and granting it would widen a role that exists specifically to be narrow.
 * Every other Auth-touching tool in this repository uses the operator token for the same reason.
 *
 * UID preservation is structural rather than hoped for. Identity Toolkit assigns a uid when none is
 * supplied, so every record here carries an explicit `localId` taken from the source, the shape is
 * checked before the call, and the uid set is compared again afterwards. There is no remapping
 * table anywhere in this path, because there is nothing to remap: the Supabase uuid IS the Firebase
 * uid.
 *
 * Password material passes through and is never retained. The bcrypt hash is read from the source,
 * handed to the import call, and dropped; it is not logged, not written to a report, and not kept
 * on the returned object.
 */
import { assertCapability } from './production-execution-authorization.mjs';

export const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
/** Identity Toolkit's limit on accounts in one batchCreate call. */
export const BATCH_CREATE_LIMIT = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AuthImportError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AuthImportError';
    this.code = code;
  }
}

/** base64url, which is what Identity Toolkit expects for `passwordHash`. */
export function base64url(value) {
  return Buffer.from(value, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Seal the import plan and derive the uid allowlist.
 *
 * Every record must carry a uuid-shaped uid. That check is not cosmetic: the whole migration rests
 * on Supabase's `auth.users.id` becoming the Firebase uid verbatim, so a uid that is not shaped like
 * a Supabase uuid is evidence that something other than the source supplied it.
 */
export function sealAuthImportPlan(records, { expectedCount } = {}) {
  if (!Array.isArray(records)) throw new AuthImportError('IMPORT_PLAN_NOT_AN_ARRAY');
  if (expectedCount !== undefined && records.length !== expectedCount) {
    throw new AuthImportError('IMPORT_PLAN_COUNT_MISMATCH', `${records.length} != ${expectedCount}`);
  }
  if (records.length === 0) throw new AuthImportError('IMPORT_PLAN_EMPTY');
  if (records.length > BATCH_CREATE_LIMIT) {
    throw new AuthImportError('IMPORT_PLAN_EXCEEDS_BATCH_LIMIT', String(records.length));
  }
  const allowlist = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object') throw new AuthImportError('IMPORT_RECORD_MALFORMED');
    if (typeof record.uid !== 'string' || !UUID.test(record.uid)) {
      throw new AuthImportError('IMPORT_UID_NOT_SOURCE_UUID_SHAPED');
    }
    if (allowlist.has(record.uid)) throw new AuthImportError('IMPORT_DUPLICATE_UID');
    if (typeof record.passwordHash !== 'string' || !record.passwordHash) {
      throw new AuthImportError('IMPORT_RECORD_PASSWORD_HASH_ABSENT');
    }
    allowlist.add(record.uid);
    Object.freeze(record);
  }
  Object.freeze(records);
  return { records, allowlist: Object.freeze(allowlist) };
}

/**
 * Open the authorized Auth import target.
 *
 * `tokenFactory` and `fetchImpl` exist for tests, so the whole guard chain runs without touching a
 * real project.
 */
export async function openAuthorizedAuthImportTarget({
  capability, importPlan, projectId, databaseId, sourceProject, stage, expectedCount,
  tokenFactory, fetchImpl,
}) {
  // 1. Capability first. Bound to the auth-import stage, so a Firestore manifest cannot reach here.
  assertCapability(capability, { projectId, databaseId, sourceProject, stage });
  if (projectId !== 'mydesckpro') throw new AuthImportError('AUTH_PROJECT_MISMATCH', String(projectId));

  // 2. Seal the plan before any token exists.
  const sealed = sealAuthImportPlan(importPlan, { expectedCount });

  const request = fetchImpl ?? globalThis.fetch;
  const token = await (tokenFactory ?? (() => {
    throw new AuthImportError('OPERATOR_TOKEN_FACTORY_REQUIRED');
  }))();
  if (!token) throw new AuthImportError('OPERATOR_TOKEN_UNAVAILABLE');

  const call = async (method, body) => {
    const response = await request(`${IDENTITY_TOOLKIT}/projects/${projectId}/accounts:${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId,
        'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AuthImportError('IDENTITY_TOOLKIT_CALL_FAILED',
        `${method} http ${response.status} ${parsed?.error?.message ?? ''}`.trim());
    }
    return parsed;
  };

  let imported = 0;

  return Object.freeze({
    projectId,
    plannedUsers: sealed.records.length,
    get importedCount() { return imported; },

    /** Zero existing accounts. Read-only. */
    async assertAuthEmpty() {
      const body = await call('query', { returnUserInfo: false });
      const existing = Number(body.recordsCount ?? 0);
      if (existing !== 0) throw new AuthImportError('AUTH_TENANT_NOT_EMPTY', String(existing));
      return { empty: true, existingAccounts: 0 };
    },

    /**
     * Import exactly the sealed plan, with explicit uids.
     *
     * `sanityCheck` makes Identity Toolkit reject the batch if any account already exists, so a
     * re-run cannot silently overwrite an identity that is already live.
     */
    async importPlannedUsers() {
      const users = sealed.records.map((record) => {
        if (!sealed.allowlist.has(record.uid)) throw new AuthImportError('UID_OUTSIDE_AUTHORIZED_PLAN');
        return {
          localId: record.uid,
          email: record.email,
          emailVerified: Boolean(record.emailVerified),
          disabled: Boolean(record.disabled),
          passwordHash: base64url(record.passwordHash),
        };
      });
      const body = await call('batchCreate', { users, hashAlgorithm: 'BCRYPT', sanityCheck: true });
      const errors = Array.isArray(body.error) ? body.error : [];
      if (errors.length) {
        // Indexes only — the message can quote account detail.
        throw new AuthImportError('BATCH_CREATE_REPORTED_ERRORS',
          errors.map((item) => `index:${item.index}`).join(','));
      }
      imported = users.length;
      return { imported, uids: users.map((user) => user.localId) };
    },

    /**
     * Read back every account and compare it against the plan.
     *
     * Returns uids, which are document ids elsewhere in this migration and already appear in the
     * copy journal; it never returns emails or any credential material.
     */
    async verifyImportedUsers() {
      const body = await call('query', { returnUserInfo: true });
      const accounts = body.userInfo ?? [];
      const actual = new Set(accounts.map((account) => account.localId));
      const expected = sealed.allowlist;
      const missing = [...expected].filter((uid) => !actual.has(uid));
      const unexpected = [...actual].filter((uid) => !expected.has(uid));
      const byUid = new Map(accounts.map((account) => [account.localId, account]));
      const attributeMismatches = [];
      for (const record of sealed.records) {
        const account = byUid.get(record.uid);
        if (!account) continue;
        if (Boolean(account.disabled) !== Boolean(record.disabled)) {
          attributeMismatches.push({ uid: record.uid, field: 'disabled' });
        }
        if (Boolean(account.emailVerified) !== Boolean(record.emailVerified)) {
          attributeMismatches.push({ uid: record.uid, field: 'emailVerified' });
        }
      }
      // Every uid must be the source uuid, verbatim. A Firebase-generated uid is 28 characters and
      // would fail this outright, which is the point.
      const nonUuid = [...actual].filter((uid) => !UUID.test(uid));
      return {
        accounts: accounts.length,
        missing, unexpected, attributeMismatches, nonUuidUids: nonUuid,
        uidMismatches: missing.length + unexpected.length + nonUuid.length,
        passwordsPresent: accounts.filter((account) => Boolean(account.passwordHash)).length,
      };
    },

    async close() { /* no persistent connection to release */ },
  });
}
