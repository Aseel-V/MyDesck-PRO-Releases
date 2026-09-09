# Firebase Auth migration proof

The Firebase Admin dependency is isolated here from the desktop application's
dependencies. From the repository root, install it with:

```powershell
npm ci --prefix migration --ignore-scripts
```

`uuid` is pinned to 11.1.1 to address GHSA-w5hq-g745-h8pq. The installed
Google HTTP libraries use its compatible CommonJS `v4()` API. The migration
dependency audit and the real ADC lookup were rerun after this override.

For the existing keyless impersonation, run:

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'mydesckpro'
$env:FIREBASE_PROJECT_ID = 'mydesckpro'
node migration/tools/verify-firebase-credentials.mjs
node migration/tools/verify-firebase-admin.mjs
```

The Admin proof accepts only the default ADC impersonation of
`mydesck-migration@mydesckpro.iam.gserviceaccount.com`. It refuses a
`GOOGLE_APPLICATION_CREDENTIALS` override, an Auth emulator, another project,
and another service account. Its only Auth API operation is an exact lookup
for a fresh random `migration-test--` email. Only `auth/user-not-found` counts
as absence. It never lists users or creates, imports, updates or deletes one.

Put `SUPABASE_DB_URL` and `FIREBASE_WEB_API_KEY` in `migration/.env.local`,
which is ignored by the existing `*.local` rule. The Supabase PostgreSQL URL
is separate from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The latter
two API settings cannot retrieve bcrypt hashes from `auth.users`.

If the pooler presents Supabase's private CA chain, set `SUPABASE_CA_FILE`
in that same ignored file to the downloaded Supabase root certificate. This
run uses `migration/secrets/supabase-ca.crt`. Certificate and hostname
verification remain enabled (`rejectUnauthorized: true`); no project SSL
settings are changed. The download URL is published in
[Supabase Studio's certificate configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
The verified Supabase Root 2021 CA SHA-256 fingerprint is
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
The prerequisite report includes only allowlisted diagnostic codes, so a TLS
failure can be distinguished from PostgreSQL `28P01` (password rejected)
without recording a credential or raw server error message.

```powershell
node migration/tools/verify-auth-proof-inputs.mjs
```

This prerequisite check reports presence only, verifies the existing source
project, and uses TLS plus a read-only PostgreSQL transaction to inspect column
permissions. It never selects a customer row or password hash. Exit 2 means
blocked. Exit 0 means inputs are ready only: it does **not** prove a signup,
bcrypt import, password login, UID preservation, or real-token authorization.

For the existing full local database harness, set `PGURL` to the established
**disposable local PostgreSQL 17 UTF8 database** and run:

```powershell
node migration/tools/run-harness.mjs
```

The harness destructively replays the local schema and restores it afterward.
Never set `PGURL` to the Supabase source or any production database. The new
Admin guard tests are offline and do not replace the outstanding real GoTrue
round trip or the real-token PostgreSQL proof. A passing local harness alone
must never produce a migration-ready decision.

The authorized live proof is run only with the explicit flag below. It creates
exactly three new `migration-test--` accounts, imports their original bcrypt
hashes and UIDs, tests password round trips, then runs the token-derived local
PostgreSQL checks. It preserves the cleanup manifest with deletion disabled:

```powershell
$env:GOOGLE_CLOUD_PROJECT = 'mydesckpro'
$env:FIREBASE_PROJECT_ID = 'mydesckpro'
node migration/tools/real-gotrue-firebase-proof.mjs --execute-synthetic
```

`PGURL` must remain the disposable local PostgreSQL 17 target. `SUPABASE_DB_URL`
is used only for the exact synthetic source rows and GoTrue signup path. The
proof never queries production customers, lists Firebase users, or deletes an
identity.

No cleanup deletion is authorized. The manifest must keep
`deletionApproved = false`; every future synthetic identity must record its
UID, email, source, creation time and cleanup status. No hash, password, API
key, access token, ID token or connection string belongs in committed evidence.

References: [Admin ADC setup](https://firebase.google.com/docs/admin/setup),
[bcrypt imports](https://firebase.google.com/docs/auth/admin/import-users),
[ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Supabase signup behavior](https://supabase.com/docs/reference/javascript/auth-signup),
[UUID security advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
