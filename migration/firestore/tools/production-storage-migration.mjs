#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertMode } from '../lib/production-guard.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'manifest-only');
assertMode(mode, ['manifest-only', 'rehearsal-copy', 'production-copy', 'final-delta'], value('--ack', null));
const inventory = JSON.parse(readFileSync('migration/reports/production-firebase-inventory.json', 'utf8'));
if (mode === 'production-copy' || mode === 'final-delta') {
  if (!value('--go-manifest', null)) throw Error('SIGNED_GO_MANIFEST_REQUIRED');
  if (!inventory.storage.buckets.length) throw Error('APPROVED_FIREBASE_STORAGE_BUCKET_REQUIRED');
  throw Error('PRODUCTION_STORAGE_COPY_NOT_AUTHORIZED_IN_PREPARATION_MILESTONE');
}
console.log(JSON.stringify({ mode, sourceObjectsAtLastRehearsal: 3, sourceBytesAtLastRehearsal: 438670,
  targetBuckets: inventory.storage.buckets.length, sourceWrites: 0, targetWrites: 0,
  status: mode === 'manifest-only' ? 'MANIFEST_PLAN_READY' : 'REHEARSAL_MODE_READY' }));
