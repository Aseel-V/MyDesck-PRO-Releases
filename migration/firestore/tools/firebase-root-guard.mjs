#!/usr/bin/env node
/**
 * Static guard for the Firebase production composition root.
 *
 * Fails when anything runtime-reachable from src/firebase-main.tsx:
 *   - imports the general Supabase client (src/lib/supabase.ts)
 *   - imports a Supabase backend adapter (src/data/supabase/*)
 *   - imports @supabase/supabase-js anywhere but the Storage-only client
 *   - calls Supabase database, RPC, Auth, database realtime or Edge Functions
 *   - reaches Supabase Storage outside StorageRepository
 *   - imports Firebase Storage, Cloud Functions or the Admin SDK
 *
 * Supabase Storage through StorageRepository is the single allowed Supabase surface.
 * Writes migration/reports/firebase-root-guard.json; exit 1 on any violation.
 */
import { writeFileSync } from 'node:fs';
import { FORBIDDEN_CATEGORIES, measureRoot } from '../lib/import-graph.mjs';

const ENTRY = 'src/firebase-main.tsx';
const STORAGE_ALLOWLIST = ['src/data/supabaseStorageClient.ts', 'src/data/SupabaseStorageRepository.ts'];
const root = measureRoot(ENTRY, { storageAllowlist: STORAGE_ALLOWLIST });
if (!root.present) throw new Error('FIREBASE_ROOT_MISSING');

const violations = {
  genericSupabaseClient: root.imports.genericSupabaseClient,
  supabaseAdapters: root.imports.supabaseAdapters,
  supabaseJsOutsideStorageClient: root.supabaseJsOutsideStorageClient,
  forbiddenCallSites: root.sites.filter((site) => FORBIDDEN_CATEGORIES.includes(site.kind))
    .map(({ file, line, kind, target }) => ({ file, line, kind, target })),
  storageOutsideRepository: root.storageOutsideAllowlist,
  firebaseStorage: root.imports.firebaseStorage,
  cloudFunctions: root.imports.firebaseFunctions,
  adminSdk: root.imports.firebaseAdmin,
};
const violationCount = Object.values(violations).reduce((sum, list) => sum + list.length, 0);
const report = {
  generatedAt: new Date().toISOString(),
  entry: ENTRY,
  runtimeReachableFiles: root.runtimeReachableFiles,
  allowed: { supabaseStorageThrough: STORAGE_ALLOWLIST, storageCallSites: root.storage },
  counts: Object.fromEntries(Object.entries(violations).map(([key, list]) => [key, list.length])),
  violations,
  decision: violationCount === 0 ? 'FIREBASE_ROOT_CLEAN' : 'FIREBASE_ROOT_VIOLATIONS',
};
writeFileSync('migration/reports/firebase-root-guard.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ entry: ENTRY, files: root.runtimeReachableFiles, counts: report.counts, decision: report.decision }, null, 2));
if (violationCount && !process.argv.includes('--report-only')) process.exitCode = 1;
