/**
 * Local durable journal for the Firestore production bulk copy.
 *
 * The journal is what makes a partial failure recoverable: it records the exact paths this run
 * committed, so rollback can delete precisely those and nothing else. It is written to the local
 * filesystem rather than into production, because a journal stored as customer documents would be
 * both a write the plan never authorized and evidence that disappears with the thing it describes.
 *
 * It carries no secrets: no tokens, no credentials, no customer field values. Only paths,
 * fingerprints, counts and the identity of the authorization it was issued under.
 *
 * Integrity is self-checked. Every write recomputes a hash over the journal body, and any reader —
 * rollback in particular — recomputes it before acting. A hand-edited journal fails closed.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256 } from './production-guard.mjs';

export const JOURNAL_STATUS = Object.freeze({
  PREPARED: 'PREPARED',
  WRITING: 'WRITING',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  COPY_COMPLETE: 'COPY_COMPLETE',
  RECONCILIATION_FAILED: 'RECONCILIATION_FAILED',
  RECONCILED: 'RECONCILED',
});

/** Journal body without its own hash, key-sorted, for hashing. */
function canonicalBody(journal) {
  const body = { ...journal };
  delete body.integrityHash;
  return JSON.stringify(body, Object.keys(body).sort());
}
export function journalIntegrityHash(journal) {
  return sha256(canonicalBody(journal));
}

export class ProductionJournal {
  constructor(path, body) {
    this.path = path;
    this.body = body;
  }

  /** Create the journal BEFORE the first commit. Refuses to overwrite an existing run. */
  static create(path, {
    migrationRunId, goManifestIntegrityHash, approvedPreparationCommit, sourceSnapshot,
    firebaseProject, firestoreDatabaseId, plannedDocumentCount, planHash, batchLayout,
  }) {
    if (existsSync(path)) throw new Error('JOURNAL_ALREADY_EXISTS');
    for (const [name, value] of Object.entries({ migrationRunId, goManifestIntegrityHash,
      approvedPreparationCommit, firebaseProject, firestoreDatabaseId, planHash })) {
      if (!value) throw new Error(`JOURNAL_FIELD_REQUIRED:${name}`);
    }
    const body = {
      migrationRunId,
      stage: 'firestore-bulk-copy',
      goManifestIntegrityHash,
      approvedPreparationCommit,
      sourceSnapshot,
      firebaseProject,
      firestoreDatabaseId,
      plannedDocumentCount,
      planHash,
      batchLayout,
      completedBatches: [],
      writtenPaths: [],
      failure: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: JOURNAL_STATUS.PREPARED,
    };
    const journal = new ProductionJournal(path, body);
    journal.#persist();
    return journal;
  }

  static load(path) {
    if (!existsSync(path)) throw new Error('JOURNAL_NOT_FOUND');
    const body = JSON.parse(readFileSync(path, 'utf8'));
    const recomputed = journalIntegrityHash(body);
    if (body.integrityHash !== recomputed) throw new Error('JOURNAL_INTEGRITY_HASH_MISMATCH');
    return new ProductionJournal(path, body);
  }

  /** Atomic-ish: write a sibling then rename, so a crash cannot leave a half-written journal. */
  #persist() {
    this.body.updatedAt = new Date().toISOString();
    delete this.body.integrityHash;
    this.body.integrityHash = journalIntegrityHash(this.body);
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.writing`;
    writeFileSync(temporary, `${JSON.stringify(this.body, null, 2)}\n`);
    renameSync(temporary, this.path);
  }

  get status() { return this.body.status; }
  get writtenPaths() { return [...this.body.writtenPaths]; }
  confirmedSet() { return new Set(this.body.writtenPaths); }

  beginWriting() {
    this.body.status = JOURNAL_STATUS.WRITING;
    this.#persist();
  }

  /** Recorded only after the commit returned successfully. */
  recordBatch(index, paths) {
    this.body.completedBatches.push({ index, documents: paths.length, at: new Date().toISOString() });
    this.body.writtenPaths.push(...paths);
    this.#persist();
  }

  recordFailure({ batchIndex, path, code, message }) {
    this.body.failure = { batchIndex: batchIndex ?? null, path: path ?? null,
      code: code ?? null, message: message ? String(message).slice(0, 400) : null,
      at: new Date().toISOString() };
    this.body.status = JOURNAL_STATUS.PARTIAL_FAILURE;
    this.#persist();
  }

  markCopyComplete() {
    if (this.body.writtenPaths.length !== this.body.plannedDocumentCount) {
      throw new Error('JOURNAL_WRITTEN_COUNT_MISMATCH');
    }
    // Deliberately NOT a GO: reconciliation is the next required stage.
    this.body.status = JOURNAL_STATUS.COPY_COMPLETE;
    this.#persist();
  }

  markReconciled(passed) {
    this.body.status = passed ? JOURNAL_STATUS.RECONCILED : JOURNAL_STATUS.RECONCILIATION_FAILED;
    this.#persist();
  }
}

/**
 * BULK_COPY_GO is never implied by a successful copy.
 *
 * COPY_COMPLETE means the writes returned success. It says nothing about whether the target actually
 * matches the source, which is what reconciliation establishes, so only RECONCILED yields GO.
 */
export function bulkCopyGate(journal) {
  const status = journal?.status ?? journal?.body?.status ?? null;
  if (status === JOURNAL_STATUS.RECONCILED) {
    return { bulkCopyGo: 'GO', nextStage: 'auth-import (separately operator-authorized)', status };
  }
  if (status === JOURNAL_STATUS.COPY_COMPLETE) {
    return { bulkCopyGo: 'NO_GO', nextStage: 'full reconciliation is required before BULK_COPY_GO', status };
  }
  return { bulkCopyGo: 'NO_GO', nextStage: 'copy not complete', status };
}
