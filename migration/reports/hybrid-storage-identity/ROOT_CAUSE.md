# Hybrid Storage identity — root cause

Measured 2026-09-17 against production `mydesckpro` and the live Supabase project. Nothing here is
taken from the earlier architecture reports; every claim is a measurement from this session.

## Verdict

The application code was never the problem. Two separate faults were found, one fixed and one that
cannot be fixed from this repository.

| Fault | Status |
| --- | --- |
| Synthetic identities carried no `role: authenticated` claim | **FIXED** — applied with existing operator tooling |
| Storage RLS policy casts the JWT subject to `uuid` | **BLOCKED** — requires a Supabase-side policy change |

## Phase 1 — the runtime path, traced

`src/production-main.tsx` → `registerStorageIdentity(auth)` (`src/data/storageIdentity.ts:17`) →
`bindStorageIdentity(getIdToken, getUid)` → `setStorageAccessTokenProvider`
(`src/data/supabaseStorageClient.ts:44`) → `createClient(url, publishableKey, { accessToken: () => provider() })`
(`supabaseStorageClient.ts:68`) → `getStorageBackend().storage` → Storage API request.

The token itself comes from `FirestoreAuthGateway.getAccessToken()` (`FirestoreAuthGateway.ts:144`),
which returns `user.getIdToken()` — the Firebase ID token.

**The Firebase ID token IS supplied to the Supabase client.** supabase-js is 2.89.0 and the
`accessToken` callback is the supported third-party pattern. It is a callback, not a cached string,
so a rotated Firebase token is picked up on the next request. The client is created with
`persistSession: false, autoRefreshToken: false, detectSessionInUrl: false`, only the `storage`
handle is exported, and no `SupabaseClient` escapes the module.

**`clientPassesFirebaseToken: false` in `hybrid-storage-auth-probe.json` (2026-09-14) is stale.** The
wiring exists in the current runtime code. No change was needed and none was made.

## Phase 2 — the fix that was needed

Supabase Third-Party Auth requires the presented JWT to carry `role: authenticated`, or every RLS
predicate denies. Firebase does not add that claim; `migration/firestore/tools/supabase-role-claim.mjs`
exists precisely to apply it outside the shipped app.

The previous smoke created its synthetic identities with a plain client-SDK `signUp`, which does not
carry the claim. That is why the earlier diagnostic showed `own=400, wrongUser=400, anonymous=400,
wrongTenant=400` — a uniform refusal with no discrimination between identities.

Measured before and after, on a freshly created synthetic identity:

| | |
| --- | --- |
| token before claim | `hasRoleAuthenticated: false` |
| token after `--mode=apply` + forced refresh | `hasRoleAuthenticated: true` |
| issuer | `https://securetoken.google.com/mydesckpro` |
| audience | `mydesckpro` |
| algorithm | `RS256` |

The token value was never printed, stored or returned; only these metadata fields and a hashed
subject fingerprint. Firebase rotates the token, so `getIdToken(true)` is required after the claim is
applied for the new claim to appear.

## Phase 3/4 — what the RLS policy actually does

With the claim in place, **13 of 17** probe assertions passed, including every denial:

- wrong user read, overwrite and delete — DENIED
- cross-tenant listing — DENIED
- anonymous API access — DENIED
- anonymous public/CDN access — DENIED

The remaining four failures were all one error:

```
invalid input syntax for type uuid: "uRDZq1DPgYNzRbXifyoRpb70GXH2"
```

That is a PostgreSQL type error, not an RLS refusal. A follow-up isolation run
(`uuid-isolation.json`) separated the operations:

| Operation | Identity | Result |
| --- | --- | --- |
| list own prefix | synthetic owner (Firebase) | `invalid input syntax for type uuid` |
| list owner prefix | other synthetic user (Firebase) | `invalid input syntax for type uuid` |
| list owner prefix | anonymous, no token | **no error**, 0 rows |
| upload to own prefix | synthetic owner (Firebase) | `invalid input syntax for type uuid` |

This is conclusive. The policy fails on **every** operation, SELECT included, whenever a JWT is
presented whose `sub` is not UUID-shaped. With no token at all the cast is never reached, so the
anonymous case returns a clean empty result — which is why anonymous "succeeds" with zero rows and
is not a security hole.

**Root cause: the `business-signatures` Storage RLS policy compares the subject as a `uuid`.**
Supabase Auth user ids are UUIDs; Firebase UIDs are 28-character alphanumeric strings
(`UNBmktvsAGhDucqBJ9e1Hm0NmhE3`). No Firebase identity can ever satisfy a uuid cast, so no Firebase
user can read or write their own signature.

## Why this cannot be fixed here

The remedy is on the Supabase side: compare the subject as text rather than casting to `uuid` — for
example `(storage.foldername(name))[1] = auth.jwt() ->> 'sub'` instead of `= auth.uid()::uuid`, or
the equivalent `owner_id`-based form on a current storage schema.

That is a **type correction, not a weakening**: it preserves the identical ownership predicate, keeps
the bucket private, and keeps every denial intact. But it is a Supabase database change, and this
repository holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — there is no connection
string, no service-role key and no dashboard access here, by design. Nothing in the app, the
Electron bundle or the Rules can work around it, and no workaround should be attempted: making the
bucket public, adding a public-URL fallback, shipping a service-role key or relaxing the predicate
are all explicitly out of bounds and were not done.

## Note on `HYBRID_STORAGE_AUTH_GO`

That gate reports GO on 5/5. It measures whether Supabase *accepts the Firebase token algorithm*
(RS256 third-party auth), which is true and remains true. It does not measure whether an authorized
Firebase identity can actually read its own object, which is false. The gate is not wrong about what
it checks; it is narrower than the end-to-end property the production smoke requires.

## Operator action

1. Update the `business-signatures` Storage RLS policy so the owner comparison is text-based against
   the JWT subject instead of a `uuid` cast. Do not make the bucket public and do not drop the
   ownership predicate.
2. Re-run `scripts/hybrid-storage-identity-probe.mjs` and require 17/17.
3. Re-run the full production client smoke and require 10/10.

---

## Update after the operator's RLS change (2026-09-17)

The policy correction landed for **SELECT, INSERT and UPDATE**. It did **not** land for **DELETE**.

Probe result: **17/20**, twice, with identical failures.

Now working that previously failed:

- authorized owner upload — PASS
- authorized owner read — PASS
- content/checksum matches what was written — PASS
- authorized owner overwrite call — returns success

Still failing:

```
authorized owner delete: invalid input syntax for type uuid: "iEBkidYfU2dww5S8KnWZY974ow33"
```

Attempted twice in the same run, same error both times, 0 objects removed. The refusal is
deterministic, so the DELETE policy on `business-signatures` still carries the `uuid` cast the other
three verbs no longer have. Every denial remains correctly enforced: wrong-user read, overwrite and
delete, cross-tenant listing, anonymous API and anonymous CDN.

One unresolved secondary observation: the overwrite call reports success, but re-reading the object
returns the original 67 bytes rather than the new 68, even with `cacheControl: '0'`. That could be
edge caching or the update not landing; it was **not** re-tested, because each probe run leaves an
object that cannot be deleted, and re-running would add more residue. Re-check it once DELETE works.

### Residue this created

Two synthetic objects are orphaned in `business-signatures`, one per probe run, because the owner
could not delete them and the owning synthetic accounts are gone:

- `iEBkidYfU2dww5S8KnWZY974ow33/migration-test--hybrid-probe-mu5y5wd2-signature.png` (exact path)
- one object under prefix `0nN1TX2bwQYMW5LYqo1KU0Ip3z03/` from the preceding run

They are synthetic, contain a 1x1 PNG, and touch no customer data. They cannot be removed from this
repository: there is no service-role key and no dashboard access here, and the DELETE policy refuses
the owning identity. They will be removable by the owner path as soon as the DELETE policy is
corrected, or immediately from the Supabase dashboard.

### Operator action

Apply the same `auth.jwt() ->> 'sub'` comparison to the **DELETE** policy on `business-signatures`
that was applied to SELECT, INSERT and UPDATE. Then remove the two orphaned objects above and
re-run `scripts/hybrid-storage-identity-probe.mjs`, requiring 20/20 and `uuidErrorPresent: false`.
