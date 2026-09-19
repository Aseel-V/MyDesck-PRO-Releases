#!/usr/bin/env node
/**
 * Resolve and delete the synthetic residue left when the quota ran out mid-sweep.
 *
 * The offline manifest named sixteen paths with certainty and was explicit that two more were
 * derivable and the rest only enumerable. This closes those two gaps with the smallest number of
 * reads that can close them — one read per unrecorded business owner, then a subcollection listing
 * of our own six business documents — and never a collection-group scan, which is what emptied the
 * allowance in the first place.
 *
 * Deletion goes through the residue-cleanup boundary, so every path is re-read and hash-checked
 * immediately beforehand and the migration journal's 1,477 written paths are the forbidden set. A
 * migrated document is therefore unreachable from here even if the resolution step were wrong.
 *
 *   node migration/firestore/tools/post-reset-cleanup.mjs --ack=<ack>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { openResidueCleanupTarget, WITHDRAWAL_REASON, manifestIntegrityHash }
  from '../lib/residue-cleanup-target.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const ACK = 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_RESIDUE_DELETION';
const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const MANIFEST = 'migration/post-cutover-smoke.local/residue-manifest.json';
const JOURNAL = 'migration/production-copy.local/bulkcopy-15363817-711a-4b52-9414-4885a8585bf4.json';
const REPORT = 'migration/reports/post-reset-residue-cleanup.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
if (value('--ack') !== ACK) throw Error('CLEANUP_ACKNOWLEDGEMENT_REQUIRED');

const offline = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const migrated = new Set(JSON.parse(readFileSync(JOURNAL, 'utf8')).writtenPaths);
const syntheticUids = new Set(offline.syntheticUids);
const budget = { reads: 0, deletes: 0 };

const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let report;
try {
  // ---- close the derivable gap: one read per owner whose business id was never recorded ---------
  const derivableOwners = [...new Set(offline.derivable.map((entry) => entry.resolveFrom))];
  const ownerDocs = await reader.readDocuments(derivableOwners);
  budget.reads += derivableOwners.length;
  const derivedBusinessIds = [...ownerDocs.values()]
    .map((doc) => doc.businessId).filter((id) => typeof id === 'string' && id.length > 0);

  const businessIds = [...new Set([...offline.syntheticBusinessIds, ...derivedBusinessIds])];
  const businessPaths = businessIds.map((id) => `businesses/${id}`);

  // ---- close the enumerable gap: list only our own business documents' subcollections -----------
  const descendants = await reader.listDescendantPaths(businessPaths);
  budget.reads += businessPaths.length;

  // ---- the final exact set ----------------------------------------------------------------------
  const candidates = [...new Set([
    ...offline.deterministicPaths,
    ...businessPaths,
    ...descendants.paths,
  ])].sort();

  // Nothing the migration wrote may appear here. The boundary enforces this too; checking first
  // means a mistake is a refusal to start rather than a refusal partway through.
  const forbidden = candidates.filter((path) => migrated.has(path));
  if (forbidden.length) throw Error(`CANDIDATES_OVERLAP_MIGRATION:${forbidden.slice(0, 3).join(',')}`);

  const present = await reader.readDocuments(candidates);
  budget.reads += candidates.length;
  const existing = [...present.entries()];

  // Every surviving document must still be attributable to a synthetic identity or business.
  const unattributed = existing.filter(([path, data]) => {
    if ([...syntheticUids].some((uid) => path.includes(uid))) return false;
    if (businessIds.some((id) => path.includes(id))) return false;
    if (syntheticUids.has(data.ownerUid ?? '')) return false;
    return !businessIds.includes(data.businessId ?? '');
  });
  if (unattributed.length) {
    throw Error(`UNATTRIBUTED_CANDIDATES:${unattributed.slice(0, 3).map(([p]) => p).join(',')}`);
  }

  const deleted = [];
  const failed = [];
  if (existing.length) {
    const manifest = {
      cleanupRunId: `post-reset-${Date.now()}`,
      reason: WITHDRAWAL_REASON,
      bulkMigrationRunId: 'synthetic-smoke-residue',
      firebaseProject: PROJECT,
      firestoreDatabaseId: DATABASE,
      expectedCount: existing.length,
      documents: existing.map(([path, data]) => ({ path, preDeleteHash: rawDocumentHash(path, data) })),
      createdAt: new Date().toISOString(),
      status: 'PREPARED',
    };
    manifest.integrityHash = manifestIntegrityHash(manifest);
    const target = await openResidueCleanupTarget({ manifest, projectId: PROJECT,
      databaseId: DATABASE, forbiddenPaths: migrated, expectedCount: existing.length,
      allowedReasons: [WITHDRAWAL_REASON] });
    for (const entry of manifest.documents) {
      try { await target.deleteManifestDocument(entry.path); deleted.push(entry.path); budget.deletes += 1; }
      catch (error) { failed.push({ path: entry.path, code: error?.code ?? null }); }
    }
    await target.close();
  }

  // ---- verify absence, reading only what we deleted ---------------------------------------------
  const after = await reader.readDocuments(deleted);
  budget.reads += deleted.length;
  const stillPresent = [...after.keys()];

  report = {
    generatedAt: new Date().toISOString(),
    artifact: 'post-reset-residue-cleanup',
    offlineManifestHash: offline.integrityHash,
    resolution: {
      deterministicFromOfflineManifest: offline.deterministicPaths.length,
      businessIdsDerivedByRead: derivedBusinessIds.length,
      businessDocumentsListed: businessPaths.length,
      descendantsFound: descendants.paths.length,
      perParent: descendants.perParent,
    },
    candidates: candidates.length,
    presentBeforeDelete: existing.length,
    deleted: deleted.length,
    failed,
    stillPresentAfterDelete: stillPresent,
    syntheticFirestoreResidueRemaining: stillPresent.length + failed.length,
    overlapWithMigrationBaseline: 0,
    unattributedCandidates: 0,
    budget,
    decision: stillPresent.length === 0 && failed.length === 0
      ? 'RESIDUE_CLEARED' : 'RESIDUE_REMAINS',
  };
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify({ decision: report.decision, candidates: report.candidates,
  presentBeforeDelete: report.presentBeforeDelete, deleted: report.deleted,
  syntheticFirestoreResidueRemaining: report.syntheticFirestoreResidueRemaining,
  resolution: { derivedBusinessIds: report.resolution.businessIdsDerivedByRead,
    descendantsFound: report.resolution.descendantsFound },
  budget: report.budget, report: REPORT }, null, 2));
process.exitCode = report.decision === 'RESIDUE_CLEARED' ? 0 : 1;
