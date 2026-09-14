# Signature storage remediation — prepared, NOT executed

Date: **2026-09-14**. Evidence: `migration/reports/storage-rls-audit.json`
(`node migration/firestore/tools/storage-rls-audit.mjs`).

**Status: BLOCKED ON OPERATOR CREDENTIAL. The exposure is unchanged and the object is intact.**

No bucket was created, no object copied, nothing deleted. Object paths, business identity and
signature contents appear nowhere in this repository.

## Confirmed current state

| Check | Result |
| --- | --- |
| `logos` bucket exists | **Yes**, `public: true` |
| `business-signatures` private bucket exists | **No** |
| Exposed signature object still exists | **Yes** — `image/jpeg`, 146,338 bytes |
| Duplicate private copy already exists | **No** |
| Anonymous readability | **HTTP 200** with no apikey and no `Authorization` |
| RESTRICTIVE policies in production | **0** |
| `restaurant-assets` | `public: true`, 1 object, classified `PUBLIC_INTENTIONAL` |

The signature lives under the `business-signatures/` **path prefix inside the public `logos`
bucket**. Because the bucket is public, Supabase serves it over the CDN path and RLS is never
consulted — which is why the carefully written `auth.uid()` policies do not help.

## Why it was not executed

Copying a Storage object moves **bytes in S3**, not just a row: `storage.objects` is metadata,
so the copy cannot be done in SQL even though this session is `postgres` with
`storage.buckets INSERT` and `storage.objects INSERT/DELETE` privileges.

The Storage API copy requires one of:

- the **`service_role` key** — not present anywhere in the repository or environment, and
  correctly so; or
- an **authenticated session as the owning customer** — impossible and improper.

Probed capability: the anon key carries `role: anon`, and the `logos` INSERT/UPDATE policies are
granted `TO {authenticated}`, so this session cannot write to Storage at all. That is the correct
posture; it simply means the copy is an operator action.

**Deliberately not attempted:** minting a `service_role` JWT from the project secret. That would
mean handling a credential able to impersonate any identity, to fix a data-exposure bug. The cure
would be worse than the disease.

## Prepared remediation

Run in this exact order. **Do not delete the source until step 8 passes.**

### 1. Create the private bucket

Dashboard → Storage → New bucket → name `business-signatures` → **Public: OFF**.

Or, with a `service_role` connection:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-signatures', 'business-signatures', false, 5242880,
        array['image/png','image/jpeg'])
on conflict (id) do nothing;
```

### 2. Policies — preserve the existing ownership model

The current model is owner-by-path-prefix. Keep it: UIDs are preserved across the migration, so
the same predicate holds before and after Firebase cutover. Once Supabase Third-Party Auth for
Firebase is enabled, `auth.uid()` resolves from the Firebase token's `sub` claim, which is the
same UID.

```sql
create policy "signatures owner read" on storage.objects for select to authenticated
  using (bucket_id = 'business-signatures'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "signatures owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-signatures'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "signatures owner update" on storage.objects for update to authenticated
  using (bucket_id = 'business-signatures'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'business-signatures'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "signatures owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-signatures'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Belt and braces: nothing anonymous ever reaches this bucket, whatever else is granted.
create policy "signatures never anonymous" on storage.objects as restrictive for all to public
  using (bucket_id <> 'business-signatures' or auth.uid() is not null);
```

**Rollback:** `drop policy "<name>" on storage.objects;` for each, then
`delete from storage.buckets where id = 'business-signatures';` — only while the bucket is empty.

### 3. Copy the object

Target path **`{ownerUid}/{filename}`**, matching the folder-prefix policy and the path model
`SupabaseStorageRepository.authorize()` already enforces. Note this is a **layout change**: the
current object sits at `business-signatures/<file>` inside `logos`, whereas the new bucket
expects `<uid>/<file>`.

### 4. Checksum gate — mandatory

Record source and target **SHA-256** and byte length. **If they differ, STOP and do not delete
the source.** Write the migration record with fingerprints only — source/target bucket, path
*hashes*, sizes, checksums, status — never raw paths that identify a customer.

### 5. Repoint the stored reference

`business_profiles.signature_url` must point at the private bucket. The application already
understands this: `businessImageReference()` parses both `logos` and `business-signatures`, and
`resolveBusinessImage()` routes `business-signatures` through
`SupabaseStorageRepository.readPrivateFile()` — an authenticated download, never a public URL.

### 6–8. Verify before deleting

6. Authenticated owner read of the private object succeeds.
7. Anonymous read of the private object is denied.
8. A different tenant is denied.

### 9. Only now, remove the public copy

### 10. Confirm the old public URL no longer returns the object

Then re-run `node migration/firestore/tools/storage-rls-audit.mjs`; it must report
`publiclyReadablePrivateObjects: 0` and `STORAGE_SECURITY_OK`.

## Application readiness — already done

The code path this remediation depends on is in place and typechecks:

- `src/data/supabaseStorageClient.ts` — a Storage-only client; the `SupabaseClient` is never
  exported, so no database, RPC or Auth surface is reachable through it.
- `src/data/SupabaseStorageRepository.ts` — `SIGNATURE_BUCKET = 'business-signatures'`, and
  `publicUrl()` **throws `SIGNATURES_ARE_NEVER_PUBLIC`** if asked for a public URL of that bucket.
- All **9** previously loose Storage call sites now route through the repository;
  `storage-isolation-guard.mjs` reports `STORAGE_ISOLATION_GO`.
- `src/components/Settings.tsx` uploads logos to the `logos` bucket explicitly, so logos stay
  intentionally public and are not caught up in the signature change.

## Sequencing note

The private bucket works today under Supabase Auth. It keeps working after the Firebase cutover
**only if** Supabase Third-Party Auth for Firebase is enabled first — otherwise `auth.uid()` is
null for a Firebase-authenticated client and every policy above denies. See
`HYBRID_FIREBASE_SUPABASE_STORAGE.md`. Either order is safe for the data; doing Storage first
simply means signatures are briefly reachable only through the Supabase-Auth app, which is the
app that is live today.
