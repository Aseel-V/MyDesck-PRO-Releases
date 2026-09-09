# FIREBASE AUTH MIGRATION PROOF — REAL GOTRUE + KEYLESS ADC

Run date: 2026-09-09. **BLOCKED — FIX BEFORE MIGRATION.**

Keyless Firebase Admin initialization and an actual read-only Auth API lookup
passed. The source PostgreSQL connection is unavailable, so no synthetic
GoTrue signup, Firebase import, password round trip or real-token database
authorization is claimed. No production data migration was started.

## Repository

- Branch: `codex/firebase-migration`.
- Starting commit: `064f279d329a0e33135020b0a6486705b82dcda3`.
- New commits: this report and the migration-only tooling/evidence are committed
  together; the resulting commit ID is recorded in the task's final response.
- Recovery tags already present: `recovery/pre-firebase-migration-20260909-070229`
  and `recovery/full-firebase-migration-20260909-073409`. No new recovery tag.
- Unrelated staged files untouched: **209**. Original index entries were checked
  byte-for-byte before staging; commit uses explicit migration pathspecs.
- The four previously modified migration reports were backed up before the
  harness and restored byte-for-byte afterward. Fresh results are recorded in
  `firebase-auth-harness.json`, avoiding inclusion of those pre-existing edits.
- Existing migration/security commits were inspected; auth compatibility SQL
  and existing negative controls were retained.

## Credentials

| Check | Result |
|---|---|
| Firebase project | `mydesckpro` |
| ADC present | Yes |
| Credential type | `impersonated_service_account` |
| Keyless | Yes |
| Impersonated service account | `mydesck-migration@mydesckpro.iam.gserviceaccount.com` |
| Static private key used | No |
| Exposed historical key used | No |
| `GOOGLE_APPLICATION_CREDENTIALS` | Unset |
| ADC setup repeated | No |

Project variables were set for the verifier process because this task's shell
did not inherit them. Existing ADC was used without reauthentication or IAM
changes. The supplied Firebase web API key is held in ignored local
configuration and is absent from this report and committed evidence.

## Firebase Admin

- Initialized: **PASS**, Firebase Admin SDK 14.3.0 with `applicationDefault()`.
- Read-only proof: **PASS**, `getUserByEmail` for a fresh random
  `migration-test--adc-probe-…@example.test` address returned
  `auth/user-not-found`, proving the actual request was authorized.
- Existing users modified: **0**. No enumeration, import, update or deletion.
- Dependency audit: **0 vulnerabilities** after the migration-only UUID
  override; real ADC access was rerun successfully afterward.
- Evidence: `firebase-admin-keyless.json`.

## Synthetic GoTrue Accounts

- Created: **0**.
- Namespace reserved: `migration-test--`.
- Existing Supabase customers touched: **0**.
- Existing source project: `pubugnfaqqukelvgckdr`.
- Blocker: `SUPABASE_DB_URL` is absent from process environment and workspace
  environment files. The available `VITE_SUPABASE_URL` is an HTTPS API endpoint;
  the anon key cannot read `auth.users.encrypted_password` through PostgreSQL.
- No signup was attempted before the prerequisite for retrieving its hash was
  available. No auth rows or customer password hashes were read.
- Evidence: `firebase-auth-proof-inputs.json`; prerequisite checker exit **2**.

## bcrypt Migration

| Check | Result |
|---|---|
| Real GoTrue-produced hash used | No — NOT RUN |
| Accounts tested | 0 |
| Same password login | NOT RUN |
| Wrong password rejection | NOT RUN |
| UID preserved through Firebase import | NOT RUN |
| Duplicate UID | Existing offline classifier/creation guards PASS; live import NOT RUN |
| Duplicate email | Existing offline classifier/creation guards PASS; live import NOT RUN |
| Malformed bcrypt | Offline classifier negative control PASS; live import NOT RUN |

Real pgcrypto bcrypt tests passed again. They do **not** establish GoTrue to
Firebase compatibility. No hashes or plaintext passwords appear in artifacts.

## Firebase Token

| Check | Result |
|---|---|
| Real ID token | NOT OBTAINED |
| Signature | NOT RUN |
| Issuer | NOT RUN |
| Audience | NOT RUN |
| Expiry | NOT RUN |
| UID | NOT RUN |

The successful ADC request used service-account credentials; it is not a
Firebase end-user ID token and does not satisfy this gate.

## PostgreSQL Identity

- Firebase UID: unavailable; no imported synthetic account.
- `auth.uid()` from a verified Firebase token: **NOT RUN**.
- Exact original Supabase UUID = Firebase UID = `auth.uid()`: **NOT RUN**.
- Existing local fixture-UID compatibility tests: **PASS**. Transaction-local
  binding was preserved without changing `001_auth_compat.sql`.

## Tenant Isolation

| Check | Existing local fixture proof | Real Firebase-token proof |
|---|---|---|
| A → A SELECT | Allowed | NOT RUN |
| A → B SELECT | Denied | NOT RUN |
| A → B UPDATE | Denied | NOT RUN |
| A → B DELETE | Denied | NOT RUN |
| A → B INSERT | Denied | NOT RUN |
| B → A SELECT | Denied | NOT RUN |
| Anonymous private-data access | Denied | NOT RUN through Firebase/backend path |
| Invalid token | Not exercised by fixture tests | NOT RUN |
| Expired token | Not exercised by fixture tests | NOT RUN |

## RPC Authorization

- Active application RPC tested with a real Firebase token: **NOT RUN**.
- Own tenant: **NOT RUN**.
- Cross tenant: **NOT RUN**.

## Phase 1 Security

All following results were rerun against the replayed PostgreSQL schema using
the established fixture identities. Repetition with real Firebase identities
remains **NOT RUN**.

| Check | Local result |
|---|---|
| Self-admin | Blocked |
| Self-unsuspend | Blocked |
| `SET ROLE service_role` | Blocked |
| `SET ROLE supabase_admin` | Blocked |
| Runtime BYPASSRLS | False |
| Runtime SUPERUSER | False |
| Runtime ownership | Zero public tenant tables |

No role membership granting runtime access to `service_role` was introduced.
No FORCE RLS changes were made.

## Connection Pool

- A → B leakage: **NONE** with existing fixture UIDs; real-token test **NOT RUN**.
- B → anonymous leakage: **NONE** in existing transaction-end/unbound checks;
  real-token test **NOT RUN**.
- Existing 25 sequential alternations and 40 interleaved pooled tasks passed.

## Negative Controls

| Intentionally insecure state | Result |
|---|---|
| Session-global identity | Detected; local secure state restored |
| Runtime BYPASSRLS | Detected; local secure state restored |
| Open cross-tenant policy | Detected; local secure state restored |
| Wrong UID binding | Detected |
| Malformed bcrypt | Classifier rejected it |

These are the existing local/offline controls. No malformed import was sent to
Firebase and no real-token negative-control run occurred.

## Harness

| Check | Result |
|---|---|
| Engine | Real local PostgreSQL 17.10 |
| Server encoding | UTF8 |
| Migrations | 93 executed |
| Migration failures | 0 |
| Assertions | **109 passed, 0 failed** |
| Harness steps | 9 passed |
| Harness exit code | **0** |
| Final schema restore | PASS |

Suite counts: security posture 17, identity/isolation 20, auth classifier 27,
Firebase safety 34, new keyless Admin guards 11. The observed initial baseline
was 98 assertions; coverage increased by 11. No test coverage was removed.

Report writes retain the established temporary-file → atomic-rename → retry
implementation. Detailed results: `firebase-auth-harness.json`.

## Cleanup Manifest

- Manifest: `firebase-auth-cleanup-manifest.json`.
- Synthetic Firebase users: **0**.
- Synthetic Supabase users: **0**.
- Deletion approved: **false**.
- Identities: empty. Future entries require UID, email, source, `created_at`
  and `cleanup_status`.
- No automatic deletion took place.

## Existing Production Customer Changes

**0**.

## Production Data Migration

**NOT STARTED**. No customer imports, broad auth/hash exports, Cloud SQL
cutover, Storage, Firestore, Hosting, rules, organization, membership or billing
changes were performed.

## FINAL DECISION

**BLOCKED — FIX BEFORE MIGRATION**

Exact blocker: missing `SUPABASE_DB_URL` for the existing source project.
Configure it in ignored `migration/.env.local` using Supabase Dashboard →
Connect; keep the database password out of chat and committed files. The
Firebase web API key has already been configured locally.

Consequent unproven gates: 3–5 real GoTrue synthetic signups, exact-UID-only hash
retrieval, bcrypt import, correct/wrong password checks, UID and verification
state preservation, real ID-token verification, token-derived PostgreSQL
identity, tenant/RPC isolation, pool safety and Phase 1/negative-control
regressions using those tokens. The prerequisite checker does not implement
these remaining steps; continue the proof once source access is available.

Stop here. Do not begin production or staging data migration.
