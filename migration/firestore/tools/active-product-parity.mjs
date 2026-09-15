#!/usr/bin/env node
/**
 * Active-product parity evidence.
 *
 * Policy: Supabase STORAGE is an intentional, permitted production dependency, reached only through
 * StorageRepository. Supabase DATABASE, RPC, AUTH, database REALTIME and Edge Functions are not. The
 * categories are counted separately so a retained Storage call can never be mistaken for a database
 * dependency and a database call can never hide behind "Supabase is allowed now".
 *
 * `src/main.tsx` is a selector: `supabase` loads `src/production-main.tsx` (the shipped product until
 * cutover), the Firestore modes load `src/firebase-main.tsx` (the Firebase production root). Both are
 * measured with the same AST-based import-graph analysis (../lib/import-graph.mjs).
 *
 * A vertical counts as supported only when (a) its surface is reachable from the Firebase root,
 * (b) no runtime-reachable file of that vertical carries a forbidden Supabase call, and (c) its
 * per-vertical evidence (migration/reports/vertical-parity-<vertical>.json) reports every gate PASS.
 * Nothing is supported by declaration.
 *
 * Read-only. No network, no production mutation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FORBIDDEN_CATEGORIES, measureRoot } from '../lib/import-graph.mjs';
import { PRODUCT_ROOTS, STORAGE_ALLOWLIST, VERTICAL_SURFACES, verticalOf } from '../lib/vertical-surfaces.mjs';

const { shipped: SHIPPED_ROOT, firebase: FIREBASE_ROOT } = PRODUCT_ROOTS;

export { VERTICAL_SURFACES, verticalOf };

const summarise = (root) => (root.present ? {
  entry: root.entry, present: true, reachableFiles: root.reachableFiles, runtimeReachableFiles: root.runtimeReachableFiles,
  supabaseDatabase: root.database, supabaseRpc: root.rpc, supabaseAuth: root.auth, supabaseRealtime: root.realtime,
  supabaseEdgeFunctions: root.edgeFunctions, supabaseStorage: root.storage, forbiddenTotal: root.forbiddenTotal,
  firestoreImports: root.imports.firestore.length, firebaseAuthImports: root.imports.firebaseAuth.length,
  genericSupabaseClientImports: root.imports.genericSupabaseClient, supabaseAdapterImports: root.imports.supabaseAdapters,
  supabaseJsOutsideStorageClient: root.supabaseJsOutsideStorageClient, firebaseStorageImports: root.imports.firebaseStorage,
  firebaseFunctionsImports: root.imports.firebaseFunctions, firebaseAdminImports: root.imports.firebaseAdmin,
  storageIsolated: root.storageOutsideAllowlist.length === 0, storageOutsideAllowlist: root.storageOutsideAllowlist,
  carriers: root.carriers,
} : { entry: root.entry, present: false });

const shipped = measureRoot(SHIPPED_ROOT, { storageAllowlist: STORAGE_ALLOWLIST });
const firebase = measureRoot(FIREBASE_ROOT, { storageAllowlist: STORAGE_ALLOWLIST });
const inventory = existsSync('migration/reports/live-vertical-inventory.json')
  ? JSON.parse(readFileSync('migration/reports/live-vertical-inventory.json', 'utf8')) : null;

const verticals = (inventory?.verticals ?? []).map((entry) => {
  const name = entry.vertical;
  const surfaceInFirebaseRoot = firebase.present ? firebase.runtimeFiles.filter((file) => verticalOf(file) === name) : [];
  const forbiddenSites = firebase.present
    ? firebase.sites.filter((site) => FORBIDDEN_CATEGORIES.includes(site.kind) && verticalOf(site.file) === name) : [];
  const shippedSites = shipped.sites.filter((site) => FORBIDDEN_CATEGORIES.includes(site.kind) && verticalOf(site.file) === name);
  const evidencePath = `migration/reports/vertical-parity-${name}.json`;
  const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : null;
  const gates = evidence?.gates ?? null;
  const evidencePass = Boolean(gates) && Object.values(gates).every((gate) => gate.status === 'PASS');
  const reachable = surfaceInFirebaseRoot.length > 0;
  const supported = reachable && forbiddenSites.length === 0 && evidencePass;
  return {
    vertical: name, classification: entry.classification, tenants: entry.tenants, rows: entry.rows,
    reachableInFirebaseRoot: reachable, firebaseRootSurfaceFiles: surfaceInFirebaseRoot.length,
    firebaseRootForbiddenCallSites: forbiddenSites.length,
    firebaseRootForbiddenByCategory: Object.fromEntries(FORBIDDEN_CATEGORIES.map((kind) => [kind, forbiddenSites.filter((s) => s.kind === kind).length])),
    shippedRootForbiddenCallSites: shippedSites.length,
    evidence: evidence ? { path: evidencePath, generatedAt: evidence.generatedAt, pass: evidencePass,
      gates: Object.fromEntries(Object.entries(gates ?? {}).map(([gate, value]) => [gate, value.status])) } : 'NOT_GENERATED',
    firestoreMigrated: supported, blocksParity: !supported,
  };
});

const sharedForbidden = firebase.present
  ? firebase.sites.filter((site) => FORBIDDEN_CATEGORIES.includes(site.kind) && verticalOf(site.file) === null) : [];
const databaseRuntimeZero = firebase.present && firebase.forbiddenTotal === 0
  && firebase.imports.genericSupabaseClient.length === 0 && firebase.imports.supabaseAdapters.length === 0
  && firebase.supabaseJsOutsideStorageClient.length === 0;
const allVerticalsSupported = verticals.length > 0 && verticals.every((vertical) => !vertical.blocksParity);
const decision = allVerticalsSupported && databaseRuntimeZero && firebase.storageOutsideAllowlist.length === 0
  && firebase.imports.firebaseStorage.length === 0 && firebase.imports.firebaseFunctions.length === 0
  && firebase.imports.firebaseAdmin.length === 0 ? 'PRODUCT_PARITY_GO' : 'PRODUCT_PARITY_NO_GO';

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  measurement: 'TypeScript AST import graph (comments and strings are not code; @/ aliases resolved)',
  policy: {
    supabaseStorage: 'ALLOWED_INTENTIONAL_PRODUCTION_DEPENDENCY_BEHIND_StorageRepository',
    supabaseDatabase: 'FORBIDDEN_AFTER_CUTOVER', supabaseRpc: 'FORBIDDEN_AFTER_CUTOVER',
    supabaseAuth: 'FORBIDDEN_AFTER_CUTOVER', supabaseDatabaseRealtime: 'FORBIDDEN_AFTER_CUTOVER',
    supabaseEdgeFunctions: 'FORBIDDEN_AFTER_CUTOVER', firebaseStorage: 'FORBIDDEN', cloudFunctions: 'FORBIDDEN',
  },
  selector: { entry: 'src/main.tsx', supabaseBranch: SHIPPED_ROOT, firebaseBranch: FIREBASE_ROOT, defaultMode: 'supabase',
    dedicatedFirebaseProductionRootExists: firebase.present },
  compositionRoots: { shippedProduct: summarise(shipped), firebaseRoot: summarise(firebase) },
  firebaseRootActual: firebase.present ? {
    supabaseDatabase: firebase.database, supabaseRpc: firebase.rpc, supabaseAuth: firebase.auth,
    supabaseRealtime: firebase.realtime, supabaseEdgeFunctions: firebase.edgeFunctions, supabaseStorage: firebase.storage,
    firestore: firebase.imports.firestore.length, genericSupabaseClientImports: firebase.imports.genericSupabaseClient.length,
    supabaseAdapterImports: firebase.imports.supabaseAdapters.length,
  } : null,
  firebaseRootSharedForbiddenCallSites: sharedForbidden.map(({ file, line, kind, target }) => ({ file, line, kind, target })),
  verticals,
  counts: inventory?.counts ?? null,
  targets: { supabaseDatabase: 0, supabaseRpc: 0, supabaseAuth: 0, supabaseRealtime: 0, supabaseEdgeFunctions: 0,
    supabaseStorage: 'INTENTIONAL_COUNT_BEHIND_StorageRepository' },
  verticalsSupported: verticals.filter((vertical) => !vertical.blocksParity).length,
  verticalsBlocking: verticals.filter((vertical) => vertical.blocksParity).length,
  databaseRuntimeZeroInFirebaseRoot: databaseRuntimeZero,
  decision,
};
writeFileSync('migration/reports/active-product-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  shippedProduct: { files: shipped.runtimeReachableFiles, db: shipped.database, rpc: shipped.rpc, auth: shipped.auth,
    realtime: shipped.realtime, edgeFunctions: shipped.edgeFunctions, storage: shipped.storage },
  firebaseRoot: firebase.present ? { files: firebase.runtimeReachableFiles, db: firebase.database, rpc: firebase.rpc,
    auth: firebase.auth, realtime: firebase.realtime, edgeFunctions: firebase.edgeFunctions, storage: firebase.storage,
    genericClientImports: firebase.imports.genericSupabaseClient.length, adapterImports: firebase.imports.supabaseAdapters.length,
    storageOutsideAllowlist: firebase.storageOutsideAllowlist.length } : 'ABSENT',
  verticals: Object.fromEntries(verticals.map((v) => [v.vertical, { reachable: v.reachableInFirebaseRoot,
    forbidden: v.firebaseRootForbiddenCallSites, evidence: typeof v.evidence === 'string' ? v.evidence : v.evidence.pass }])),
  sharedForbidden: sharedForbidden.length,
  verticalsSupported: report.verticalsSupported, verticalsBlocking: report.verticalsBlocking, decision }, null, 2));
if (decision !== 'PRODUCT_PARITY_GO') process.exitCode = 2;
