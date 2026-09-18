#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertMode } from '../lib/production-guard.mjs';
import { assertStorageCopyForbidden } from '../lib/production-execution-authorization.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'manifest-only');
assertMode(mode, ['manifest-only', 'rehearsal-copy', 'production-copy', 'final-delta'], value('--ack', null));
const inventory = JSON.parse(readFileSync('migration/reports/production-firebase-inventory.json', 'utf8'));
// Supabase Storage is the retained production storage backend, so this is not a milestone gate
// that later opens: it is permanent. No manifest, acknowledgement or commit pin can authorize
// it, and the refusal now comes first, before any manifest or bucket consideration.
assertStorageCopyForbidden(mode);
console.log(JSON.stringify({ mode, sourceObjectsAtLastRehearsal: 3, sourceBytesAtLastRehearsal: 438670,
  targetBuckets: inventory.storage.buckets.length, sourceWrites: 0, targetWrites: 0,
  status: mode === 'manifest-only' ? 'MANIFEST_PLAN_READY' : 'REHEARSAL_MODE_READY' }));
