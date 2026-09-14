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


---

# UPDATE 2026-09-14 — operator access, config hazard, and a live exposure

## 1. The operator DOES have Supabase management access

The Supabase CLI is authenticated and `MyDesckPRO` (`pubugnfaqqukelvgckdr`, ACTIVE_HEALTHY) is
linked. So third-party auth is configurable without a dashboard visit in principle.

## 2. But `supabase config push` must NOT be used for it

`supabase config diff` reports **10 differences** between local `config.toml` and live
production. `config push` applies the whole local config, so enabling third-party auth that way
would also apply every one of these:

| Setting | Local | **Live production** | Effect of a push |
| --- | --- | --- | --- |
| `auth.mfa.totp.enroll_enabled` | `false` | **`true`** | **disables MFA enrollment** |
| `auth.mfa.totp.verify_enabled` | `false` | **`true`** | **disables MFA verification** |
| `auth.sms.twilio.enabled` | `false` | **`true`** | disables SMS |
| `auth.email.max_frequency` | `1s` | `1m0s` | weakens rate limiting |
| `auth.email.otp_expiry` | 3600 | 86400 | changes OTP lifetime |
| `auth.site_url` | `http://127.0.0.1:5173` | `http://localhost:3000` | points production at a dev URL |
| `auth.additional_redirect_urls` | `["https://127.0.0.1:3000"]` | `[]` | adds a redirect target |
| `db.pooler.default_pool_size` | 20 | 15 | changes pooling |
| `db.pooler.max_client_conn` | 100 | 200 | halves client connections |
| `storage.vector.enabled` | `true` | `false` | enables a storage feature |

**Enable third-party auth surgically instead** — Dashboard, or a Management API PATCH of that
field alone. Exact steps:

> Supabase Dashboard → project **MyDesckPRO** → **Authentication** → **Third-Party Auth** →
> **Add provider** → **Firebase** → Firebase project ID **`mydesckpro`** → Save.

The Firebase project ID is verified against the live project inventory
(`projects/mydesckpro/databases/default`), not assumed.

Afterwards re-run `node migration/firestore/tools/hybrid-storage-auth-probe.mjs`.
**RS256 must move from rejected to accepted.** Until it does, the gate stays NO_GO.

## 3. The role claim is already satisfied

`node migration/firestore/tools/supabase-role-claim.mjs --mode=verify` →
**`ROLE_CLAIM_READY`**. All 5 Firebase users carry `{"role":"authenticated"}`, and
`migration/tools/lib/auth-classify.mjs` already builds every import record with that claim, so
future imports inherit it. `supabase-role-claim.mjs --mode=apply` exists for repair: it merges
rather than overwrites custom claims, and refuses non-synthetic accounts without an exact
approval string. **Production claim writes so far: 0.**

Note for the synthetic test: a custom claim reaches a client only on the next ID-token refresh,
so the test must force a refresh before asserting.

## 4. HIGH — a signature image is publicly readable in production, right now

`node migration/firestore/tools/storage-rls-audit.mjs` → **`STORAGE_SECURITY_BLOCKED`**.

| Bucket | Public | Objects | Bytes | Classification |
| --- | --- | ---: | ---: | --- |
| `logos` | **true** | 2 | 438,670 | **PRIVATE_USER_EXPOSED_IN_PUBLIC_BUCKET** |
| `restaurant-assets` | **true** | 1 | 0 | PUBLIC_INTENTIONAL |

Anonymous `HEAD` requests — no apikey, no `Authorization` — return **HTTP 200** for all three
objects, including a **146,338-byte signature image** (`image/jpeg`) stored under the
`business-signatures/` prefix inside the **public** `logos` bucket.

Three HIGH findings:

- **`PRIVATE_OBJECT_PUBLICLY_READABLE`** — the signature is anonymously downloadable.
- **`NO_RESTRICTIVE_POLICY_IN_PRODUCTION`** — production has **0** RESTRICTIVE policies. The
  repo migration `20260908092000_private_business_signatures.sql`, which creates the private
  buckets and the `Business image boundary` RESTRICTIVE policy, has **never been applied**.
- **`CODE_TARGETS_NONEXISTENT_BUCKET`** — `SupabaseStorageRepository` targets
  `business-signatures`, which **does not exist**. `Settings.tsx` likewise uploads to
  `business-logos`, also absent. Both are only path prefixes inside `logos`.

A `public: true` bucket serves objects over the CDN path and **bypasses RLS entirely**, so the
carefully written `auth.uid()` policies never engage for these objects.

**Not remediated here.** Making `logos` private would immediately break logo rendering in the
shipped app, which builds public URLs. Suggested order, for owner approval: create a private
`business-signatures` bucket → copy the signature object → repoint `businessImages.ts` and
`Settings.tsx` at authenticated/signed reads → delete the public copy → apply the RESTRICTIVE
policy. Logos may remain public if that is intended.

This also **invalidates a planning assumption**: the hybrid Storage design cannot be proven
against a private bucket that does not exist. Bucket layout must be settled before the
end-to-end Firebase→Storage test is meaningful.

## 5. Storage isolation — enforced statically, currently failing

`node migration/firestore/tools/storage-isolation-guard.mjs` → **`STORAGE_ISOLATION_NO_GO`**.

- Storage call sites total **11**; inside the allowlist **2**; **outside 9**:
  `Settings.tsx` 2 · `market/AddProductModal.tsx` 2 · `ui/FileUpload.tsx` 2 ·
  `lib/tripAttachments.ts` 2 · `lib/businessImages.ts` 1
- `SupabaseStorageRepository.ts` still imports the shared general-purpose client, inheriting
  `.from()`, `.rpc()` and `.auth`.

New infrastructure landed for this: `src/data/supabaseStorageClient.ts` creates the client with
an injected `accessToken` provider and exports **only** `StorageBackend` — the `storage` handle.
The `SupabaseClient` itself is never exported, so business code cannot widen it back into a
database client. During the Supabase-Auth era the provider yields the Supabase token; after
cutover it yields `firebaseUser.getIdToken()`.

The remaining 9 call sites were **deliberately not rewired yet**: they upload to
`business-logos` / `business-signatures`, and the correct target buckets are unresolved pending
the exposure remediation in §4. Rewiring now would bake in the wrong bucket layout.

## 6. Current gate status

| Gate | Status |
| --- | --- |
| `hybridStorageAuth` | **FAIL** — HS256 only; third-party Firebase auth not enabled |
| `supabaseRoleClaim` | **PASS** — `ROLE_CLAIM_READY`, 5/5 |
| `storageRlsAudit` | **FAIL** — 3 HIGH findings |
| `storageAnonymousDenied` | PASS (private-bucket API path) |
| `storageTenantIsolation` | NOT_RUN — blocked by `hybridStorageAuth` |
| `storageIsolation` | **FAIL** — 9 call sites outside the allowlist |

`HYBRID_STORAGE_AUTH_GO` = **NO_GO**. `STORAGE_ISOLATION_GO` = **NO_GO**.


---

# VERIFICATION 2026-09-14 (finalization attempt) — STILL NOT ENABLED

The owner was asked to enable Supabase Dashboard -> Authentication -> Third-Party Auth -> Firebase
for project `mydesckpro`. **That change has not taken effect.** Verified three independent ways.

## 1. Algorithm allowlist — unchanged

`node migration/firestore/tools/hybrid-storage-auth-probe.mjs`

| Token `alg` | HTTP | Message | Accepted |
| --- | ---: | --- | --- |
| **RS256** (Firebase) | 400 | `"alg" (Algorithm) Header Parameter value not allowed` | **NO** |
| HS256 (Supabase) | 400 | `signature verification failed` | YES |
| ES256 | 400 | `"alg" ... not allowed` | NO |
| `none` | 400 | `"alg" ... not allowed` | NO |

**Exact rejection class: `AccessDenied` / `Unauthorized` — the RS256 token is refused at the JWT
header, before any issuer, JWKS or signature check.** No token contents were exposed; the probe
sends deliberately invalid signatures and never needs a real credential.

## 2. GoTrue settings — unchanged

`external: ["email"]`. No third-party provider is advertised.

## 3. Remote config — unchanged

`supabase config diff` (read-only) returns the **same 10 differences as the previously captured
baseline, with identical values**. No third-party auth entry appears, and `unmanaged: []`.

## Unrelated Auth settings: NOT CHANGED

Checked explicitly, because drift would itself be a stop condition. Every security-relevant live
value is exactly as captured before:

| Setting | Live value | Baseline | Status |
| --- | --- | --- | --- |
| `auth.mfa.totp.enroll_enabled` | `true` | `true` | unchanged |
| `auth.mfa.totp.verify_enabled` | `true` | `true` | unchanged |
| `auth.sms.twilio.enabled` | `true` | `true` | unchanged |
| `auth.email.max_frequency` | `1m0s` | `1m0s` | unchanged |
| `auth.email.otp_expiry` | `86400` | `86400` | unchanged |
| `auth.site_url` | `http://localhost:3000` | `http://localhost:3000` | unchanged |
| `db.pooler.default_pool_size` | `15` | `15` | unchanged |
| `db.pooler.max_client_conn` | `200` | `200` | unchanged |
| `storage.vector.enabled` | `false` | `false` | unchanged |

MFA, SMS and rate limiting are all still on in production. Nothing was pushed.

## Consequence

Phases 2 through 8 cannot run:

| Phase | Status | Reason |
| --- | --- | --- |
| 2 — Firebase token acceptance | **STOPPED** | RS256 refused at the algorithm header |
| 3 — private bucket + Firebase-UID policies | **NOT DONE** | policies key on `auth.uid()` from the Firebase `sub`; with third-party auth off that is always null, so every policy would deny |
| 4 — synthetic hybrid Storage proof | **NOT RUN** | needs an accepted Firebase token |
| 5 — real signature remediation | **NOT DONE** | gated on Phase 4, and separately on a copy credential |
| 7 — real hybrid smoke | **NOT RUN** | same |
| 8 — exposure final proof | **NOT RUN** | same |

### Why the private bucket was not created anyway

Creating an empty `business-signatures` bucket would have flipped
`signaturePrivateBucketExists` to PASS while the real signature stayed publicly readable — a gate
looking better with no security improvement. It is withheld deliberately until it can be created
together with working policies and a verified copy.

## What the operator still needs to do

1. **Supabase Dashboard -> MyDesckPRO -> Authentication -> Third-Party Auth -> Add provider ->
   Firebase -> Firebase project ID `mydesckpro` -> Save.**
   Then re-run the probe: **RS256 must move to accepted.** That single check is the gate.
   Do **not** use `supabase config push`; it would apply 10 unrelated differences, including
   disabling production MFA.
2. Provide a **least-privileged path for the one-time signature copy** — the Dashboard Storage UI
   is sufficient and keeps the file inside your controlled environment. A `service_role` key is
   still absent here, and was deliberately not synthesised from the project JWT secret.

`HYBRID_STORAGE_AUTH_GO` = **NO_GO**. `SIGNATURE_PRIVACY_GO` = **NO_GO**.
