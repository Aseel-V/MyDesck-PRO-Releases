#!/usr/bin/env node
/**
 * Active-product parity evidence (Phase 5).
 *
 * The Spark runtime proof measures the Firebase-mode composition root
 * (`src/migration-app/main.tsx`). That is NOT the shipped product. `src/main.tsx`
 * is a selector: `supabase` loads `src/production-main.tsx`, anything else loads
 * the migration workspace. This tool measures BOTH roots with the same import-graph
 * walker and classifies every product surface the shipped dashboard can reach,
 * so "0 reachable Supabase" can never be quoted for a root it was not measured on.
 *
 * Read-only. No network, no production mutation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { reachableSource } from '../lib/spark-readiness.mjs';

const PATTERNS = {
  supabase: /(?:from\s+['"][^'"]*supabase|supabase\s*\.\s*(?:from|rpc|storage|channel|auth))/g,
  functions: /firebase\/functions|httpsCallable|getFunctions/g,
  storage: /firebase\/storage|getStorage|uploadBytes|getBlob|supabase\s*\.\s*storage/g,
  firestore: /firebase\/firestore|getFirestore/g,
};
const count = (text, pattern) => (text.match(pattern) ?? []).length;

function measure(entry) {
  const files = reachableSource(entry);
  const totals = { supabase: 0, functions: 0, storage: 0, firestore: 0 };
  const carriers = { supabase: new Set(), storage: new Set(), functions: new Set() };
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const [name, pattern] of Object.entries(PATTERNS)) {
      const hits = count(text, pattern);
      totals[name] += hits;
      if (hits && carriers[name]) carriers[name].add(file);
    }
  }
  return { entry, reachableFiles: files.length, ...totals,
    supabaseFiles: carriers.supabase.size, storageFiles: carriers.storage.size,
    functionsFiles: carriers.functions.size };
}

// Verticals the shipped dashboard dispatches to on profile.business_type.
const DASHBOARD = 'src/components/Dashboard.tsx';
const dashboard = readFileSync(DASHBOARD, 'utf8');
const verticals = [...new Set([...dashboard.matchAll(/business_type === '([a-z_]+)'/g)].map(m => m[1]))].sort();

// Rows present in the reconciled production corpus, per vertical table prefix.
const reconciliation = JSON.parse(readFileSync('migration/reports/firestore-full-reconciliation.json', 'utf8'));
const rowsFor = (prefixes) => Object.entries(reconciliation.perTable)
  .filter(([table]) => prefixes.some(p => table.startsWith(p)))
  .reduce((sum, [, value]) => sum + (value.expected ?? 0), 0);

const VERTICAL_TABLES = {
  tourism: ['trip', 'travel_'],
  restaurant: ['restaurant_'],
  supermarket: ['market_'],
  auto_repair: ['customer_vehicles'],
  car_parts: ['car_parts'],
  phone_shop: [],
  clothes_shop: [],
  furniture_store: [],
};

const firebaseMode = measure('src/migration-app/main.tsx');
const shippedProduct = measure('src/production-main.tsx');

const surfaces = verticals.map((vertical) => {
  const productionRows = rowsFor(VERTICAL_TABLES[vertical] ?? []);
  const migrated = vertical === 'tourism';
  return {
    vertical,
    classification: 'ACTIVE',
    reachableFromShippedDashboard: true,
    productionRowsInReconciledCorpus: productionRows,
    firestoreApplicationLayer: migrated ? 'PRESENT_TRAVEL_WORKSPACE_ONLY' : 'ABSENT',
    firebaseModeSupported: false,
    blocksCutover: true,
    reason: migrated
      ? 'The Firebase-mode workspace implements a reduced travel surface; the shipped tourism product is the Supabase-backed dashboard and is not reachable in Firebase mode.'
      : 'No Firestore application layer exists. Selecting Firebase mode removes this vertical from the product entirely.',
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  selector: {
    entry: 'src/main.tsx',
    supabaseBranch: 'src/production-main.tsx',
    firebaseBranch: 'src/migration-app/main.tsx',
    defaultMode: 'supabase',
  },
  compositionRoots: { firebaseMode, shippedProduct },
  verticals: surfaces,
  counts: {
    ACTIVE: surfaces.length,
    LEGACY_UNREACHABLE: 0,
    MIGRATION_ONLY: 0,
    ROLLBACK_ONLY: 0,
    DEAD: 0,
    unknown: 0,
  },
  activeVerticalsSupportedInFirebaseMode: surfaces.filter(s => s.firebaseModeSupported).length,
  activeVerticalsBlockingCutover: surfaces.filter(s => s.blocksCutover).length,
  shippedProductSupabaseReachable: shippedProduct.supabase,
  shippedProductFirestoreReachable: shippedProduct.firestore,
  decision: surfaces.every(s => s.firebaseModeSupported) ? 'ACTIVE_PRODUCT_PARITY_PASS' : 'ACTIVE_PRODUCT_PARITY_BLOCKED',
  note: 'The Spark runtime proof measures the Firebase-mode root only. It remains true for that root and is not evidence about the shipped product.',
};

writeFileSync('migration/reports/active-product-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  firebaseMode: `${firebaseMode.reachableFiles} files / supabase ${firebaseMode.supabase} / firestore ${firebaseMode.firestore}`,
  shippedProduct: `${shippedProduct.reachableFiles} files / supabase ${shippedProduct.supabase} / firestore ${shippedProduct.firestore}`,
  activeVerticals: surfaces.length,
  supportedInFirebaseMode: report.activeVerticalsSupportedInFirebaseMode,
  decision: report.decision,
}, null, 2));
if (report.decision !== 'ACTIVE_PRODUCT_PARITY_PASS') process.exitCode = 2;
