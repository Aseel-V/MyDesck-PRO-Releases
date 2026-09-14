# Hybrid Firebase + Supabase Storage — HARD BLOCKER

Date: **2026-09-14**. Evidence: `migration/reports/hybrid-storage-auth-probe.json`,
reproducible via `node migration/firestore/tools/hybrid-storage-auth-probe.mjs`.
Read-only; no bytes read, written or deleted; `productionMutations: 0`.

**Decision: `HYBRID_STORAGE_AUTH_BLOCKED`.**

The target architecture — Firebase Auth + Firestore + Supabase Storage, with no Supabase
Auth runtime — **cannot work today**. This is a configuration and code gap, not a design
flaw, and it is closable. But it must be closed before any cutover planning continues.

## The finding

Supabase's Storage service verifies the bearer token before RLS is ever consulted. Probing
that verifier with deliberately invalid signatures (a real credential is never needed):

| Token `alg` | HTTP | Message | Algorithm accepted? |
| --- | ---: | --- | --- |
| **RS256** — what Firebase issues | 400 | `"alg" (Algorithm) Header Parameter value not allowed` | **NO** |
| **HS256** — what Supabase issues | 400 | `signature verification failed` | **YES** |
| ES256 | 400 | `"alg" … not allowed` | NO |
| `none` | 400 | `"alg" … not allowed` | NO |

Accepted algorithms: **`HS256` only**. GoTrue external providers: **`["email"]`**.

HS256 is symmetric: the verifier holds the project JWT secret. An RS256 token is rejected at
the header, before any issuer or JWKS check. **Supabase Third-Party Auth for Firebase is not
enabled on this project** — were it enabled, RS256 would be accepted and validated against
Google's JWKS.

## Why this breaks the target architecture

Current private-Storage authorisation depends on Supabase Auth end to end:

- RLS policy: `(storage.foldername(name))[1] = auth.uid()::text`, granted `TO authenticated`
- A RESTRICTIVE policy additionally requires `auth.uid() IS NOT NULL`
- `src/data/SupabaseStorageRepository.ts` calls `supabase.auth.getUser()` and refuses any path
  not prefixed with that user's id

Remove Supabase Auth and every one of those fails:

1. `supabase.auth.getUser()` returns no user → the repository throws `PRIVATE_PATH_DENIED`.
2. Even bypassing the repository, the client would present only the anon key → the request is
   role `anon`, `auth.uid()` is NULL → the RESTRICTIVE policy denies everything.
3. A Firebase ID token cannot substitute: RS256 is refused at the algorithm gate.

## Why the obvious workarounds are not acceptable

| Option | Verdict |
| --- | --- |
| Ship the Supabase JWT secret in Electron and mint HS256 tokens | **Forbidden.** The secret lets any user forge any identity, including `service_role`. An Electron renderer is attacker-controlled. |
| Make the bucket public | **Forbidden.** `business-signatures` holds signature images. Public access is a direct data leak. |
| Mint signed URLs | Requires the `service_role` key, so it needs a trusted server. Spark forbids Cloud Functions/Run. |
| Keep a Supabase Auth session alongside Firebase Auth | Contradicts the stated target ("no Supabase Auth runtime after cutover") and means maintaining two identity systems and two password lifecycles. |
| Move signatures to local-only storage | Changes product behaviour; signatures would stop syncing across devices. Owner decision, not an engineering shortcut. |

## The one viable path

**Enable Supabase Third-Party Auth for Firebase on the project**, then adapt the client.

1. **Operator, Supabase project.** Configure Firebase as a third-party auth provider for
   project `mydesckpro` (Dashboard → Authentication → Third-Party Auth, or
   `[auth.third_party.firebase] project_id = "mydesckpro"` in `supabase/config.toml` for
   self-hosted/CLI-managed config). Verify plan availability for this project before relying
   on it. After enabling, re-run the probe: **RS256 must become an accepted algorithm.**

2. **Code.** Construct the Storage client with a Firebase token provider rather than a
   Supabase session:
   `createClient(url, anonKey, { accessToken: () => auth.currentUser?.getIdToken() ?? null })`.
   Remove `supabase.auth.getUser()` from `SupabaseStorageRepository` and derive the path
   prefix from `auth.currentUser.uid` instead.

3. **RLS.** With third-party auth, `auth.uid()` resolves from the JWT `sub` claim, which is the
   Firebase UID. **This project preserves UIDs** — all 10 accounts are `uidPreserved: true`
   with `sourceTargetUidEqual: true` — so the existing `{uid}/…` folder policies keep matching
   without a data move. Re-verify rather than assume; also confirm the third-party token is
   mapped to the `authenticated` role, since every policy is granted `TO authenticated`.

4. **Prove it.** `HYBRID_STORAGE_GO` requires real synthetic identities: an authorised Firebase
   user reads its own object, a second tenant is denied, anonymous is denied, and upload/delete
   behave per policy — all with **no Supabase Auth session present**.

## Gate status

| Gate | Status | Note |
| --- | --- | --- |
| `hybridStorageAuth` | **FAIL** | HS256-only; Firebase third-party auth not enabled |
| `storageAnonymousDenied` | PASS | anonymous private read denied |
| `storageTenantIsolation` | NOT_RUN | cannot run until `hybridStorageAuth` passes |
| `storageIsolation` | **FAIL** | see below |

## Storage is not yet isolated

The new policy requires every Supabase Storage call to sit behind `StorageRepository`, with no
generic Supabase client reachable from business code. Today **9 of 11** Storage call sites are
outside that boundary:

| File | Storage calls |
| --- | ---: |
| `src/components/Settings.tsx` | 2 |
| `src/components/market/AddProductModal.tsx` | 2 |
| `src/components/ui/FileUpload.tsx` | 2 |
| `src/lib/tripAttachments.ts` | 2 |
| `src/lib/businessImages.ts` | 1 |
| `src/data/SupabaseStorageRepository.ts` *(allowed)* | 2 |

They all import the shared `src/lib/supabase.ts` client, which also exposes `.from()`, `.rpc()`
and `.auth`. Retaining Storage must not retain that surface. Required: a dedicated
`supabaseStorageClient` used only inside the Storage module, and a static import-graph rule
that fails the build if business code reaches a Supabase database, RPC or Auth API.

## Bottom line

Supabase Storage is an intentional, permitted dependency. But **a Firebase-authenticated client
cannot currently reach it at all**, and no secure no-server workaround exists. Until an operator
enables third-party Firebase auth on the Supabase project and the probe shows RS256 accepted,
the hybrid architecture is unproven and `HYBRID_STORAGE_GO` stays `NO_GO`.
