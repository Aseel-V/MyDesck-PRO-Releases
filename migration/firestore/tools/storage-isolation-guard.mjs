#!/usr/bin/env node
/**
 * Static Storage-isolation guard.
 *
 * The target architecture keeps Supabase Storage and forbids Supabase database, RPC, Auth and
 * database realtime. That distinction only holds if Storage is reached through a narrow module
 * that cannot widen back into a general client. This guard enforces two rules statically:
 *
 *   1. No module outside the Storage allowlist may call `supabase.storage`.
 *   2. No module inside the allowlist may call `.from()`, `.rpc()`, `.auth` or `.channel()`,
 *      and none may import the shared general-purpose client.
 *
 * Read-only. No network, no production mutation.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Only these modules may touch Supabase Storage. */
const STORAGE_ALLOWLIST = [
  'src/data/supabaseStorageClient.ts',
  'src/data/SupabaseStorageRepository.ts',
  'src/data/contracts.ts',
];
/** The shared client exposes database, RPC and Auth; Storage modules must not import it. */
const GENERAL_CLIENT = /from\s+['"][^'"]*lib\/supabase['"]/;

const STORAGE_CALL = /supabase[A-Za-z]*\s*\.\s*storage\b|getStorageBackend\s*\(|createStorageBackend\s*\(/g;
const FORBIDDEN_IN_STORAGE_LAYER = {
  database: /\.\s*from\s*\(\s*['"]/g,
  rpc: /\.\s*rpc\s*\(/g,
  auth: /supabase[A-Za-z]*\s*\.\s*auth\b/g,
  realtime: /\.\s*(?:channel|removeChannel)\s*\(/g,
};

const files = [];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const path = join(dir, entry.name).replaceAll('\\', '/');
  if (entry.isDirectory()) walk(path);
  else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
});
walk('src');

const count = (text, pattern) => (text.match(pattern) ?? []).length;
const violations = { storageOutsideAllowlist: [], forbiddenInsideStorageLayer: [], generalClientInStorageLayer: [] };
let storageCallsTotal = 0;
let storageCallsInsideAllowlist = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const storageCalls = count(text, STORAGE_CALL);
  const allowed = STORAGE_ALLOWLIST.includes(file);
  storageCallsTotal += storageCalls;
  if (allowed) storageCallsInsideAllowlist += storageCalls;
  else if (storageCalls) violations.storageOutsideAllowlist.push({ file, calls: storageCalls });

  if (!allowed) continue;
  if (GENERAL_CLIENT.test(text)) violations.generalClientInStorageLayer.push({ file });
  for (const [name, pattern] of Object.entries(FORBIDDEN_IN_STORAGE_LAYER)) {
    // `.from(` inside the Storage layer is legitimate only as `storage.from(bucket)`.
    const masked = name === 'database' ? text.replace(/storage\s*\.\s*from\s*\(/g, 'STORAGE_BUCKET(') : text;
    const hits = count(masked, pattern);
    if (hits) violations.forbiddenInsideStorageLayer.push({ file, kind: name, count: hits });
  }
}

const isolated = violations.storageOutsideAllowlist.length === 0
  && violations.forbiddenInsideStorageLayer.length === 0
  && violations.generalClientInStorageLayer.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  allowlist: STORAGE_ALLOWLIST,
  scannedFiles: files.length,
  storageCallsTotal,
  storageCallsInsideAllowlist,
  storageCallsOutsideAllowlist: storageCallsTotal - storageCallsInsideAllowlist,
  violations,
  rules: {
    storageOnlyInsideAllowlist: violations.storageOutsideAllowlist.length === 0,
    noDatabaseRpcAuthRealtimeInStorageLayer: violations.forbiddenInsideStorageLayer.length === 0,
    noGeneralClientImportInStorageLayer: violations.generalClientInStorageLayer.length === 0,
  },
  decision: isolated ? 'STORAGE_ISOLATION_GO' : 'STORAGE_ISOLATION_NO_GO',
};
writeFileSync('migration/reports/storage-isolation-guard.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ storageCallsTotal, storageCallsInsideAllowlist,
  storageCallsOutsideAllowlist: report.storageCallsOutsideAllowlist,
  outside: violations.storageOutsideAllowlist,
  generalClientInStorageLayer: violations.generalClientInStorageLayer,
  decision: report.decision }, null, 2));
if (!isolated) process.exitCode = 2;
