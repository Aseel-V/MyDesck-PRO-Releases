/**
 * The narrow delete boundary for historical client-smoke residue.
 *
 * The authorized production target cannot be used for this and should not be made to: its allowlist
 * is the 1,477-document migration plan, and these documents are by definition outside it. Widening
 * that allowlist to reach them would turn the migration's write boundary into a general delete tool,
 * which is the opposite of what it is for.
 *
 * So residue deletion gets a boundary of its own, built to the same shape. The Firestore instance is
 * closed over and never returned. There is no `db`, no `collection`, no query, no batch, no prefix
 * delete and no way to name a path that is not already in the sealed manifest. Every delete is one
 * document at one exact path, and the path must survive four independent checks first:
 *
 *   allowlist   present in the sealed cleanup manifest
 *   exclusion   absent from the migration plan AND absent from the copy journal
 *   integrity   re-read immediately before the delete, hash equal to the manifest's pre-delete hash
 *   identity    right project, right database
 *
 * The pre-delete re-read is the important one. A manifest is a statement about the past; if the
 * document changed between preparation and execution, the thing being deleted is not the thing that
 * was examined, and the only safe response is to stop.
 */
import { MIGRATION_WRITE_IDENTITY, openMigrationFirestore } from './migration-identity.mjs';
import { rawDocumentHash } from './full-rehearsal-core.mjs';
import { sha256 } from './production-guard.mjs';

export const CLEANUP_REASON = 'HISTORICAL_CLIENT_SMOKE_RESIDUE';
/**
 * Withdrawing a document the migration itself wrote is a different act from deleting residue it
 * never wrote, so it gets its own reason rather than being disguised as the first one. The boundary
 * treats them identically — same allowlist, same exclusion set, same pre-delete hash check — but the
 * manifest has to say which it is, and a caller has to name the reason it will accept.
 */
export const WITHDRAWAL_REASON = 'OPERATOR_EXCLUDED_AUTH_IDENTITY_DERIVED_DOCUMENT';
export const KNOWN_REASONS = Object.freeze([CLEANUP_REASON, WITHDRAWAL_REASON]);
export const CLEANUP_STATUS = Object.freeze({
  PREPARED: 'PREPARED',
  DELETING: 'DELETING',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  COMPLETE: 'COMPLETE',
});

export class ResidueCleanupError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ResidueCleanupError';
    this.code = code;
  }
}

/** Canonical manifest body for hashing: every field except the hash itself, key-sorted. */
export function canonicalManifestBody(manifest) {
  const body = { ...manifest };
  delete body.integrityHash;
  return JSON.stringify(body, Object.keys(body).sort());
}
export function manifestIntegrityHash(manifest) {
  return sha256(canonicalManifestBody(manifest));
}

/** A document path is an even, non-empty sequence of segments. No wildcards, no prefixes. */
export function validateCleanupPath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new ResidueCleanupError('CLEANUP_PATH_EMPTY');
  if (path.includes('*') || path.includes('?')) throw new ResidueCleanupError('CLEANUP_PATH_WILDCARD', path);
  if (path.startsWith('/') || path.endsWith('/')) throw new ResidueCleanupError('CLEANUP_PATH_MALFORMED', path);
  if (path.includes('//') || path.includes('..')) throw new ResidueCleanupError('CLEANUP_PATH_MALFORMED', path);
  const segments = path.split('/');
  if (segments.length % 2 !== 0) throw new ResidueCleanupError('CLEANUP_PATH_ODD_SEGMENTS', path);
  if (segments.some((segment) => segment.length === 0)) {
    throw new ResidueCleanupError('CLEANUP_PATH_EMPTY_SEGMENT', path);
  }
  return segments;
}

/** Freeze the manifest and derive its allowlist. Verifies the integrity hash on the way through. */
export function sealCleanupManifest(manifest, { expectedCount, allowedReasons = [CLEANUP_REASON] } = {}) {
  if (!manifest || typeof manifest !== 'object') throw new ResidueCleanupError('MANIFEST_MALFORMED');
  if (!allowedReasons.includes(manifest.reason)) {
    throw new ResidueCleanupError('MANIFEST_REASON_UNEXPECTED', manifest.reason);
  }
  if (manifest.integrityHash !== manifestIntegrityHash(manifest)) {
    throw new ResidueCleanupError('MANIFEST_INTEGRITY_HASH_MISMATCH');
  }
  if (!Array.isArray(manifest.documents)) throw new ResidueCleanupError('MANIFEST_DOCUMENTS_MISSING');
  if (manifest.documents.length !== manifest.expectedCount) {
    throw new ResidueCleanupError('MANIFEST_COUNT_MISMATCH',
      `${manifest.documents.length} != ${manifest.expectedCount}`);
  }
  if (expectedCount !== undefined && manifest.expectedCount !== expectedCount) {
    throw new ResidueCleanupError('MANIFEST_COUNT_NOT_AS_EXPECTED',
      `${manifest.expectedCount} != ${expectedCount}`);
  }
  const allowlist = new Set();
  for (const document of manifest.documents) {
    if (!document || typeof document !== 'object') throw new ResidueCleanupError('MANIFEST_ENTRY_MALFORMED');
    if (typeof document.preDeleteHash !== 'string' || !document.preDeleteHash) {
      throw new ResidueCleanupError('MANIFEST_ENTRY_HASH_ABSENT', document.path);
    }
    validateCleanupPath(document.path);
    if (allowlist.has(document.path)) throw new ResidueCleanupError('MANIFEST_DUPLICATE_PATH', document.path);
    allowlist.add(document.path);
    Object.freeze(document);
  }
  Object.freeze(manifest.documents);
  return { manifest: Object.freeze(manifest), allowlist: Object.freeze(allowlist) };
}

/**
 * Open the cleanup target.
 *
 * `forbiddenPaths` is the union of the migration plan and the copy journal. It is required, not
 * optional: the whole safety argument rests on proving these documents are not migration output,
 * and a boundary that would accept an empty exclusion set could not make that claim.
 */
export async function openResidueCleanupTarget({
  manifest, projectId, databaseId, forbiddenPaths, expectedCount, firestoreFactory,
  allowedReasons = [CLEANUP_REASON],
}) {
  if (projectId !== 'mydesckpro') throw new ResidueCleanupError('CLEANUP_PROJECT_MISMATCH', String(projectId));
  if (databaseId !== 'default') throw new ResidueCleanupError('CLEANUP_DATABASE_MISMATCH', String(databaseId));
  if (!(forbiddenPaths instanceof Set) || forbiddenPaths.size === 0) {
    throw new ResidueCleanupError('CLEANUP_FORBIDDEN_SET_REQUIRED');
  }

  const sealed = sealCleanupManifest(manifest, { expectedCount, allowedReasons });
  const overlap = [...sealed.allowlist].filter((path) => forbiddenPaths.has(path));
  if (overlap.length) throw new ResidueCleanupError('CLEANUP_OVERLAPS_MIGRATION', overlap.slice(0, 3).join(','));

  const connect = firestoreFactory ?? (async () => {
    try {
      return await openMigrationFirestore({ projectId, databaseId });
    } catch (error) {
      throw new ResidueCleanupError(error?.code ?? 'PRODUCTION_CONNECTION_FAILED', MIGRATION_WRITE_IDENTITY);
    }
  });
  const connection = await connect({ projectId, databaseId });
  const db = connection.db;

  const byPath = new Map(sealed.manifest.documents.map((document) => [document.path, document]));
  let deleted = 0;
  const deletedPaths = [];

  /** Every guard, in order, with nothing deleted until all of them have passed. */
  const requireDeletable = async (path) => {
    if (!sealed.allowlist.has(path)) throw new ResidueCleanupError('PATH_OUTSIDE_CLEANUP_MANIFEST', path);
    if (forbiddenPaths.has(path)) throw new ResidueCleanupError('PATH_BELONGS_TO_MIGRATION', path);
    if (deletedPaths.includes(path)) throw new ResidueCleanupError('PATH_ALREADY_DELETED', path);
    const expected = byPath.get(path);
    const snapshot = await db.doc(path).get();
    if (!snapshot.exists) throw new ResidueCleanupError('DOCUMENT_ABSENT_AT_DELETE_TIME', path);
    const data = snapshot.data();
    const observed = rawDocumentHash(path, data);
    if (observed !== expected.preDeleteHash) {
      throw new ResidueCleanupError('DOCUMENT_CHANGED_SINCE_MANIFEST', path);
    }
    return { expected, observed, data };
  };

  return Object.freeze({
    projectId,
    databaseId,
    identity: MIGRATION_WRITE_IDENTITY,
    manifestDocuments: sealed.manifest.documents.length,
    cleanupRunId: sealed.manifest.cleanupRunId,
    get deletedCount() { return deleted; },
    deletedPaths: () => [...deletedPaths],

    /** Read-only: run every delete guard and report, without deleting. */
    async verifyManifestDocument(path) {
      const { observed } = await requireDeletable(path);
      return { path, present: true, hashMatches: true, hash: observed };
    },

    /** Delete exactly one manifest document, by exact path, after every guard has passed. */
    async deleteManifestDocument(path) {
      await requireDeletable(path);
      await db.doc(path).delete();
      deletedPaths.push(path);
      deleted += 1;
      return { path, deleted: true };
    },

    /** Read-only: confirm a path is gone. Refuses any path outside the manifest. */
    async confirmAbsent(path) {
      if (!sealed.allowlist.has(path)) throw new ResidueCleanupError('PATH_OUTSIDE_CLEANUP_MANIFEST', path);
      const snapshot = await db.doc(path).get();
      return { path, absent: !snapshot.exists };
    },

    async close() { if (connection.close) await connection.close(); },
  });
}
