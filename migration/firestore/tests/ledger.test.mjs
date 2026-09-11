#!/usr/bin/env node
/**
 * Migration ledger controls.
 *
 * The ledger is what makes a failed run safe to resume. The properties that
 * matter: a rerun converges rather than duplicating, a stale transform version
 * cannot be mistaken for verified work, and no value ever lands in it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MigrationLedger, LEDGER_STATES } from '../lib/ledger.mjs';

const scratch = () => join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.json');

test('states are the declared set and nothing else', () => {
  assert.deepEqual(Object.keys(LEDGER_STATES).sort(),
    ['COPIED', 'FAILED', 'PENDING', 'SKIPPED_WITH_REASON', 'VERIFIED']);
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  assert.throws(() => ledger.record({ sourceTable: 't', sourcePk: ['1'],
    targetPath: 'x/1', state: 'DONE' }), /UNKNOWN_LEDGER_STATE/);
});

test('a skip must carry its reason', () => {
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  // A skip with no reason is indistinguishable from a row that was forgotten.
  assert.throws(() => ledger.record({ sourceTable: 't', sourcePk: ['1'],
    targetPath: 'x/1', state: LEDGER_STATES.SKIPPED_WITH_REASON }), /SKIPPED_REQUIRES_REASON/);
  assert.doesNotThrow(() => ledger.record({ sourceTable: 't', sourcePk: ['1'],
    targetPath: 'x/1', state: LEDGER_STATES.SKIPPED_WITH_REASON, error: 'no business' }));
});

test('a composite primary key is one key, not two', () => {
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  ledger.record({ sourceTable: 'trip_write_requests', sourcePk: ['u1', 'r1'],
    targetPath: 'idempotency/u1__r1', state: LEDGER_STATES.VERIFIED });
  assert.equal(ledger.isVerified('trip_write_requests', ['u1', 'r1']), true);
  assert.equal(ledger.isVerified('trip_write_requests', ['u1', 'r2']), false);
  assert.equal(ledger.isVerified('trip_write_requests', ['u1']), false);
  // Two different composite keys must not collapse into one entry.
  ledger.record({ sourceTable: 't', sourcePk: ['a|b', 'c'], targetPath: 'x/1',
    state: LEDGER_STATES.VERIFIED });
  ledger.record({ sourceTable: 't', sourcePk: ['a', 'b|c'], targetPath: 'x/2',
    state: LEDGER_STATES.VERIFIED });
  assert.equal(ledger.summary().total, 3);
});

test('a rerun converges instead of duplicating', () => {
  const path = scratch();
  const first = new MigrationLedger(path, { transformVersion: 1 });
  for (let i = 0; i < 5; i += 1) {
    first.record({ sourceTable: 'trips', sourcePk: [`id-${i}`], targetPath: `trips/id-${i}`,
      state: LEDGER_STATES.VERIFIED });
  }
  first.save();

  const resumed = new MigrationLedger(path, { transformVersion: 1 });
  assert.equal(resumed.carriedOver, 5);
  assert.equal(resumed.isVerified('trips', ['id-3']), true);
  // Recording the same row again updates it rather than adding a second entry.
  resumed.record({ sourceTable: 'trips', sourcePk: ['id-3'], targetPath: 'trips/id-3',
    state: LEDGER_STATES.VERIFIED });
  assert.equal(resumed.summary().total, 5);
  assert.equal(resumed.get('trips', ['id-3']).attemptCount, 1,
    're-verifying a completed row does not count as another copy attempt');
});

test('attempt counts and timestamps survive a failed retry', () => {
  const path = scratch();
  const ledger = new MigrationLedger(path, { transformVersion: '1.full.1' });
  ledger.record({ sourceTable: 'trips', sourcePk: ['x'], targetPath: 'trips/x',
    state: LEDGER_STATES.PENDING });
  ledger.record({ sourceTable: 'trips', sourcePk: ['x'], targetPath: 'trips/x',
    state: LEDGER_STATES.FAILED, error: 'temporary failure' });
  const verified = ledger.record({ sourceTable: 'trips', sourcePk: ['x'], targetPath: 'trips/x',
    state: LEDGER_STATES.VERIFIED });
  assert.equal(verified.attemptCount, 2);
  assert.ok(verified.firstAttemptAt);
  assert.ok(verified.lastAttemptAt);
  assert.ok(verified.verifiedAt);
});

test('a ledger from a different transform version is discarded, not trusted', () => {
  const path = scratch();
  const old = new MigrationLedger(path, { transformVersion: 1 });
  old.record({ sourceTable: 'trips', sourcePk: ['x'], targetPath: 'trips/x',
    state: LEDGER_STATES.VERIFIED });
  old.save();

  // Transform 2 would produce different documents. Treating transform 1's
  // "VERIFIED" as still meaning verified would let stale output pass.
  const next = new MigrationLedger(path, { transformVersion: 2 });
  assert.equal(next.carriedOver, 0);
  assert.equal(next.discardedForVersion, 1);
  assert.equal(next.isVerified('trips', ['x']), false);
});

test('the ledger never holds a value', () => {
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  // Field names that would carry data are rejected outright.
  assert.throws(() => ledger.record({ sourceTable: 't', sourcePk: ['1'], targetPath: 'x/1',
    state: LEDGER_STATES.COPIED, passwordHash: 'x' }), /LEDGER_FORBIDDEN_FIELD/);
  // And an error message that mentions one is redacted rather than stored.
  const entry = ledger.record({ sourceTable: 't', sourcePk: ['1'], targetPath: 'x/1',
    state: LEDGER_STATES.FAILED, error: 'bad passport number 123456789' });
  assert.equal(entry.error, 'REDACTED_ERROR_TEXT');
});

test('what was written is recoverable for target coverage', () => {
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  ledger.record({ sourceTable: 'trips', sourcePk: ['a'], targetPath: 'trips/a',
    state: LEDGER_STATES.VERIFIED });
  ledger.record({ sourceTable: 'trips', sourcePk: ['b'], targetPath: 'trips/b',
    state: LEDGER_STATES.COPIED });
  ledger.record({ sourceTable: 'trips', sourcePk: ['c'], targetPath: 'trips/c',
    state: LEDGER_STATES.FAILED, error: 'x' });
  const paths = ledger.targetPaths();
  assert.equal(paths.has('trips/a'), true);
  assert.equal(paths.has('trips/b'), true);
  assert.equal(paths.has('trips/c'), false, 'a failed row wrote nothing to account for');
});

test('the summary separates outcomes per table', () => {
  const ledger = new MigrationLedger(scratch(), { transformVersion: 1 });
  ledger.record({ sourceTable: 'trips', sourcePk: ['a'], targetPath: 'trips/a',
    state: LEDGER_STATES.VERIFIED });
  ledger.record({ sourceTable: 'trips', sourcePk: ['b'], targetPath: 'trips/b',
    state: LEDGER_STATES.FAILED, error: 'x' });
  ledger.record({ sourceTable: 'users', sourcePk: ['u'], targetPath: 'users/u',
    state: LEDGER_STATES.SKIPPED_WITH_REASON, error: 'no owner' });
  const summary = ledger.summary();
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.byTable.trips, { total: 2, verified: 1, failed: 1, skipped: 0 });
  assert.deepEqual(summary.byTable.users, { total: 1, verified: 0, failed: 0, skipped: 1 });
  assert.equal(summary.byState.VERIFIED, 1);
});

test('a corrupt ledger file is a hard failure, not an empty ledger', () => {
  const path = scratch();
  writeFileSync(path, '{not json');
  // Silently starting from empty would make a resumed run rewrite everything
  // while reporting it as fresh work.
  assert.throws(() => new MigrationLedger(path, { transformVersion: 1 }));
});

test('saving is round-trippable', () => {
  const path = scratch();
  const ledger = new MigrationLedger(path, { transformVersion: 1 });
  ledger.record({ sourceTable: 'trips', sourcePk: ['a'], targetPath: 'trips/a',
    sourceHash: 'a'.repeat(64), targetHash: 'a'.repeat(64), state: LEDGER_STATES.VERIFIED });
  ledger.save();
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(saved.transformVersion, 1);
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].sourceHash, 'a'.repeat(64));
  rmSync(path, { force: true });
});
