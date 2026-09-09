/**
 * Migration ledger.
 *
 * One record per source row: where it came from, where it went, what it hashed
 * to on each side, and what state it reached. This is what makes a failed run
 * safe to resume — a rerun reads the ledger, skips what is already VERIFIED,
 * and converges instead of writing duplicates.
 *
 * The ledger is kept LOCAL, not in Firestore. Control data does not belong in
 * the same store as the customer data it is describing, and a local file stays
 * readable when the target is exactly what you are debugging.
 *
 * It never stores values. Hashes, ids and states only — no bcrypt hashes, no
 * passport data, no ciphertext, no field payloads.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LEDGER_STATES = Object.freeze({
  PENDING: 'PENDING',
  COPIED: 'COPIED',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  SKIPPED_WITH_REASON: 'SKIPPED_WITH_REASON',
});

/** Fields that must never appear in a ledger entry, checked on every write. */
const FORBIDDEN_KEYS = /password|secret|token|passport|cipher|encrypted|payload|value/i;

export class MigrationLedger {
  constructor(path, { transformVersion }) {
    this.path = path;
    this.transformVersion = transformVersion;
    this.entries = new Map();
    if (existsSync(path)) {
      const loaded = JSON.parse(readFileSync(path, 'utf8'));
      // A ledger written by a different transform version describes documents
      // this code would no longer produce. Reusing it would let stale output
      // pass as verified, so it is discarded rather than silently trusted.
      if (loaded.transformVersion === transformVersion) {
        for (const entry of loaded.entries) this.entries.set(entry.key, entry);
        this.carriedOver = this.entries.size;
      } else {
        this.discardedForVersion = loaded.transformVersion;
        this.carriedOver = 0;
      }
    } else {
      this.carriedOver = 0;
    }
  }

  static key(sourceTable, sourcePk) {
    // Each component is escaped before joining. A plain join collides:
    // ["a|b", "c"] and ["a", "b|c"] would produce the same key, and two
    // distinct composite primary keys sharing a ledger entry means one of
    // them looks migrated when it never was.
    const encoded = sourcePk.map((part) => String(part).replace(/[\\|]/g, (c) => `\\${c}`));
    return `${sourceTable}#${encoded.join('|')}`;
  }

  get(sourceTable, sourcePk) {
    return this.entries.get(MigrationLedger.key(sourceTable, sourcePk));
  }

  /** True when this row is already done and does not need rewriting. */
  isVerified(sourceTable, sourcePk) {
    return this.get(sourceTable, sourcePk)?.state === LEDGER_STATES.VERIFIED;
  }

  record(input) {
    const { sourceTable, sourcePk, targetPath, sourceHash, targetHash, state, error } = input;
    // Reject a forbidden field on the INPUT rather than dropping it silently.
    // A caller that passes `passwordHash` believes it is being stored; failing
    // loudly is the only way they find out it is not.
    for (const key of Object.keys(input)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`LEDGER_FORBIDDEN_FIELD: ${key}`);
    }
    if (!Object.values(LEDGER_STATES).includes(state)) {
      throw new Error(`UNKNOWN_LEDGER_STATE: ${state}`);
    }
    if (state === LEDGER_STATES.SKIPPED_WITH_REASON && !error) {
      throw new Error('SKIPPED_REQUIRES_REASON');
    }
    const entry = {
      key: MigrationLedger.key(sourceTable, sourcePk),
      sourceTable,
      sourcePk,
      targetPath,
      transformVersion: this.transformVersion,
      sourceHash: sourceHash ?? null,
      targetHash: targetHash ?? null,
      state,
      error: error ?? null,
      migratedAt: new Date().toISOString(),
    };
    for (const key of Object.keys(entry)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`LEDGER_FORBIDDEN_FIELD: ${key}`);
    }
    if (entry.error && FORBIDDEN_KEYS.test(String(entry.error))) {
      entry.error = 'REDACTED_ERROR_TEXT';
    }
    this.entries.set(entry.key, entry);
    return entry;
  }

  summary() {
    const byState = {};
    for (const state of Object.values(LEDGER_STATES)) byState[state] = 0;
    const byTable = {};
    for (const entry of this.entries.values()) {
      byState[entry.state] += 1;
      byTable[entry.sourceTable] ??= { total: 0, verified: 0, failed: 0, skipped: 0 };
      byTable[entry.sourceTable].total += 1;
      if (entry.state === LEDGER_STATES.VERIFIED) byTable[entry.sourceTable].verified += 1;
      if (entry.state === LEDGER_STATES.FAILED) byTable[entry.sourceTable].failed += 1;
      if (entry.state === LEDGER_STATES.SKIPPED_WITH_REASON) byTable[entry.sourceTable].skipped += 1;
    }
    return { total: this.entries.size, byState, byTable, carriedOver: this.carriedOver };
  }

  /** Every target path the ledger claims to have written, for level-2 coverage. */
  targetPaths() {
    return new Set([...this.entries.values()]
      .filter((e) => e.state === LEDGER_STATES.COPIED || e.state === LEDGER_STATES.VERIFIED)
      .map((e) => e.targetPath));
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({
      transformVersion: this.transformVersion,
      savedAt: new Date().toISOString(),
      entries: [...this.entries.values()],
    }, null, 2) + '\n');
  }
}
