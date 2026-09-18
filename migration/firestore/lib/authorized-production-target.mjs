/**
 * The single mutation boundary for the Firestore production bulk copy.
 *
 * `openTarget('real')` is deliberately left alone: it keeps forcing the `migration_test_v1_` prefix
 * and stays the right tool for proof and synthetic namespaces. It cannot serve the real migration,
 * because the migration must write customer collections — and the way the rehearsal wrote documents
 * (`db.doc(path).set(...)`) bypassed that prefix guard entirely, so "use the real target" would have
 * meant "use the bypass".
 *
 * This module is the answer: a separate, production-only target that exposes NO general Firestore
 * surface at all. The Firestore instance is closed over and never returned; there is no `db`, no
 * `doc()`, no `collection()`, no arbitrary setter and no arbitrary delete. A caller can do exactly
 * four things: commit a batch drawn from the authorized plan, read back a planned document, assert
 * the target is empty, and delete paths a journal proves this run created.
 *
 * Every write is constrained three ways at once:
 *
 *   capability  an opaque object only the authorization module can mint, re-checked here and bound
 *               to this project, database, source, stage and GO manifest
 *   allowlist   the exact immutable set of planned document paths; anything else aborts
 *   integrity   the document fingerprint is recomputed immediately before the commit and must equal
 *               the one recorded at planning time, so data that changed after authorization aborts
 *
 * The target consumes planned entries, not `(path, data)` pairs, so a caller cannot substitute its
 * own content for a legitimate path.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { assertCapability } from './production-execution-authorization.mjs';
import { rawDocumentHash } from './full-rehearsal-core.mjs';
import { PROOF_PREFIX } from './table-map.mjs';

export const EXPECTED_PLANNED_DOCUMENTS = 1477;
export const DEFAULT_BATCH_SIZE = 100;
/** Firestore's hard limit on writes in one batched commit. */
export const FIRESTORE_BATCH_LIMIT = 500;

/**
 * The identity this target writes as.
 *
 * Not the operator, and not the ambient ADC identity. ADC on this machine impersonates
 * mydesck-migration@, which has no Firestore access, and cannot itself impersonate the writer
 * identity; the operator's own gcloud account is the one holding tokenCreator on it. So the token is
 * minted exactly the way every other tool in this repository mints it — `gcloud auth
 * print-access-token --impersonate-service-account=<writer>` — and handed to the Firestore client.
 *
 * There is deliberately no fallback. If the writer token cannot be minted the target refuses to
 * open, rather than quietly connecting as whatever identity happens to be lying around: a migration
 * that writes as the wrong principal is worse than one that does not start.
 */
export const MIGRATION_WRITE_IDENTITY =
  'mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com';

export class ProductionTargetError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProductionTargetError';
    this.code = code;
    this.retryable = false;
  }
}

/**
 * Transport and service faults worth another attempt. Everything else — permission, validation,
 * identity, plan or integrity failure — is a decision, not a blip, and is never retried.
 */
const RETRYABLE_CODES = new Set([4, 8, 10, 13, 14, 15]);
const RETRYABLE_NAMES = new Set(['DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'ABORTED', 'INTERNAL',
  'UNAVAILABLE', 'DATA_LOSS']);
export function isRetryable(error) {
  if (!error) return false;
  if (error instanceof ProductionTargetError) return false;
  const status = error.code ?? error.status;
  if (typeof status === 'number' && RETRYABLE_CODES.has(status)) return true;
  const name = String(error.code ?? error.status ?? '').toUpperCase();
  return RETRYABLE_NAMES.has(name);
}

/** A Firestore document path is an even, non-empty sequence of collection/document segments. */
export function validatePlannedPath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new ProductionTargetError('PLAN_PATH_EMPTY');
  if (path.startsWith('/') || path.endsWith('/')) throw new ProductionTargetError('PLAN_PATH_MALFORMED', path);
  if (path.includes('//') || path.includes('..')) throw new ProductionTargetError('PLAN_PATH_MALFORMED', path);
  const segments = path.split('/');
  if (segments.length % 2 !== 0) throw new ProductionTargetError('PLAN_PATH_ODD_SEGMENTS', path);
  if (segments.some((segment) => segment.length === 0)) throw new ProductionTargetError('PLAN_PATH_EMPTY_SEGMENT', path);
  // Collection segments are the even indices. None may sit in the proof namespace: this target
  // writes real customer collections, and a proof-prefixed path here would mean the two namespaces
  // had been crossed.
  for (let index = 0; index < segments.length; index += 2) {
    if (segments[index].startsWith(PROOF_PREFIX)) {
      throw new ProductionTargetError('PLAN_PATH_IN_PROOF_NAMESPACE', path);
    }
  }
  return segments;
}

/**
 * Freeze the plan and derive the immutable path allowlist.
 *
 * Returned deep-frozen so nothing downstream can mutate an entry between authorization and commit.
 */
export function sealMutationPlan(plan, { expectedDocuments = EXPECTED_PLANNED_DOCUMENTS } = {}) {
  if (!Array.isArray(plan)) throw new ProductionTargetError('PLAN_NOT_AN_ARRAY');
  if (plan.length !== expectedDocuments) {
    throw new ProductionTargetError('PLAN_DOCUMENT_COUNT_MISMATCH', `${plan.length} != ${expectedDocuments}`);
  }
  const allowlist = new Set();
  const rootCollections = new Set();
  for (const entry of plan) {
    if (!entry || typeof entry !== 'object') throw new ProductionTargetError('PLAN_ENTRY_MALFORMED');
    if (typeof entry.documentFingerprint !== 'string' || !entry.documentFingerprint) {
      throw new ProductionTargetError('PLAN_ENTRY_FINGERPRINT_ABSENT', entry.path);
    }
    if (!entry.data || typeof entry.data !== 'object') {
      throw new ProductionTargetError('PLAN_ENTRY_DATA_ABSENT', entry.path);
    }
    const segments = validatePlannedPath(entry.path);
    if (allowlist.has(entry.path)) throw new ProductionTargetError('PLAN_DUPLICATE_PATH', entry.path);
    allowlist.add(entry.path);
    rootCollections.add(segments[0]);
    Object.freeze(entry.data);
    Object.freeze(entry);
  }
  Object.freeze(plan);
  return { plan, allowlist: Object.freeze(allowlist), rootCollections: Object.freeze(rootCollections) };
}

/** Stable hash of the whole plan, so a journal can prove which plan it belongs to. */
export function planHash(plan, sha256) {
  return sha256(plan.map((entry) => `${entry.path}#${entry.documentFingerprint}`).join('\n'));
}

/**
 * Open the authorized production target.
 *
 * `firestoreFactory` exists for tests: the emulator and an in-memory fake exercise the identical
 * commit path without touching production. It defaults to the real Admin SDK connection.
 */
export async function openAuthorizedProductionTarget({
  capability, mutationPlan, projectId, databaseId, sourceProject, stage, firestoreFactory,
}) {
  // 1. Capability first: nothing else is even attempted without it.
  assertCapability(capability, { projectId, databaseId, sourceProject, stage });

  // 2. Seal the plan and derive the allowlist before any connection exists.
  const sealed = sealMutationPlan(mutationPlan);

  // 3. Connect. The instance stays in this closure and is never exposed.
  const connect = firestoreFactory ?? (async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new ProductionTargetError('EMULATOR_HOST_SET_FOR_PRODUCTION_TARGET');
    }
    const { AuthClient, GoogleAuth } = await import('google-auth-library');
    const { Firestore } = await import('@google-cloud/firestore');

    /** Mints and caches the writer-identity access token. The token is never logged or persisted. */
    class MigrationWriterClient extends AuthClient {
      #token = null;
      #expiresAt = 0;

      async getAccessToken() {
        if (this.#token && Date.now() < this.#expiresAt) return { token: this.#token };
        const sdk = process.env.GCLOUD_SDK_ROOT
          ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
        let minted;
        try {
          minted = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
            [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token',
              `--impersonate-service-account=${MIGRATION_WRITE_IDENTITY}`],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
        } catch {
          // The failure detail can carry account names; the code is enough to act on.
          throw new ProductionTargetError('MIGRATION_WRITE_IDENTITY_TOKEN_UNAVAILABLE',
            MIGRATION_WRITE_IDENTITY);
        }
        if (!minted) {
          throw new ProductionTargetError('MIGRATION_WRITE_IDENTITY_TOKEN_EMPTY',
            MIGRATION_WRITE_IDENTITY);
        }
        this.#token = minted;
        // gcloud mints these for about an hour; refresh well inside that.
        this.#expiresAt = Date.now() + 30 * 60 * 1000;
        return { token: this.#token };
      }

      async getRequestHeaders() {
        const { token } = await this.getAccessToken();
        return new Headers({ authorization: `Bearer ${token}` });
      }

      async request(options) { return this.transporter.request(options); }
    }

    // Proves the identity is actually available before any collection is touched.
    const writer = new MigrationWriterClient();
    await writer.getAccessToken();

    const db = new Firestore({
      projectId,
      databaseId,
      auth: new GoogleAuth({ authClient: writer }),
      ignoreUndefinedProperties: false,
    });
    return { db, close: () => db.terminate(), identity: MIGRATION_WRITE_IDENTITY };
  });
  const connection = await connect({ projectId, databaseId });
  const db = connection.db;

  // 4. The target must satisfy itself about identity rather than trusting the caller's word.
  // The `projectId` getter throws until the client has resolved; the settings it was built
  // with are the authoritative statement of where writes would land either way.
  let actualProject = db._settings?.projectId ?? null;
  if (!actualProject) { try { actualProject = db.projectId; } catch { actualProject = null; } }
  actualProject = actualProject ?? projectId;
  if (actualProject !== 'mydesckpro') {
    throw new ProductionTargetError('TARGET_PROJECT_MISMATCH', String(actualProject));
  }
  if (databaseId !== 'default') {
    throw new ProductionTargetError('TARGET_DATABASE_MISMATCH', String(databaseId));
  }

  let committed = 0;
  const committedPaths = [];

  const requirePlanned = (entry) => {
    if (!entry || typeof entry !== 'object') throw new ProductionTargetError('COMMIT_ENTRY_MALFORMED');
    if (!sealed.allowlist.has(entry.path)) {
      throw new ProductionTargetError('PATH_OUTSIDE_AUTHORIZED_PLAN', entry.path);
    }
    // The entry must be the sealed plan's own object, not a look-alike carrying different data.
    const planned = sealed.plan.find((candidate) => candidate.path === entry.path);
    if (planned !== entry) throw new ProductionTargetError('ENTRY_NOT_FROM_SEALED_PLAN', entry.path);
    // Recompute now: data that changed after planning must abort rather than commit.
    const recomputed = rawDocumentHash(entry.path, entry.data);
    if (recomputed !== entry.documentFingerprint) {
      throw new ProductionTargetError('DOCUMENT_FINGERPRINT_MISMATCH', entry.path);
    }
    return entry;
  };

  return Object.freeze({
    projectId: actualProject,
    databaseId,
    identity: connection.identity ?? null,
    plannedDocuments: sealed.plan.length,
    allowlistSize: sealed.allowlist.size,
    rootCollections: [...sealed.rootCollections].sort(),
    get committedCount() { return committed; },
    committedPaths: () => [...committedPaths],

    /** Zero documents in every collection the plan will write. Read-only. */
    async assertTargetEmpty() {
      const found = [];
      for (const collection of sealed.rootCollections) {
        const snapshot = await db.collection(collection).limit(1).get();
        if (!snapshot.empty) found.push(collection);
      }
      if (found.length) throw new ProductionTargetError('TARGET_NOT_EMPTY', found.join(','));
      return { empty: true, collectionsChecked: [...sealed.rootCollections].sort() };
    },

    /**
     * Commit one batch of sealed plan entries. Explicit document ids only, one write per planned
     * path, never more than Firestore's batch limit.
     */
    async commitPlannedBatch(batch) {
      if (!Array.isArray(batch) || batch.length === 0) throw new ProductionTargetError('BATCH_EMPTY');
      if (batch.length > FIRESTORE_BATCH_LIMIT) {
        throw new ProductionTargetError('BATCH_EXCEEDS_FIRESTORE_LIMIT', String(batch.length));
      }
      const entries = batch.map(requirePlanned);
      const seen = new Set();
      for (const entry of entries) {
        if (seen.has(entry.path)) throw new ProductionTargetError('BATCH_DUPLICATE_PATH', entry.path);
        seen.add(entry.path);
        if (committedPaths.includes(entry.path)) {
          throw new ProductionTargetError('PATH_ALREADY_COMMITTED', entry.path);
        }
      }
      const writer = db.batch();
      for (const entry of entries) writer.set(db.doc(entry.path), entry.data);
      await writer.commit();
      for (const entry of entries) { committedPaths.push(entry.path); committed += 1; }
      return { committed: entries.length, paths: entries.map((entry) => entry.path) };
    },

    /** Read back one planned document. Refuses any path outside the plan. */
    async verifyPlannedDocument(path) {
      if (!sealed.allowlist.has(path)) throw new ProductionTargetError('PATH_OUTSIDE_AUTHORIZED_PLAN', path);
      const snapshot = await db.doc(path).get();
      return { exists: snapshot.exists, data: snapshot.exists ? snapshot.data() : null };
    },

    /**
     * Delete only paths a journal proves this run created. Every path must be in the plan AND in the
     * supplied journal-confirmed set; there is no wildcard, collection or query-based delete here.
     */
    async rollbackJournalPaths(paths, { journalConfirmed }) {
      if (!Array.isArray(paths) || paths.length === 0) throw new ProductionTargetError('ROLLBACK_PATHS_EMPTY');
      if (!(journalConfirmed instanceof Set)) throw new ProductionTargetError('ROLLBACK_JOURNAL_SET_REQUIRED');
      for (const path of paths) {
        if (!sealed.allowlist.has(path)) throw new ProductionTargetError('ROLLBACK_PATH_OUTSIDE_PLAN', path);
        if (!journalConfirmed.has(path)) throw new ProductionTargetError('ROLLBACK_PATH_NOT_IN_JOURNAL', path);
      }
      const deleted = [];
      for (let index = 0; index < paths.length; index += DEFAULT_BATCH_SIZE) {
        const slice = paths.slice(index, index + DEFAULT_BATCH_SIZE);
        const writer = db.batch();
        for (const path of slice) writer.delete(db.doc(path));
        await writer.commit();
        deleted.push(...slice);
      }
      return { deleted: deleted.length, paths: deleted };
    },

    async close() { if (connection.close) await connection.close(); },
  });
}
