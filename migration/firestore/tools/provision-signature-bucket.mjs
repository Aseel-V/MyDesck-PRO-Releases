#!/usr/bin/env node
/**
 * Provisions the private `business-signatures` bucket and its Storage RLS.
 *
 * The signature currently lives under a path prefix inside the PUBLIC `logos` bucket, where a
 * public bucket is served over the CDN path and RLS is never consulted. This creates the
 * private destination and the narrow policies that protect it. It does NOT move the object and
 * does NOT touch `logos`, whose public state is intentional for business logos.
 *
 * Ownership model is unchanged from the existing one: owner-by-first-path-segment. Supabase
 * resolves `auth.uid()` from the JWT `sub`, so with Third-Party Auth enabled a Firebase token
 * and a Supabase session both satisfy the same predicate - which works because UIDs are
 * preserved across the migration. `auth.uid()` returns uuid, so identities must be UUIDs.
 *
 *   --mode=plan   (default) print the exact statements and current state, change nothing
 *   --mode=apply  create the bucket and policies
 *
 * Rollback is printed on every run. Nothing here deletes or modifies an existing object.
 */
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';

const BUCKET = 'business-signatures';
const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'plan';
if (!['plan', 'apply'].includes(mode)) throw Error('UNSUPPORTED_MODE');

const env = Object.fromEntries(readFileSync('migration/.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const ca = env.SUPABASE_CA_FILE ? readFileSync(env.SUPABASE_CA_FILE, 'utf8') : null;
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL || env.PGURL,
  // Certificate verification is never switched off: without SUPABASE_CA_FILE the system trust store is used.
  ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } });

const owns = `(storage.foldername(name))[1] = auth.uid()::text`;
const POLICIES = [
  ['signatures owner read', `create policy "signatures owner read" on storage.objects
     for select to authenticated using (bucket_id = '${BUCKET}' and ${owns})`],
  ['signatures owner insert', `create policy "signatures owner insert" on storage.objects
     for insert to authenticated with check (bucket_id = '${BUCKET}' and ${owns})`],
  ['signatures owner update', `create policy "signatures owner update" on storage.objects
     for update to authenticated using (bucket_id = '${BUCKET}' and ${owns})
     with check (bucket_id = '${BUCKET}' and ${owns})`],
  ['signatures owner delete', `create policy "signatures owner delete" on storage.objects
     for delete to authenticated using (bucket_id = '${BUCKET}' and ${owns})`],
  // Restrictive: whatever else is ever granted, this bucket is never anonymous.
  ['signatures never anonymous', `create policy "signatures never anonymous" on storage.objects
     as restrictive for all to public
     using (bucket_id <> '${BUCKET}' or auth.uid() is not null)`],
];

await client.connect();
const state = async () => {
  const bucket = (await client.query('select id, public from storage.buckets where id = $1', [BUCKET])).rows[0] ?? null;
  const policies = (await client.query(
    `select polname, polpermissive from pg_policy where polrelid = 'storage.objects'::regclass
       and polname like 'signatures %' order by polname`)).rows;
  const logos = (await client.query(`select id, public from storage.buckets where id = 'logos'`)).rows[0] ?? null;
  return { bucket, policies: policies.map((p) => ({ name: p.polname, restrictive: !p.polpermissive })), logos };
};

const before = await state();
let applied = [];
try {
  if (mode === 'apply') {
    // Refuse to touch anything that already holds objects; this tool only ever creates.
    const existing = (await client.query('select count(*)::int as n from storage.objects where bucket_id = $1', [BUCKET])).rows[0].n;
    if (before.bucket && existing > 0) throw Error('BUCKET_ALREADY_HAS_OBJECTS_REFUSING');
    await client.query('BEGIN');
    if (!before.bucket) {
      await client.query(
        `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
         values ($1, $1, false, 5242880, array['image/png','image/jpeg'])
         on conflict (id) do nothing`, [BUCKET]);
      applied.push(`bucket:${BUCKET}`);
    }
    for (const [name, sql] of POLICIES) {
      if (before.policies.some((p) => p.name === name)) continue;
      await client.query(sql);
      applied.push(`policy:${name}`);
    }
    await client.query('COMMIT');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
}
const after = await state();
await client.end();

const report = {
  generatedAt: new Date().toISOString(),
  mode,
  bucket: BUCKET,
  before, after,
  applied,
  logosPublicUnchanged: before.logos?.public === after.logos?.public,
  bucketIsPrivate: after.bucket ? after.bucket.public === false : null,
  restrictivePolicyPresent: after.policies.some((p) => p.restrictive),
  policyCount: after.policies.length,
  objectsTouched: 0,
  statements: POLICIES.map(([, sql]) => sql.replace(/\s+/g, ' ').trim()),
  rollback: [
    ...POLICIES.map(([name]) => `drop policy "${name}" on storage.objects;`),
    `delete from storage.buckets where id = '${BUCKET}';  -- only while empty`,
  ],
  decision: after.bucket && after.bucket.public === false && after.policies.length === POLICIES.length
    ? 'SIGNATURE_BUCKET_READY' : mode === 'plan' ? 'PLAN_ONLY' : 'INCOMPLETE',
};
writeFileSync('migration/reports/signature-bucket-provision.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ mode, applied, bucketIsPrivate: report.bucketIsPrivate,
  policyCount: report.policyCount, restrictivePolicyPresent: report.restrictivePolicyPresent,
  logosPublicUnchanged: report.logosPublicUnchanged, objectsTouched: 0,
  decision: report.decision }, null, 2));
