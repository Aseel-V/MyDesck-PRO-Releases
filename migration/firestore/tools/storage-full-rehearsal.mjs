#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { emulatorToken } from '../lib/rules-client.mjs';

if (process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199') {
  throw new Error('STORAGE_EMULATOR_REQUIRED');
}
const appEnv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const sourceBase = appEnv.VITE_SUPABASE_URL;
if (sourceBase !== 'https://pubugnfaqqukelvgckdr.supabase.co') throw new Error('SOURCE_PROJECT_MISMATCH');
const project = 'mydesck-migration-proof';
const bucket = `${project}.appspot.com`;
const base = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket}/o`;
const privateManifest = [];
const evidence = {};

const source = await withSourceSnapshot(localConfig(), async (select) => {
  const objects = (await select(`SELECT o.id::text AS id, o.bucket_id, o.name,
      o.owner_id::text AS owner_id, o.metadata::text AS metadata,
      o.created_at::text AS created_at, o.updated_at::text AS updated_at,
      b.public::text AS public
    FROM storage.objects o JOIN storage.buckets b ON b.id = o.bucket_id
    ORDER BY o.bucket_id, o.name`)).rows;
  const businesses = (await select(`SELECT id::text AS id, user_id::text AS user_id,
      logo_url, signature_url FROM public.business_profiles ORDER BY id`)).rows;
  const menuItems = (await select(`SELECT id::text AS id, business_id::text AS business_id,
      image_url FROM public.restaurant_menu_items WHERE image_url IS NOT NULL ORDER BY id`)).rows;
  return { objects, businesses, menuItems };
}, evidence);

const businessByOwner = new Map(source.businesses.map((row) => [row.user_id, row.id]));
const relation = (object) => {
  const matchingBusiness = source.businesses.find((row) =>
    [row.logo_url, row.signature_url].some((url) => url && String(url).includes(object.name)));
  if (matchingBusiness) {
    const isSignature = matchingBusiness.signature_url
      && String(matchingBusiness.signature_url).includes(object.name);
    return { businessId: matchingBusiness.id, ownerUid: matchingBusiness.user_id,
      kind: isSignature ? 'signatures' : 'logos', relation: isSignature ? 'business_signature' : 'business_logo' };
  }
  const menu = source.menuItems.find((row) => row.image_url && String(row.image_url).includes(object.name));
  if (menu) {
    const businessId = businessByOwner.get(menu.business_id) ?? menu.business_id;
    const ownerUid = source.businesses.find((row) => row.id === businessId)?.user_id ?? menu.business_id;
    return { businessId, ownerUid, kind: 'restaurant', relation: 'restaurant_menu_image' };
  }
  if (object.owner_id && businessByOwner.has(object.owner_id)) {
    return { businessId: businessByOwner.get(object.owner_id), ownerUid: object.owner_id,
      kind: object.bucket_id === 'logos' ? 'logos' : 'restaurant', relation: 'storage_owner' };
  }
  return null;
};

const listResponse = await fetch(base, { headers: { Authorization: 'Bearer owner' } });
if (listResponse.ok) {
  const listed = await listResponse.json();
  for (const item of listed.items ?? []) {
    await fetch(`${base}/${encodeURIComponent(item.name)}`, { method: 'DELETE',
      headers: { Authorization: 'Bearer owner' } });
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceUrl = (object) => `${sourceBase}/storage/v1/object/public/${encodeURIComponent(object.bucket_id)}/${
  object.name.split('/').map(encodeURIComponent).join('/')}`;
const upload = async (name, bytes, contentType) => {
  const response = await fetch(`${base}?uploadType=media&name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': contentType }, body: bytes,
  });
  if (!response.ok) throw new Error(`STORAGE_EMULATOR_UPLOAD_FAILED:${response.status}`);
};
const download = (name, token) => fetch(`${base}/${encodeURIComponent(name)}?alt=media`, {
  headers: token === 'owner' ? { Authorization: 'Bearer owner' }
    : token ? { Authorization: `Firebase ${token}` } : {},
});

let bytesRehearsed = 0;
let missing = 0;
let shaMismatches = 0;
let relationOrphans = 0;
let privacyFailures = 0;
let signatureObjects = 0;
for (const object of source.objects) {
  let related = relation(object);
  if (!related) {
    relationOrphans += 1;
    related = { businessId: null, ownerUid: null, kind: 'archive',
      relation: 'EXISTING_SOURCE_ORPHAN_ARCHIVED_PRIVATE' };
  }
  const response = await fetch(sourceUrl(object));
  if (!response.ok) {
    missing += 1;
    privateManifest.push({ sourceId: object.id, bucket: object.bucket_id,
      sourceNameHash: sha256(Buffer.from(object.name)), copied: false, reason: `SOURCE_HTTP_${response.status}` });
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = object.metadata ? JSON.parse(object.metadata) : {};
  const contentType = response.headers.get('content-type') ?? metadata.mimetype ?? 'application/octet-stream';
  const safeName = basename(object.name).replace(/[^A-Za-z0-9._-]/g, '_') || 'object';
  const targetName = related.kind === 'archive'
    ? `migration-archive/storage-orphans/${object.id}-${safeName}`
    : `businesses/${related.businessId}/${related.kind}/${object.id}-${safeName}`;
  await upload(targetName, bytes, contentType);
  const targetResponse = await download(targetName, 'owner');
  if (!targetResponse.ok) throw new Error(`STORAGE_EMULATOR_READBACK_FAILED:${targetResponse.status}`);
  const targetBytes = Buffer.from(await targetResponse.arrayBuffer());
  const sourceHash = sha256(bytes);
  const targetHash = sha256(targetBytes);
  if (sourceHash !== targetHash) shaMismatches += 1;
  bytesRehearsed += bytes.length;
  if (related.kind === 'signatures') {
    signatureObjects += 1;
    const ownerToken = emulatorToken(related.ownerUid);
    const otherUid = source.businesses.find((row) => row.user_id !== related.ownerUid)?.user_id
      ?? 'migration-test--storage-other';
    const [ownerRead, otherRead, anonymousRead] = await Promise.all([
      download(targetName, ownerToken), download(targetName, emulatorToken(otherUid)), download(targetName, null),
    ]);
    if (!ownerRead.ok || ![401, 403].includes(otherRead.status)
      || ![401, 403].includes(anonymousRead.status)) privacyFailures += 1;
  }
  if (related.kind === 'archive') {
    const [otherRead, anonymousRead] = await Promise.all([
      download(targetName, emulatorToken('migration-test--storage-other')), download(targetName, null),
    ]);
    if (![401, 403].includes(otherRead.status) || ![401, 403].includes(anonymousRead.status)) {
      privacyFailures += 1;
    }
  }
  privateManifest.push({ sourceId: object.id, bucket: object.bucket_id,
    sourceNameHash: sha256(Buffer.from(object.name)), targetName,
    businessId: related.businessId, relation: related.relation,
    privacy: related.kind === 'signatures' ? 'OWNER_ONLY'
      : related.kind === 'archive' ? 'DENY_ALL' : 'AUTHENTICATED',
    size: bytes.length, mime: contentType,
    sourceSha256: sourceHash, targetSha256: targetHash, copied: true });
}

writeFileSync('migration/full-rehearsal.local/storage-manifest.json',
  JSON.stringify(privateManifest, null, 2) + '\n', { mode: 0o600 });
const finalList = await fetch(base, { headers: { Authorization: 'Bearer owner' } });
const targetItems = finalList.ok ? (await finalList.json()).items ?? [] : [];
const copied = privateManifest.filter((item) => item.copied).length;
const unexpected = Math.max(0, targetItems.length - copied);
const report = {
  generatedAt: new Date().toISOString(),
  status: missing === 0 && unexpected === 0 && shaMismatches === 0
    && privacyFailures === 0 && copied === source.objects.length
    ? 'FULL_STORAGE_REHEARSAL_PASS' : 'BLOCKED',
  sourceSnapshot: { readOnly: evidence.start?.read_only === 'on',
    isolation: evidence.start?.isolation, writes: evidence.successfulWrites,
    transactionOutcome: evidence.transactionOutcome },
  storage: { sourceObjects: source.objects.length, manifested: privateManifest.length,
    copied, bytesRehearsed, missing, unexpected, shaMismatches,
    existingSourceOrphans: relationOrphans, migrationCreatedOrphans: 0,
    signatureObjects, privacyFailures,
    privacy: privacyFailures === 0 ? 'PASS' : 'FAIL' },
  productionWrites: 0,
};
writeReport('migration/reports/firestore-full-storage.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'FULL_STORAGE_REHEARSAL_PASS' ? 0 : 1;
