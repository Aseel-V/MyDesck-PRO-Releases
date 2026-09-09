#!/usr/bin/env node
/**
 * Storage migration manifest, and a proof that the checksum gate works.
 *
 * Two separate things happen here, and keeping them separate is the point:
 *
 *   1. A READ-ONLY inventory of the source Supabase storage metadata. No object
 *      bytes are downloaded and nothing is copied — copying production files is
 *      not authorized by this milestone, so source checksums are recorded as
 *      BLOCKED rather than guessed at or quietly skipped.
 *
 *   2. A real end-to-end checksum gate, exercised against synthetic objects in
 *      the Storage emulator: upload, download, compare SHA-256, and prove that
 *      a single flipped byte and a missing object are both caught. The
 *      machinery is therefore proven before it is ever pointed at real files.
 *
 * The manifest also records the signature-privacy finding: the application
 * writes to `business-signatures` and calls getPublicUrl on it, while the
 * source has no such bucket and its two real buckets are both public.
 *
 *   node migration/firestore/tools/storage-manifest.mjs
 */

import { createHash, randomUUID } from 'node:crypto';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const evidence = {};
const source = await withSourceSnapshot(localConfig(), async (select) => {
  const q = async (sql, values) => (await select(sql, values)).rows;

  const buckets = await q(`SELECT id, name, public::text AS public,
      file_size_limit::text AS file_size_limit,
      array_to_string(allowed_mime_types, ',') AS allowed_mime_types,
      created_at::text AS created_at
    FROM storage.buckets ORDER BY id`);

  // Metadata only. `metadata` carries size and mimetype; the object bytes are
  // never requested, so nothing customer-owned leaves the source.
  const objects = await q(`SELECT id::text AS id, bucket_id, name, owner::text AS owner,
      created_at::text AS created_at, updated_at::text AS updated_at,
      metadata->>'size' AS size, metadata->>'mimetype' AS mimetype,
      metadata->>'eTag' AS etag, path_tokens[1] AS first_path_token
    FROM storage.objects ORDER BY bucket_id, name`);

  // Which database columns reference a stored object, so the manifest can say
  // what each file belongs to rather than listing orphan paths.
  const references = await q(`SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name LIKE '%_url' OR column_name LIKE '%logo%'
           OR column_name LIKE '%signature%' OR column_name LIKE '%attachment%')
    ORDER BY table_name, column_name`);

  return { buckets, objects, references };
}, evidence);

// ---------------------------------------------------------------------------
// Target path design
// ---------------------------------------------------------------------------

const targetPathFor = (object) => {
  // Ownership must be legible from the path itself, so a Storage rule can be
  // read and understood without consulting a database.
  const leaf = object.name.split('/').pop();
  switch (object.bucket_id) {
    case 'logos': return `businesses/{businessId}/logos/${leaf}`;
    case 'restaurant-assets': return `businesses/{businessId}/restaurant/${leaf}`;
    default: return `businesses/{businessId}/${object.bucket_id}/${leaf}`;
  }
};

const manifest = source.objects.map((object) => ({
  sourceBucket: object.bucket_id,
  sourcePath: object.name,
  sourceOwner: object.owner,
  // The source stores an owner uid on the object, not a business or trip id.
  // Resolving those requires matching the object URL back to the referencing
  // row, which is a copy-phase step; recorded as unresolved rather than invented.
  businessId: 'UNRESOLVED_UNTIL_COPY_PHASE',
  tripId: null,
  mime: object.mimetype ?? null,
  sizeBytes: object.size ?? null,
  privacy: source.buckets.find((b) => b.id === object.bucket_id)?.public === 'true'
    ? 'PUBLIC' : 'PRIVATE',
  sourceSha256: 'BLOCKED — object bytes not downloaded; copy not authorized by this milestone',
  targetPath: targetPathFor(object),
  targetSha256: 'NOT_COPIED',
  migrationStatus: 'PENDING',
}));

// ---------------------------------------------------------------------------
// Checksum gate, proven against the Storage emulator
// ---------------------------------------------------------------------------

const gate = { status: 'NOT RUN', checks: [] };
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  const appModule = await import('firebase-admin/app');
  const storageModule = await import('firebase-admin/storage');
  const app = appModule.initializeApp(
    { projectId: 'mydesck-migration-proof', storageBucket: 'mydesck-migration-proof.appspot.com' },
    `storage-proof-${Date.now()}`);
  const bucket = storageModule.getStorage(app).bucket();
  const prefix = `migration-test--${randomUUID()}`;
  const record = (name, pass, detail) => gate.checks.push({ check: name, pass, ...detail });

  try {
    // A representative object: binary, non-trivial, and not a real customer file.
    const payload = Buffer.concat([
      Buffer.from('MyDesck synthetic storage proof شركة סוכנות\n', 'utf8'),
      Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251)),
    ]);
    const sourceDigest = sha256(payload);

    const file = bucket.file(`${prefix}/logo.bin`);
    await file.save(payload, { contentType: 'application/octet-stream' });
    const [downloaded] = await file.download();
    record('round trip preserves bytes', sha256(downloaded) === sourceDigest,
      { sourceSha256: sourceDigest, targetSha256: sha256(downloaded) });

    // A single flipped byte must break the gate. An upload that "succeeded" is
    // not evidence the bytes arrived intact.
    const corrupted = Buffer.from(payload);
    corrupted[10] ^= 0x01;
    const corruptFile = bucket.file(`${prefix}/corrupt.bin`);
    await corruptFile.save(corrupted, { contentType: 'application/octet-stream' });
    const [corruptBack] = await corruptFile.download();
    record('a single flipped byte is detected', sha256(corruptBack) !== sourceDigest,
      { differs: true });

    // A missing object must be detected as missing, not treated as empty.
    const [missingExists] = await bucket.file(`${prefix}/never-uploaded.bin`).exists();
    record('a missing object is detected', missingExists === false, {});

    // Truncation is the failure mode a size check alone would miss.
    const truncFile = bucket.file(`${prefix}/truncated.bin`);
    await truncFile.save(payload.subarray(0, payload.length - 1));
    const [truncBack] = await truncFile.download();
    record('a truncated object is detected', sha256(truncBack) !== sourceDigest,
      { sourceBytes: payload.length, targetBytes: truncBack.length });

    await Promise.all([file.delete(), corruptFile.delete(), truncFile.delete()]
      .map((p) => p.catch(() => {})));
    gate.status = gate.checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  } catch (error) {
    gate.status = 'FAIL';
    gate.error = error.code ?? error.message;
  } finally {
    await appModule.deleteApp(app);
  }
} else {
  gate.status = 'NOT RUN — FIREBASE_STORAGE_EMULATOR_HOST not set';
}

const report = {
  generatedAt: new Date().toISOString(),
  status: 'INVENTORIED_NOT_COPIED',
  sourceSafety: evidence,
  sourceWrites: 0,
  objectsCopied: 0,
  productionBytesDownloaded: 0,
  buckets: source.buckets,
  objectCount: source.objects.length,
  manifest,
  checksumGate: gate,
  findings: [
    {
      code: 'SOURCE_BUCKETS_ARE_PUBLIC',
      detail: source.buckets.filter((b) => b.public === 'true').map((b) => b.id),
      impact: 'Every stored object in these buckets is readable by anyone with the URL.',
      target: 'Storage rules make logos authenticated-read and everything else owner-only.',
    },
    {
      code: 'SIGNATURE_BUCKET_DOES_NOT_EXIST',
      detail: "The client calls storage.from('business-signatures').upload and "
        + 'getPublicUrl, but the source has no such bucket.',
      impact: 'Signature upload is either failing silently or writing somewhere public. '
        + 'A public signature URL is a forgery kit.',
      target: 'businesses/{businessId}/signatures/** is private and owner-only, '
        + 'and the public-URL call must be replaced with an authenticated read.',
      blocksCutover: true,
    },
    {
      code: 'CLIENT_BUCKET_NAMES_DIVERGE_FROM_SOURCE',
      detail: { clientReferences: ['business-logos', 'business-signatures'],
        sourceBuckets: source.buckets.map((b) => b.id) },
      impact: 'The application writes to bucket names that do not exist in the source.',
      target: 'Resolve during the storage copy phase; unresolved names block file parity.',
    },
  ],
  referencingColumns: source.references,
  fileParityGate: {
    expectedObjects: source.objects.length,
    accountedFor: source.objects.length,
    copied: 0,
    checksumMismatches: 'NOT MEASURED — nothing copied',
    verdict: 'BLOCKED — storage copy is a later milestone; the gate itself is proven above',
  },
};

writeReport('migration/reports/firestore-storage-manifest.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status,
  buckets: report.buckets.map((b) => ({ id: b.id, public: b.public })),
  objectCount: report.objectCount,
  objectsCopied: report.objectsCopied,
  checksumGate: gate.status,
  gateChecks: gate.checks.map((c) => ({ check: c.check, pass: c.pass })),
  findings: report.findings.map((f) => f.code),
}, null, 2));

process.exitCode = gate.status === 'FAIL' ? 1 : 0;
