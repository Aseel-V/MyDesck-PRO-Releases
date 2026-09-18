#!/usr/bin/env node
/**
 * Delete exactly the resources one synthetic smoke run created.
 *
 * Separate from the smoke itself for two reasons. The smoke is bundled by esbuild and run from the
 * repository root, where `@google-cloud/firestore` and `google-auth-library` do not resolve; and the
 * privileged credential has no business sitting in the same module as the client-path proof. The
 * smoke calls this from its `finally`, so a failed assertion still cleans up.
 *
 * What it may delete is bounded three ways: the document must be owned by a uid in the run manifest
 * or live under a business the manifest names, it must not be a path the migration journal recorded,
 * and it goes through the residue-cleanup boundary, which re-reads and hash-checks every document
 * immediately before deleting it.
 *
 *   node migration/firestore/tools/sweep-synthetic-tenants.mjs --manifest=<path>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openProductionReader } from '../lib/production-reader.mjs';
import { openResidueCleanupTarget, WITHDRAWAL_REASON, manifestIntegrityHash }
  from '../lib/residue-cleanup-target.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const JOURNAL = 'migration/production-copy.local/bulkcopy-15363817-711a-4b52-9414-4885a8585bf4.json';
const COLLECTIONS = ['users', 'businesses', 'businessOwners', 'trips', 'parts', 'tables',
  'menuCategories', 'menuItems', 'orders', 'orderItems', 'repairOrders', 'vehicles', 'vehiclePlates',
  'marketTransactions', 'tripPaymentPlans', 'tripInstallments', 'tripPaymentEvents',
  'tripInstallmentEvents', 'tripActivityLog', 'tripFinancialAudit', 'restaurantCounters',
  'idempotency', 'storageCleanupQueue', 'restaurantStaff', 'settings', 'restaurantAuditLogs',
  'guestProfiles', 'kitchenTickets', 'dailyReports', 'reservations'];

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const manifestPath = value('--manifest');
if (!manifestPath) throw Error('MANIFEST_REQUIRED');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const syntheticUids = new Set(manifest.authUids ?? []);
const syntheticBusinesses = new Set((manifest.businessIds ?? []).filter(Boolean));
if (syntheticUids.size === 0) throw Error('MANIFEST_HAS_NO_IDENTITIES');

const migrated = new Set(JSON.parse(readFileSync(JOURNAL, 'utf8')).writtenPaths);
const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
const result = { runId: manifest.runId, swept: [], sweepFailed: [], authDeleted: [], authFailed: [] };
try {
  const { paths } = await reader.scanCollectionGroups(COLLECTIONS);
  const candidates = [...paths].filter((path) => !migrated.has(path));
  const documents = await reader.readDocuments(candidates);
  const mine = [...documents.entries()].filter(([path, data]) => {
    if ([...syntheticUids].some((uid) => path.includes(uid))) return true;
    if ([...syntheticBusinesses].some((id) => id && path.includes(id))) return true;
    if (syntheticUids.has(data.ownerUid ?? '')) return true;
    if (syntheticUids.has(data.userId ?? '')) return true;
    return syntheticBusinesses.has(data.businessId ?? '');
  });

  if (mine.length) {
    const sweepManifest = {
      cleanupRunId: `${manifest.runId}-sweep`, reason: WITHDRAWAL_REASON,
      bulkMigrationRunId: 'synthetic-smoke', firebaseProject: PROJECT,
      firestoreDatabaseId: DATABASE, expectedCount: mine.length,
      documents: mine.map(([path, data]) => ({ path, preDeleteHash: rawDocumentHash(path, data) })),
      createdAt: new Date().toISOString(), status: 'PREPARED',
    };
    sweepManifest.integrityHash = manifestIntegrityHash(sweepManifest);
    const target = await openResidueCleanupTarget({ manifest: sweepManifest, projectId: PROJECT,
      databaseId: DATABASE, forbiddenPaths: migrated, expectedCount: mine.length,
      allowedReasons: [WITHDRAWAL_REASON] });
    for (const [path] of mine) {
      try { await target.deleteManifestDocument(path); result.swept.push(path); }
      catch (error) { result.sweepFailed.push({ path, code: error?.code ?? null }); }
    }
    await target.close();
  }
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  result.sweepFailed.push({ sweep: String(error?.message ?? error) });
}

// ---- the synthetic identities themselves ----------------------------------------------------------
const sdk = process.env.GCLOUD_SDK_ROOT
  ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
const token = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
for (const uid of syntheticUids) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
  if (response.ok) result.authDeleted.push(uid); else result.authFailed.push(uid);
}

result.residue = result.sweepFailed.length + result.authFailed.length;
writeFileSync(`${manifestPath}.sweep.json`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ runId: result.runId, firestoreSwept: result.swept.length,
  firestoreSweepFailed: result.sweepFailed.length, authDeleted: result.authDeleted.length,
  authFailed: result.authFailed.length, residue: result.residue }, null, 2));
process.exitCode = result.residue === 0 ? 0 : 1;
