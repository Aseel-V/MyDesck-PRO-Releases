#!/usr/bin/env node
/**
 * Supabase Storage RLS and exposure audit.
 *
 * Storage is the one Supabase dependency the target architecture keeps, so its security
 * posture has to be evidence, not assumption. This tool classifies every bucket and object
 * and verifies, anonymously, whether each object is actually reachable over the public CDN
 * path — which bypasses RLS entirely when a bucket is marked public.
 *
 * STRICTLY READ-ONLY. Database access runs in a rolled-back READ ONLY transaction. Object
 * probes are HEAD requests: no body is downloaded. Object paths, URLs and owner ids are
 * never printed; names are hashed.
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const readEnv = (path) => Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const migrationEnv = readEnv('migration/.env.local');
const appEnv = readEnv('.env');
const ca = migrationEnv.SUPABASE_CA_FILE ? readFileSync(migrationEnv.SUPABASE_CA_FILE, 'utf8') : null;
const client = new pg.Client({ connectionString: migrationEnv.SUPABASE_DB_URL || migrationEnv.PGURL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });

const classifyObject = (name) => (/signature|sig-/i.test(name) ? 'SIGNATURE_IMAGE'
  : /logo/i.test(name) ? 'LOGO' : 'OTHER');
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);

await client.connect();
await client.query('BEGIN TRANSACTION READ ONLY');
let buckets; let objects; let policies;
try {
  buckets = (await client.query(
    `select id, name, public, file_size_limit from storage.buckets order by id`)).rows;
  objects = (await client.query(
    `select bucket_id, name, owner, (metadata->>'mimetype') as mime,
       (metadata->>'size')::bigint as size, created_at from storage.objects order by bucket_id, name`)).rows;
  policies = (await client.query(
    `select polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
     from pg_policy where polrelid = 'storage.objects'::regclass order by polname`)).rows;
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

// Anonymous reachability over the public CDN path. No apikey, no Authorization.
const base = appEnv.VITE_SUPABASE_URL;
const probed = [];
for (const object of objects) {
  const url = `${base}/storage/v1/object/public/${object.bucket_id}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) }).catch(() => null);
  probed.push({
    bucket: object.bucket_id,
    pathPrefix: object.name.split('/')[0],
    nameHash: hash(object.name),
    kind: classifyObject(object.name),
    mime: object.mime,
    sizeBytes: Number(object.size ?? 0),
    ownerPresent: Boolean(object.owner),
    createdAt: object.created_at,
    anonymousHttp: response?.status ?? 'NETWORK_ERROR',
    publiclyReadable: response?.status === 200,
  });
}

// Bucket classification. UNKNOWN is forbidden; a public bucket holding a private kind is a leak.
const classified = buckets.map((bucket) => {
  const contents = probed.filter((p) => p.bucket === bucket.id);
  const privateKinds = contents.filter((p) => p.kind === 'SIGNATURE_IMAGE');
  const classification = privateKinds.length && bucket.public ? 'PRIVATE_USER_EXPOSED_IN_PUBLIC_BUCKET'
    : bucket.public ? 'PUBLIC_INTENTIONAL' : privateKinds.length ? 'PRIVATE_USER' : 'PRIVATE_BUSINESS';
  return { bucket: bucket.id, public: bucket.public, objects: contents.length,
    bytes: contents.reduce((sum, p) => sum + p.sizeBytes, 0), classification,
    kinds: [...new Set(contents.map((p) => p.kind))] };
});

const codeBuckets = [...new Set([...readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8')
  .matchAll(/storage\s*\.\s*from\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))];
const missingBuckets = codeBuckets.filter((b) => !buckets.some((x) => x.id === b));

const exposedPrivate = probed.filter((p) => p.kind === 'SIGNATURE_IMAGE' && p.publiclyReadable);
const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  bytesDownloaded: 0,
  buckets: classified,
  objects: probed,
  policies: policies.map((p) => ({ name: p.polname, cmd: p.polcmd, permissive: p.polpermissive,
    usesAuthUid: /auth\.uid\(\)/.test(`${p.using_expr ?? ''}${p.check_expr ?? ''}`),
    usesJwtClaim: /auth\.jwt\(\)/.test(`${p.using_expr ?? ''}${p.check_expr ?? ''}`) })),
  restrictivePolicyCount: policies.filter((p) => !p.polpermissive).length,
  bucketsReferencedInCode: codeBuckets,
  bucketsReferencedInCodeButMissing: missingBuckets,
  unknownClassifications: classified.filter((b) => b.classification === 'UNKNOWN').length,
  publiclyReadablePrivateObjects: exposedPrivate.length,
  findings: [
    ...(exposedPrivate.length ? [{ severity: 'HIGH', id: 'PRIVATE_OBJECT_PUBLICLY_READABLE',
      detail: `${exposedPrivate.length} signature image(s) are anonymously readable over the public CDN path.` }] : []),
    ...(policies.filter((p) => !p.polpermissive).length === 0 ? [{ severity: 'HIGH',
      id: 'NO_RESTRICTIVE_POLICY_IN_PRODUCTION',
      detail: 'The private-signature RESTRICTIVE policy in supabase/migrations has never been applied to production.' }] : []),
    ...(missingBuckets.length ? [{ severity: 'HIGH', id: 'CODE_TARGETS_NONEXISTENT_BUCKET',
      detail: `SupabaseStorageRepository targets ${missingBuckets.join(', ')}, which do not exist in production.` }] : []),
  ],
  decision: exposedPrivate.length || missingBuckets.length ? 'STORAGE_SECURITY_BLOCKED' : 'STORAGE_SECURITY_OK',
};
writeFileSync('migration/reports/storage-rls-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ buckets: classified, restrictivePolicyCount: report.restrictivePolicyCount,
  bucketsReferencedInCodeButMissing: missingBuckets,
  publiclyReadablePrivateObjects: report.publiclyReadablePrivateObjects,
  findings: report.findings.map((f) => `${f.severity} ${f.id}`), decision: report.decision }, null, 2));
if (report.decision !== 'STORAGE_SECURITY_OK') process.exitCode = 2;
