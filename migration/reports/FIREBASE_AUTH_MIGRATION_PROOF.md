# FIREBASE AUTH MIGRATION PROOF - REAL GOTRUE + KEYLESS ADC

Run date: 2026-09-09. **READY FOR STAGING DATA MIGRATION.**

Keyless Firebase Admin initialization, source PostgreSQL access, and the real
GoTrue to Firebase proof all passed. No production data migration was started.

## Repository

- Branch: `codex/firebase-migration`.
- Starting commit: `064f279d329a0e33135020b0a6486705b82dcda3`.
- Original proof commit: `32418ff8eaf997ffcd416a666fa0fc90c0e4a9bd`.
- Recovery tags: `recovery/pre-firebase-migration-20260909-070229` and
  `recovery/full-firebase-migration-20260909-073409`.
- Unrelated staged files were preserved. The initial proof preserved 209/209;
  the continuation preserved 213/213 staged paths and used explicit pathspecs.
- Four pre-existing report edits were backed up before each harness run and
  restored byte-for-byte afterward.

## Credentials and Firebase Admin

| Check | Result |
|---|---|
| Firebase project | `mydesckpro` |
| ADC | Present; `impersonated_service_account` |
| Impersonated service account | `mydesck-migration@mydesckpro.iam.gserviceaccount.com` |
| Static private key / exposed historical key | No / No |
| Firebase Admin initialization | PASS |
| Read-only Admin operation | PASS - random `migration-test--` lookup returned `auth/user-not-found` |
| Existing Firebase users modified during Admin proof | 0 |

The Admin entry point refuses static-key overrides, the Auth emulator, another
project or another service account. Its dependency audit reports zero known
vulnerabilities. The web API key and database password remain only in ignored
local configuration.

## Synthetic GoTrue and bcrypt migration

- Exactly **3** new accounts were created, all under `migration-test--`.
- Existing Supabase customers touched: **0**.
- Each source UID, email, verification state and creation time was recorded.
- Exactly **3** source rows were read, restricted by the three known synthetic
  UIDs; no broad `auth.users` query was used.
- Real GoTrue bcrypt hashes were imported byte-identically with the same UID.
- Same-password Firebase login: **3/3 PASS**.
- Wrong-password rejection: **3/3 PASS**.
- Firebase UID preservation: **3/3 PASS**.
- Duplicate UID, duplicate email and malformed-bcrypt guards: **PASS**.
- Account conservation: **3 source = 3 Firebase**.

Firebase's import API does not itself protect against UID replacement, so the
runner performs exact UID and email lookups immediately before every import and
aborts on any collision. The cleanup manifest contains six entries (three per
system), all `retained_pending_approval`, with `deletionApproved: false`.

## Firebase token and PostgreSQL identity

All three real Firebase ID tokens passed Admin verification for signature,
issuer, audience, expiry and UID. The backend transaction adapter accepts only
the token, derives the UID after verification, binds it with transaction-local
`auth.bind_identity`, and chooses the database role itself. Token claims cannot
promote the role. Invalid signature, wrong issuer, wrong audience, expired
claims, non-UUID UID and UID/sub mismatch were rejected before connection
checkout.

For Users A and B, `auth.uid()` exactly matched the original Supabase UUID and
the Firebase UID. The local target was PostgreSQL 17.10, UTF8, with the
replayed compatibility layer.

## Tenant isolation and RPC authorization

| Operation | Result with real Firebase token |
|---|---|
| A -> A SELECT | Allowed |
| A -> B SELECT | Denied |
| A -> B UPDATE | Denied |
| A -> B DELETE | Denied |
| A -> B INSERT | Denied |
| B -> A SELECT | Denied |
| Anonymous private data | Denied |
| Invalid token | Denied before DB checkout |
| Invalid signature | Denied before DB checkout |
| Expired-token probe | Denied (`auth/id-token-expired`) |
| `get_owned_trip_payment_summary` own trip | Allowed |
| Same RPC cross-tenant trip | Denied / null |

The RPC definition was checked to contain `auth.uid()`, so authorization remains
in PostgreSQL RLS and the definer function rather than in a frontend check.

## Connection pool and Phase 1 security

- A -> B leakage: **NONE** on one pooled connection, 25 sequential alternations
  and 40 interleaved tasks.
- B -> anonymous leakage: **NONE** after transaction end.
- Self-admin escalation: **Blocked**.
- Self-unsuspend: **Blocked**.
- `SET ROLE service_role`: **Blocked**.
- `SET ROLE supabase_admin`: **Blocked**.
- Runtime BYPASSRLS: **false**; SUPERUSER: **false**; tenant-table ownership: **0**.

## Negative controls

Each intentionally insecure state was detected and restored: session-global
identity, runtime BYPASSRLS, an open cross-tenant policy, wrong UID binding and
malformed bcrypt. No negative-control mutation was left in the local schema.

## Harness

The full ordered harness passed with exit code **0**:

- 93 migrations, 0 failures, PostgreSQL 17.10 UTF8.
- 120 assertions, 0 failures across security posture (17), identity/isolation
  (20), auth classifier (27), Firebase safety (34), keyless Admin guards (11)
  and Firebase transaction guards (11).
- 10 steps passed; replayed schema restored successfully.
- Durable report writes retain temporary-file -> atomic-rename -> retry behavior.

Evidence: [firebase-auth-harness.json](firebase-auth-harness.json),
[real-gotrue-firebase-proof.json](real-gotrue-firebase-proof.json),
[firebase-auth-cleanup-manifest.json](firebase-auth-cleanup-manifest.json).

## Existing Production Customer Changes

**0**.

## Production Data Migration

**NOT STARTED**. No Cloud SQL cutover, Storage, Firestore, Hosting, rules,
organization, membership or billing migration was executed.

## FINAL DECISION

**READY FOR STAGING DATA MIGRATION**

Next phase, limited to a disposable staging slice and still requiring review:

1. Freeze and inventory the selected staging export with row and financial totals.
2. Validate every source UID, email and relationship before writing anything.
3. Import only approved staging identities using the proven collision guards.
4. Reconcile all 75 tables, 79 auth foreign keys and financial totals.
5. Run the real-token tenant, RPC, pool and Phase 1 regression suites again.
6. Verify files and storage references without changing production storage.
7. Capture before/after checksums and a rollback snapshot.
8. Obtain review of the staging reconciliation and cleanup manifest.
9. Run user-facing staging smoke tests with synthetic and approved test accounts.
10. Stop for a separate production cutover approval; do not auto-promote staging.
