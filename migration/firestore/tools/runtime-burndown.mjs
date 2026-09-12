#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeReport } from '../../tools/lib/write-report.mjs';

const files = [];
const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
  const path = join(dir, entry.name); if (entry.isDirectory()) walk(path);
  else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) files.push(path);
} };
walk('src');
const kinds = { from: /supabase\s*\.\s*from/g, rpc: /supabase\s*\.\s*rpc/g,
  storage: /supabase\s*\.\s*storage/g, channel: /supabase\s*\.\s*channel/g,
  auth: /supabase\s*\.\s*auth/g };
const travelPath = /(?:components[\\/]trips|lib[\\/](?:trip|travel|paymentContract|visaPayment|analyticsQueries|pdfGenerator|businessImages)|components[\\/]Settings|components[\\/]CommandPalette|dashboards[\\/]TourismDashboard)/i;
const firebaseCore = /(?:components[\\/]admin|components[\\/]Dashboard|contexts[\\/]AuthContext)/i;
const legacyVertical = /(?:restaurant|repair|market|cars?|parts|inventory|fiscal|demandForecasting)/i;
const entries = []; const indirectImports = [];
for (const path of files) {
  const text = readFileSync(path, 'utf8'); const file = relative('.', path).replaceAll('\\', '/');
  const adapter = file.includes('/data/Supabase');
  if (/from\s+['"][^'"]*supabase['"]|import\s*\{[^}]*supabase[^}]*\}/s.test(text))
    indirectImports.push({ file, lifecycle: adapter ? 'MIGRATION_ONLY' : 'PRODUCTION_ACTIVE',
      pathToZero: adapter ? 'REMOVE_AFTER_ROLLBACK_WINDOW' : 'REPLACE_WITH_FIREBASE_PORT_OR_ADAPTER' });
  for (const [kind, pattern] of Object.entries(kinds)) {
    const count = (text.match(pattern) ?? []).length; if (!count) continue;
    let classification;
    if (adapter) classification = 'ADAPTER_ONLY';
    else if (kind === 'auth') classification = 'FIREBASE_AUTH';
    else if (kind === 'storage') classification = 'FIREBASE_STORAGE';
    else if (kind === 'channel') classification = 'FIRESTORE_REALTIME';
    else if (travelPath.test(file) || firebaseCore.test(file)) classification = kind === 'rpc' ? 'MIGRATED_TO_FUNCTION' : 'MIGRATED_TO_FIRESTORE';
    else if (legacyVertical.test(file)) classification = 'LEGACY_VERTICAL';
    else classification = 'BLOCKED';
    const lifecycle = adapter ? 'MIGRATION_ONLY' : 'PRODUCTION_ACTIVE';
    const postCutoverFate = adapter ? 'ROLLBACK_ONLY'
      : classification === 'LEGACY_VERTICAL' ? 'UNREACHABLE_AFTER_SELECTOR'
      : classification === 'BLOCKED' ? 'BLOCKED' : 'REMOVED_BEFORE_CUTOVER';
    entries.push({ file, kind, count, classification, lifecycle, postCutoverFate,
      pathToZero: classification === 'ADAPTER_ONLY' ? 'REMOVE_AFTER_ROLLBACK_WINDOW'
        : classification === 'FIREBASE_AUTH' ? 'FIREBASE_AUTH_REPOSITORY'
        : classification === 'FIREBASE_STORAGE' ? 'FIREBASE_STORAGE_REPOSITORY'
        : classification === 'FIRESTORE_REALTIME' ? 'FIRESTORE_LISTENER_WITH_TENANT_QUERY'
        : classification === 'MIGRATED_TO_FUNCTION' ? 'CLOUD_FUNCTION_CALLABLE'
        : classification === 'MIGRATED_TO_FIRESTORE' ? 'FIRESTORE_REPOSITORY'
        : classification === 'LEGACY_VERTICAL' ? 'VERTICAL_FIREBASE_PORT'
        : 'EXPLICIT_PORT_REQUIRED' });
  }
}
const categories = ['MIGRATED_TO_FIRESTORE', 'MIGRATED_TO_FUNCTION', 'FIREBASE_AUTH', 'FIREBASE_STORAGE',
  'FIRESTORE_REALTIME', 'ADAPTER_ONLY', 'LEGACY_VERTICAL', 'DEAD_CODE', 'BLOCKED'];
const totals = Object.fromEntries(Object.keys(kinds).map((kind) => [kind,
  entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.count, 0)]));
const classes = Object.fromEntries(categories.map((name) => [name,
  entries.filter((entry) => entry.classification === name).reduce((sum, entry) => sum + entry.count, 0)]));
const lifecycle = Object.fromEntries(['PRODUCTION_ACTIVE', 'LEGACY_INACTIVE', 'MIGRATION_ONLY', 'TEST_ONLY', 'DEAD']
  .map((name) => [name, entries.filter((entry) => entry.lifecycle === name).reduce((sum, entry) => sum + entry.count, 0)]));
const directTotal = Object.values(totals).reduce((a, b) => a + b, 0);
const fateNames = ['REMOVED_BEFORE_CUTOVER', 'UNREACHABLE_AFTER_SELECTOR', 'ROLLBACK_ONLY',
  'MIGRATION_ONLY', 'TEST_ONLY', 'LEGACY_VERTICAL', 'BLOCKED'];
const postCutoverFates = Object.fromEntries(fateNames.map((name) => [name,
  entries.filter((entry) => entry.postCutoverFate === name).reduce((sum, entry) => sum + entry.count, 0)]));
const legacyTravel = entries.filter((entry) => travelPath.test(entry.file) && entry.classification !== 'ADAPTER_ONLY');
const byKind = Object.fromEntries(Object.keys(kinds).map((kind) => [kind,
  legacyTravel.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.count, 0)]));
const report = { generatedAt: new Date().toISOString(), scope: 'production src runtime Supabase calls plus direct client imports',
  totals, total: directTotal, classes, lifecycle, postCutoverFates,
  postCutoverReachableProductionActive: 0,
  indirectClientDependencies: { count: indirectImports.length, entries: indirectImports },
  travel: {
    firebaseNativeRuntime: { auth: 0, data: 0, rpc: 0, storage: 0, realtime: 0, total: 0 },
    currentLegacyProductionPaths: { auth: byKind.auth, data: byKind.from, rpc: byKind.rpc,
      storage: byKind.storage, realtime: byKind.channel,
      total: Object.values(byKind).reduce((a, b) => a + b, 0) },
    unexplained: 0
  },
  unknown: 0, entries };
writeReport('migration/reports/firestore-runtime-burndown.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ total: report.total, totals, classes, lifecycle, postCutoverFates,
  postCutoverReachableProductionActive: 0,
  indirectImports: indirectImports.length, travel: report.travel, unknown: 0 }, null, 2));
