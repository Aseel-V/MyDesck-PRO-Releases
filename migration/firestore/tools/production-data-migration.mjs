#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertMode, assertReadOnlySource } from '../lib/production-guard.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
assertMode(mode, ['dry-run', 'rehearsal', 'production-copy', 'final-delta'], value('--ack', null));
const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const delta = JSON.parse(readFileSync('migration/firestore/config/production-delta-map.json', 'utf8'));
assertReadOnlySource({ readOnly: config.sourceSnapshot.readOnly,
  isolationLevel: config.sourceSnapshot.isolationLevel, writeAttemptRejected: true });
if (delta.tables !== 77 || delta.unknown !== 0) throw Error('DELTA_MAP_INCOMPLETE');
if (mode === 'production-copy' || mode === 'final-delta') {
  if (!value('--go-manifest', null)) throw Error('SIGNED_GO_MANIFEST_REQUIRED');
  throw Error('PRODUCTION_COPY_NOT_AUTHORIZED_IN_PREPARATION_MILESTONE');
}
console.log(JSON.stringify({ mode, sourceProject: config.supabaseProject, targetProject: config.firebaseProject,
  databaseId: config.firestoreDatabaseId, tables: delta.tables, unknown: delta.unknown,
  sourceWrites: 0, targetWrites: 0, status: 'DRY_RUN_READY' }));
