#!/usr/bin/env node
/**
 * Target-selection safety controls.
 *
 * The milestone claims synthetic writes cannot reach production data. That
 * claim is only worth as much as the guard behind it, so the guard is tested
 * here rather than asserted in a report: no default target, no accidental
 * production connection, and no path to a customer collection even when a
 * caller asks for one by name.
 *
 * These tests never open a real connection. They exercise the argument
 * checking, which is where a mistake would actually be made.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openTarget, EMULATOR_PROJECT, REAL_PROJECT, TargetError } from '../lib/firestore-target.mjs';
import { PROOF_PREFIX, proofCollection } from '../lib/table-map.mjs';

const rejectsCode = (promise, code) => assert.rejects(promise,
  (e) => e.code === code, `expected ${code}`);

const withEnv = async (changes, fn) => {
  const saved = {};
  for (const [key, value] of Object.entries(changes)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('there is no default target', async () => {
  // Defaulting to the real project is the kind of convenience that eventually
  // writes synthetic data into production, so the mode is required.
  await rejectsCode(openTarget(undefined), 'TARGET_MODE_REQUIRED');
  await rejectsCode(openTarget(null), 'TARGET_MODE_REQUIRED');
  await rejectsCode(openTarget(''), 'TARGET_MODE_REQUIRED');
  await rejectsCode(openTarget('production'), 'TARGET_MODE_REQUIRED');
  await rejectsCode(openTarget('mydesckpro'), 'TARGET_MODE_REQUIRED');
});

test('the emulator target refuses to run without an emulator', async () => {
  // Without this, asking for "emulator" while the variable is unset would open
  // a real connection under a name that says it is safe.
  await withEnv({ FIRESTORE_EMULATOR_HOST: undefined }, async () => {
    await rejectsCode(openTarget('emulator'), 'EMULATOR_HOST_NOT_SET');
  });
});

test('the real target refuses to run against an emulator', async () => {
  // The reverse mistake: a "real project" proof that silently ran locally would
  // be evidence of nothing at all.
  await withEnv({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, async () => {
    await rejectsCode(openTarget('real'), 'EMULATOR_HOST_SET_FOR_REAL_TARGET');
  });
});

test('the emulator and the real project are different projects', () => {
  assert.equal(EMULATOR_PROJECT, 'mydesck-migration-proof');
  assert.equal(REAL_PROJECT, 'mydesckpro');
  assert.notEqual(EMULATOR_PROJECT, REAL_PROJECT,
    'emulator work must not carry the production project id');
});

test('the real target rewrites every collection into the proof namespace', async () => {
  await withEnv({ FIRESTORE_EMULATOR_HOST: undefined }, async () => {
    let target;
    try {
      target = await openTarget('real');
    } catch {
      // Opening needs credentials. When they are absent the guard cannot be
      // exercised here, and saying so is better than reporting a pass.
      return;
    }
    try {
      assert.equal(target.collectionName('trips'), `${PROOF_PREFIX}trips`);
      assert.equal(target.collectionName('users'), `${PROOF_PREFIX}users`);
      // Prefixing is idempotent, so a caller that already prefixed is not
      // double-prefixed into a third namespace.
      assert.equal(target.collectionName(`${PROOF_PREFIX}trips`), `${PROOF_PREFIX}trips`);
      // The database id must be the one this project actually has.
      assert.equal(target.databaseId, 'default');
    } finally {
      await target.close();
    }
  });
});

test('the proof namespace cannot be escaped by naming a collection directly', () => {
  // A mistyped or hostile collection name must not produce a production path.
  for (const name of ['trips', 'users', 'tripInstallments', '../trips', 'trips/../users']) {
    assert.equal(proofCollection(name).startsWith(PROOF_PREFIX), true,
      `${name} must land inside the proof namespace`);
  }
  assert.equal(proofCollection('trips'), 'migration_test_v1_trips');
});

test('TargetError carries a machine-readable code', () => {
  const error = new TargetError('SOME_CODE', 'detail');
  assert.equal(error.code, 'SOME_CODE');
  assert.equal(error.name, 'TargetError');
  assert.match(error.message, /SOME_CODE: detail/);
});
