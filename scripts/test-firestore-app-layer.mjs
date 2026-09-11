import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectBackend } from '../src/data/backendMode.js';
import { moneyText, tripSchema } from '../src/data/schemas.js';

assert.equal(selectBackend({ PROD: true }, 'app.example.com'), 'supabase');
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'typo' }, 'localhost'), /INVALID_BACKEND_MODE/);
assert.throws(() => selectBackend({ PROD: true, DEV: false, VITE_DATA_BACKEND: 'firestore-emulator' }, 'localhost'), /PRODUCTION_BACKEND_LOCKED/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesck-migration-proof' }, 'example.com'), /MIGRATION_REQUIRES_LOOPBACK/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesckpro' }, 'localhost'), /EMULATOR_PROJECT_REQUIRED/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: 'mydesck-migration-proof' }, 'localhost'), /REAL_FIRESTORE_APPLICATION_NOT_APPROVED/);
assert.equal(selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesck-migration-proof' }, '127.0.0.1'), 'firestore-emulator');
assert.equal(moneyText({ unitsText: '900719925474099312345', scale: 2 }), '9007199254740993123.45');
assert.equal(tripSchema.safeParse({ schemaVersion: 2 }).success, false, 'unknown schema versions fail closed');

const workspace = readFileSync('src/migration-app/TravelWorkspace.tsx', 'utf8');
assert.doesNotMatch(workspace, /firebase\/(firestore|functions|storage)|supabase[.]/,
  'UI may only use domain repositories');
const hook = readFileSync('src/hooks/useTripMutations.ts', 'utf8');
assert.doesNotMatch(hook, /supabase[.](from|rpc|storage|channel)/,
  'migrated trip mutation hook may only use its adapter');
const signature = readFileSync('src/components/Settings.tsx', 'utf8').split('const handleSignatureUpload')[1];
assert.ok(signature, 'signature flow exists');
assert.doesNotMatch(signature.split('const fieldClass')[0], /getPublicUrl/,
  'private signatures never produce public URLs');
const storage = readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8');
assert.doesNotMatch(storage, /getPublicUrl/);
assert.match(storage, /upsert: false/);
const server = readFileSync('migration/firestore/functions/travel-operations.mjs', 'utf8');
assert.doesNotMatch(server, /parseFloat|toFixed|Math[.]round/);
assert.match(server, /where\('ownerUid'/);
assert.match(server, /where\('businessId'/);
const entry = readFileSync('migration/firestore/functions/index.mjs', 'utf8');
assert.match(entry, /EMULATOR_FUNCTIONS_ONLY/);

console.log('Firestore application-layer static and fail-closed controls: PASS');
