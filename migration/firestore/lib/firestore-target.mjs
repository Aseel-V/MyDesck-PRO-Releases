/**
 * Firestore connection for migration tooling.
 *
 * There are two possible targets and they are NOT interchangeable:
 *
 *   emulator  a throwaway project. Production collection names are safe here
 *             because no production data exists in it.
 *   real      the production project `mydesckpro`. Only the isolated
 *             migration_test_v1_* namespace may ever be written, and the
 *             prefix is applied HERE, in one place, so a mistyped path in a
 *             caller cannot reach a customer collection.
 *
 * The guard is structural rather than advisory: connecting to the real project
 * returns a collection function that refuses any name without the proof prefix.
 */

import { PROOF_PREFIX, proofCollection } from './table-map.mjs';

export const EMULATOR_PROJECT = 'mydesck-migration-proof';
export const REAL_PROJECT = 'mydesckpro';

export class TargetError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TargetError';
    this.code = code;
  }
}

/**
 * Open a Firestore target.
 *
 * `mode` is explicit and has no default. Defaulting to the real project is the
 * kind of convenience that eventually writes synthetic data into production.
 */
export async function openTarget(mode, { databaseId } = {}) {
  if (mode !== 'emulator' && mode !== 'real') {
    throw new TargetError('TARGET_MODE_REQUIRED', String(mode));
  }
  const app = await import('firebase-admin/app');
  const firestore = await import('firebase-admin/firestore');

  if (mode === 'emulator') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new TargetError('EMULATOR_HOST_NOT_SET',
        'set FIRESTORE_EMULATOR_HOST before using the emulator target');
    }
    const instance = app.initializeApp(
      { projectId: EMULATOR_PROJECT }, `migration-emulator-${process.pid}-${Date.now()}`);
    const db = firestore.getFirestore(instance);
    db.settings({ ignoreUndefinedProperties: false });
    return {
      mode,
      projectId: EMULATOR_PROJECT,
      db,
      Timestamp: firestore.Timestamp,
      FieldValue: firestore.FieldValue,
      collection: (name) => db.collection(name),
      collectionName: (name) => name,
      close: () => app.deleteApp(instance),
    };
  }

  // Real project. Writing here at all requires the proof prefix.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new TargetError('EMULATOR_HOST_SET_FOR_REAL_TARGET',
      'FIRESTORE_EMULATOR_HOST must be unset when targeting the real project');
  }
  const instance = app.initializeApp(
    { projectId: REAL_PROJECT, credential: app.applicationDefault() },
    `migration-real-${process.pid}-${Date.now()}`);
  // The database in mydesckpro is named `default`, not `(default)`. The Admin
  // SDK looks for `(default)` unless told otherwise, which is why a plain
  // connection to this project returns NOT_FOUND rather than a permission error.
  const db = firestore.getFirestore(instance, databaseId ?? 'default');
  db.settings({ ignoreUndefinedProperties: false });
  // Prefixing is idempotent. Applying it unconditionally would send an
  // already-prefixed caller to migration_test_v1_migration_test_v1_trips —
  // still inside the proof namespace, but a different collection than the one
  // it asked for, which would split proof data across two places.
  const guard = (name) => {
    const prefixed = proofCollection(name);
    if (!prefixed.startsWith(PROOF_PREFIX)) {
      throw new TargetError('REAL_PROJECT_REQUIRES_PROOF_PREFIX', name);
    }
    return prefixed;
  };
  return {
    mode,
    projectId: REAL_PROJECT,
    databaseId: databaseId ?? 'default',
    db,
    Timestamp: firestore.Timestamp,
    FieldValue: firestore.FieldValue,
    collection: (name) => db.collection(guard(name)),
    collectionName: (name) => guard(name),
    close: () => app.deleteApp(instance),
  };
}
