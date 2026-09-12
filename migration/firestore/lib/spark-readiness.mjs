import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const IMPORT = /(?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\()\s*['"]([^'"]+)['"]/g;

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base) ? [base] : [
    ...SOURCE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...SOURCE_EXTENSIONS.map(ext => join(base, `index${ext}`)),
  ];
  return candidates.find(existsSync) ?? null;
}

export function reachableSource(entry = 'src/migration-app/main.tsx') {
  const pending = [resolve(entry)], seen = new Set();
  while (pending.length) {
    const file = normalize(pending.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const target = resolveImport(file, match[1]);
      if (target && !seen.has(normalize(target))) pending.push(target);
    }
  }
  return [...seen].map(file => relative('.', file).replaceAll('\\', '/')).sort();
}

const count = (text, pattern) => (text.match(pattern) ?? []).length;
export function runtimeProof() {
  const files = reachableSource();
  const bodies = files.map(file => ({ file, text: readFileSync(file, 'utf8') }));
  const evidence = {
    functionsImports: bodies.flatMap(({ file, text }) => count(text, /firebase\/functions|httpsCallable|getFunctions/g)
      ? [{ file, count: count(text, /firebase\/functions|httpsCallable|getFunctions/g) }] : []),
    storageImports: bodies.flatMap(({ file, text }) => count(text, /firebase\/storage|getStorage|uploadBytes|getBlob|supabase\s*\.\s*storage/g)
      ? [{ file, count: count(text, /firebase\/storage|getStorage|uploadBytes|getBlob|supabase\s*\.\s*storage/g) }] : []),
    supabaseImports: bodies.flatMap(({ file, text }) => count(text, /(?:from\s+['"][^'"]*supabase|supabase\s*\.\s*(?:from|rpc|storage|channel|auth))/g)
      ? [{ file, count: count(text, /(?:from\s+['"][^'"]*supabase|supabase\s*\.\s*(?:from|rpc|storage|channel|auth))/g) }] : []),
    privilegedRuntime: bodies.flatMap(({ file, text }) => count(text, /firebase-admin|serviceAccount|private_key/g)
      ? [{ file, count: count(text, /firebase-admin|serviceAccount|private_key/g) }] : []),
    fileInputs: bodies.flatMap(({ file, text }) => count(text, /type=['"]file['"]|<FileUpload\b/g)
      ? [{ file, count: count(text, /type=['"]file['"]|<FileUpload\b/g) }] : []),
  };
  return {
    entry: 'src/migration-app/main.tsx', reachableFiles: files.length, files,
    evidence,
    activeCallableFunctionCalls: evidence.functionsImports.reduce((n, item) => n + item.count, 0),
    activeStorageCalls: evidence.storageImports.reduce((n, item) => n + item.count, 0),
    activeSupabaseCalls: evidence.supabaseImports.reduce((n, item) => n + item.count, 0),
    activePrivilegedCredentials: evidence.privilegedRuntime.reduce((n, item) => n + item.count, 0),
    activeFileUploadUi: evidence.fileInputs.reduce((n, item) => n + item.count, 0),
  };
}

export function sourceReferenceInventory(root = 'src') {
  const files = [];
  const walk = dir => readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  });
  walk(root);
  const patterns = {
    supabase: /(?:from\s+['"][^'"]*supabase|supabase\s*\.\s*(?:from|rpc|storage|channel|auth))/g,
    functions: /firebase\/functions|httpsCallable|getFunctions/g,
    storage: /firebase\/storage|getStorage|uploadBytes|getBlob|supabase\s*\.\s*storage/g,
  };
  return Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name,
    files.reduce((total, file) => total + count(readFileSync(file, 'utf8'), pattern), 0)]));
}

export const SPARK_ENTERPRISE_QUOTA = {
  storedBytes: 1024 ** 3,
  readUnitsPerDay: 50_000,
  writeUnitsPerDay: 40_000,
  realtimeUpdateUnitsPerDay: 50_000,
  outboundBytesPerMonth: 10 * 1024 ** 3,
};

export function quotaBudget() {
  const corpus = JSON.parse(readFileSync('migration/reports/firestore-full-import.json', 'utf8'));
  const documents = corpus.target.documents;
  const maximumDocumentBytes = corpus.sizes.largest.bytes;
  const conservativeDocumentBytes = documents * maximumDocumentBytes;
  const indexedUpperBoundBytes = conservativeDocumentBytes * 4;
  const workflows = {
    loginBusinessLoad: { reads: 2, writes: 0 },
    tripListPage25: { reads: 25, writes: 0 },
    tripDetailTypical: { reads: 8, writes: 0 },
    createTripThreeInstallments: { reads: 19, writes: 10 },
    editTrip: { reads: 6, writes: 3 },
    payment: { reads: 10, writes: 6 },
    installmentPayment: { reads: 13, writes: 8 },
    analyticsWorstBound: { reads: 250, writes: 0 },
    searchBoundedPage: { reads: 100, writes: 0 },
    archiveOrRestore: { reads: 7, writes: 3 },
  };
  const breakEven = Object.fromEntries(Object.entries(workflows).map(([name, cost]) => [name,
    Math.min(cost.reads ? Math.floor(SPARK_ENTERPRISE_QUOTA.readUnitsPerDay / cost.reads) : Infinity,
      cost.writes ? Math.floor(SPARK_ENTERPRISE_QUOTA.writeUnitsPerDay / cost.writes) : Infinity)]));
  return {
    databaseEdition: 'ENTERPRISE', documents, maximumDocumentBytes,
    conservativeDocumentBytes, indexedUpperBoundBytes,
    storedQuotaUtilizationPercent: Number((indexedUpperBoundBytes / SPARK_ENTERPRISE_QUOTA.storedBytes * 100).toFixed(3)),
    quotas: SPARK_ENTERPRISE_QUOTA, workflows, breakEven,
    usageRateKnown: false,
    conclusion: indexedUpperBoundBytes < SPARK_ENTERPRISE_QUOTA.storedBytes
      ? 'SAFE_AT_CURRENT_CORPUS_WITH_BREAK_EVEN_MONITORING' : 'BLOCKED_STORAGE_QUOTA',
  };
}

export const RULE_ACCESS_BUDGET = {
  tripCreateThreeInstallments: { writes: 7, perWriteMax: 7, totalUnique: 7, limitPerWrite: 10, limitAtomic: 20 },
  tripCreateEightInstallments: { writes: 12, perWriteMax: 10, totalUnique: 12, limitPerWrite: 10, limitAtomic: 20 },
  tripEdit: { writes: 3, perWriteMax: 3, totalUnique: 4, limitPerWrite: 10, limitAtomic: 20 },
  payment: { writes: 6, perWriteMax: 5, totalUnique: 4, limitPerWrite: 10, limitAtomic: 20 },
  installmentPayment: { writes: 8, perWriteMax: 5, totalUnique: 5, limitPerWrite: 10, limitAtomic: 20 },
  archiveRestore: { writes: 3, perWriteMax: 5, totalUnique: 4, limitPerWrite: 10, limitAtomic: 20 },
};

export function ruleBudgetPass() {
  return Object.values(RULE_ACCESS_BUDGET).every(item =>
    item.perWriteMax <= item.limitPerWrite && item.totalUnique <= item.limitAtomic);
}
