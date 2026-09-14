import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { selectBackend } from '../src/data/backendMode.js';
import { moneyText, tripSchema } from '../src/data/schemas.js';

assert.equal(selectBackend({ PROD: true }, 'app.example.com'), 'supabase');
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'typo' }, 'localhost'), /INVALID_BACKEND_MODE/);
assert.throws(() => selectBackend({ PROD: true, DEV: false, VITE_DATA_BACKEND: 'firestore-emulator' }, 'localhost'), /PRODUCTION_BACKEND_LOCKED/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesck-migration-proof' }, 'example.com'), /MIGRATION_REQUIRES_LOOPBACK/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesckpro' }, 'localhost'), /EMULATOR_PROJECT_REQUIRED/);
assert.throws(() => selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: 'mydesckpro', VITE_FIRESTORE_DATABASE_ID:'default' }, 'localhost'), /REAL_FIRESTORE_REQUIRES_PRODUCTION_BUILD/);
assert.throws(() => selectBackend({ PROD: true, DEV: false, VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: 'mydesckpro', VITE_FIRESTORE_DATABASE_ID:'default', VITE_FIRESTORE_PRODUCTION_RELEASE:'mydesck-firestore-v1' }, 'app.example.com'), /SUPABASE_FALLBACK_MUST_BE_DISABLED/);
assert.throws(() => selectBackend({ PROD: true, DEV: false, VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: 'mydesckpro', VITE_FIRESTORE_DATABASE_ID:'default', VITE_FIRESTORE_PRODUCTION_RELEASE:'mydesck-firestore-v1', VITE_SUPABASE_FALLBACK_DISABLED:'true' }, 'app.example.com'), /FIREBASE_SPARK_PLAN_REQUIRED/);
assert.equal(selectBackend({ PROD: true, DEV: false, VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: 'mydesckpro', VITE_FIRESTORE_DATABASE_ID:'default', VITE_FIRESTORE_PRODUCTION_RELEASE:'mydesck-firestore-v1', VITE_SUPABASE_FALLBACK_DISABLED:'true', VITE_FIREBASE_EXPECTED_PLAN:'SPARK', VITE_FIREBASE_BILLING_ENABLED:'false' }, 'app.example.com'), 'firestore');
assert.equal(selectBackend({ PROD: false, DEV: true, VITE_DATA_BACKEND: 'firestore-emulator', VITE_FIREBASE_PROJECT_ID: 'mydesck-migration-proof' }, '127.0.0.1'), 'firestore-emulator');
assert.equal(moneyText({ unitsText: '900719925474099312345', scale: 2 }), '9007199254740993123.45');
assert.equal(tripSchema.safeParse({ schemaVersion: 2 }).success, false, 'unknown schema versions fail closed');

const workspace = readFileSync('src/migration-app/TravelWorkspace.tsx', 'utf8');
assert.doesNotMatch(workspace, /firebase\/(firestore|functions|storage)|supabase[.]/,
  'UI may only use domain repositories');
const migratedFiles = ['src/data/FirestoreTravelRepository.ts', 'src/data/TripService.ts',
  'src/data/SparkTransactionService.ts', 'src/data/firebaseClient.ts', 'src/data/SearchRepository.ts',
  'src/data/productionBackend.ts', 'src/data/maintenanceMode.ts', 'src/data/contracts.ts'];
const collect = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name); return entry.isDirectory() ? collect(path) : [path];
});
migratedFiles.push(...collect('src/migration-app').filter((path) => /\.(ts|tsx)$/.test(path)));
for (const path of migratedFiles) assert.doesNotMatch(readFileSync(path, 'utf8'),
  /(?:from\s+['"][^'"]*supabase|supabase\s*\.\s*(?:from|rpc|storage|channel|auth))/,
  `${path} may not add a direct Supabase dependency`);
const hook = readFileSync('src/hooks/useTripMutations.ts', 'utf8');
assert.doesNotMatch(hook, /supabase[.](from|rpc|storage|channel)/,
  'migrated trip mutation hook may only use its adapter');
const signature = readFileSync('src/components/Settings.tsx', 'utf8').split('const handleSignatureUpload')[1];
assert.ok(signature, 'signature flow exists');
assert.doesNotMatch(signature.split('const fieldClass')[0], /getPublicUrl/,
  'private signatures never produce public URLs');
const storage = readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8');
// The repository now also serves intentionally-public logos, so a blanket ban on getPublicUrl
// would be wrong. The invariant that matters is narrower: the signature bucket can never
// produce a public URL, and the private helpers only ever touch that bucket.
assert.match(storage, /SIGNATURES_ARE_NEVER_PUBLIC/,
  'publicUrl must refuse the signature bucket');
assert.match(storage, /bucket === SIGNATURE_BUCKET/,
  'the refusal must be keyed on the signature bucket itself');
assert.doesNotMatch(storage, /getPublicUrl[\s\S]{0,200}SIGNATURE_BUCKET/,
  'no public URL path may reach the signature bucket');
assert.match(storage, /upsert: false/);
const spark = readFileSync('src/data/SparkTransactionService.ts', 'utf8');
assert.doesNotMatch(spark, /parseFloat|toFixed|Math[.]round/);
assert.match(spark, /sparkOperations/);
const entry = readFileSync('migration/firestore/functions/index.mjs', 'utf8');
assert.match(entry, /EMULATOR_FUNCTIONS_ONLY/);
const compositionRoot = readFileSync('src/main.tsx', 'utf8');
assert.match(compositionRoot, /mode === 'supabase'.*production-main/s,
  'Supabase production bundle is selected only by the explicit selector');
assert.match(readFileSync('src/data/backendMode.ts', 'utf8'), /SUPABASE_FALLBACK_MUST_BE_DISABLED/);
assert.doesNotMatch(readFileSync('src/data/firebaseClient.ts', 'utf8'), /firebase\/(?:functions|storage)/);

console.log('Firestore application-layer static and fail-closed controls: PASS');
