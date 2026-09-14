#!/usr/bin/env node
/**
 * Active-product parity evidence.
 *
 * Policy change: Supabase STORAGE is an intentional, permitted production dependency.
 * Supabase DATABASE, RPC, AUTH and database REALTIME are not. This tool therefore
 * counts those five categories separately, so a retained Storage call can never be
 * mistaken for a database dependency and a database call can never hide behind
 * "Supabase is allowed now".
 *
 * `src/main.tsx` is a selector, not an application: `supabase` loads
 * `src/production-main.tsx` (the shipped product), anything else loads the Firebase
 * root. Both roots are measured with the same import-graph walker.
 *
 * Read-only. No network, no production mutation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { reachableSource } from '../lib/spark-readiness.mjs';

// Storage is matched first and removed from the text so a `supabase.storage.from(...)`
// chain can never also be counted as a database `.from(...)`.
const STORAGE = /supabase[A-Za-z]*\s*\.\s*storage\b/g;
const CATEGORIES = {
  database: /supabase[A-Za-z]*\s*\.\s*from\s*\(/g,
  rpc: /supabase[A-Za-z]*\s*\.\s*rpc\s*\(/g,
  auth: /supabase[A-Za-z]*\s*\.\s*auth\b/g,
  realtime: /supabase[A-Za-z]*\s*\.\s*(?:channel|removeChannel)\s*\(/g,
};
const FIRESTORE = /firebase\/firestore|getFirestore/g;
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const STORAGE_ALLOWLIST = [
  'src/data/SupabaseStorageRepository.ts',
  'src/data/contracts.ts',
];

function measure(entry) {
  if (!existsSync(entry)) return { entry, present: false };
  const files = reachableSource(entry);
  const totals = { supabaseDatabase: 0, supabaseRpc: 0, supabaseAuth: 0, supabaseRealtime: 0, supabaseStorage: 0, firestore: 0 };
  const carriers = { supabaseDatabase: [], supabaseRpc: [], supabaseAuth: [], supabaseRealtime: [], supabaseStorage: [] };
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const storageHits = count(raw, STORAGE);
    if (storageHits) { totals.supabaseStorage += storageHits; carriers.supabaseStorage.push({ file, count: storageHits }); }
    const text = raw.replace(STORAGE, 'SUPABASE_STORAGE_CALL');
    for (const [name, pattern] of Object.entries(CATEGORIES)) {
      const hits = count(text, pattern);
      if (!hits) continue;
      const key = `supabase${name[0].toUpperCase()}${name.slice(1)}`;
      totals[key] += hits;
      carriers[key].push({ file, count: hits });
    }
    totals.firestore += count(raw, FIRESTORE);
  }
  const storageOutsideAllowlist = carriers.supabaseStorage.filter((c) => !STORAGE_ALLOWLIST.includes(c.file));
  return { entry, present: true, reachableFiles: files.length, ...totals, carriers,
    storageIsolated: storageOutsideAllowlist.length === 0, storageOutsideAllowlist };
}

const inventory = existsSync('migration/reports/live-vertical-inventory.json')
  ? JSON.parse(readFileSync('migration/reports/live-vertical-inventory.json', 'utf8')) : null;

const FIREBASE_ROOT = 'src/firebase-main.tsx';
const shippedProduct = measure('src/production-main.tsx');
const firebaseRoot = measure(existsSync(FIREBASE_ROOT) ? FIREBASE_ROOT : 'src/migration-app/main.tsx');

// A vertical is supported only when the Firebase root actually reaches its surface.
const MIGRATED = new Set(); // no vertical is fully migrated into a Firebase production root yet
const verticals = (inventory?.verticals ?? []).map((v) => ({
  vertical: v.vertical,
  classification: v.classification,
  tenants: v.tenants,
  rows: v.rows,
  firestoreMigrated: MIGRATED.has(v.vertical),
  reachableInFirebaseRoot: MIGRATED.has(v.vertical),
  blocksParity: !MIGRATED.has(v.vertical),
}));

const databaseRuntimeZero = firebaseRoot.present
  && firebaseRoot.supabaseDatabase === 0 && firebaseRoot.supabaseRpc === 0
  && firebaseRoot.supabaseAuth === 0 && firebaseRoot.supabaseRealtime === 0;
const allVerticalsSupported = verticals.length > 0 && verticals.every((v) => !v.blocksParity);

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  policy: {
    supabaseStorage: 'ALLOWED_INTENTIONAL_PRODUCTION_DEPENDENCY',
    supabaseDatabase: 'FORBIDDEN_AFTER_CUTOVER',
    supabaseRpc: 'FORBIDDEN_AFTER_CUTOVER',
    supabaseAuth: 'FORBIDDEN_AFTER_CUTOVER',
    supabaseDatabaseRealtime: 'FORBIDDEN_AFTER_CUTOVER',
  },
  selector: { entry: 'src/main.tsx', supabaseBranch: 'src/production-main.tsx',
    firebaseBranch: firebaseRoot.entry, defaultMode: 'supabase',
    dedicatedFirebaseProductionRootExists: existsSync(FIREBASE_ROOT) },
  compositionRoots: { shippedProduct, firebaseRoot },
  verticals,
  counts: inventory?.counts ?? null,
  targets: {
    supabaseDatabase: 0, supabaseRpc: 0, supabaseAuth: 0, supabaseRealtime: 0,
    supabaseStorage: 'INTENTIONAL_COUNT_BEHIND_StorageRepository',
  },
  firebaseRootActual: firebaseRoot.present ? {
    supabaseDatabase: firebaseRoot.supabaseDatabase, supabaseRpc: firebaseRoot.supabaseRpc,
    supabaseAuth: firebaseRoot.supabaseAuth, supabaseRealtime: firebaseRoot.supabaseRealtime,
    supabaseStorage: firebaseRoot.supabaseStorage, firestore: firebaseRoot.firestore,
  } : null,
  verticalsSupported: verticals.filter((v) => !v.blocksParity).length,
  verticalsBlocking: verticals.filter((v) => v.blocksParity).length,
  databaseRuntimeZeroInFirebaseRoot: databaseRuntimeZero,
  decision: allVerticalsSupported && databaseRuntimeZero ? 'PRODUCT_PARITY_GO' : 'PRODUCT_PARITY_NO_GO',
  note: 'The Firebase root currently measured is the reduced travel workspace. No dedicated Firebase production root containing every active vertical exists yet.',
};
writeFileSync('migration/reports/active-product-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  shippedProduct: { files: shippedProduct.reachableFiles, db: shippedProduct.supabaseDatabase,
    rpc: shippedProduct.supabaseRpc, auth: shippedProduct.supabaseAuth,
    realtime: shippedProduct.supabaseRealtime, storage: shippedProduct.supabaseStorage,
    firestore: shippedProduct.firestore },
  firebaseRoot: { entry: firebaseRoot.entry, files: firebaseRoot.reachableFiles,
    db: firebaseRoot.supabaseDatabase, rpc: firebaseRoot.supabaseRpc, auth: firebaseRoot.supabaseAuth,
    realtime: firebaseRoot.supabaseRealtime, storage: firebaseRoot.supabaseStorage,
    firestore: firebaseRoot.firestore },
  verticalsSupported: report.verticalsSupported, verticalsBlocking: report.verticalsBlocking,
  decision: report.decision }, null, 2));
if (report.decision !== 'PRODUCT_PARITY_GO') process.exitCode = 2;
