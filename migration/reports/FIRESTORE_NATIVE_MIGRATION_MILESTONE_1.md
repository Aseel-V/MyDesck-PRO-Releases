# FIRESTORE NATIVE MIGRATION MILESTONE 1

Run date: 2026-09-09. Scope: platform migration groundwork only. No production
cutover, no production data migrated, no Supabase change.

## Recovery

- Branch: `codex/firebase-migration`
- Starting SHA: `a1a5dbb343504fe1f2ce46237764a7eafa7cf230`
- Recovery tag: `recovery/pre-firestore-native-migration-20260909-220516`
  (created; every pre-existing recovery tag left intact)
- Staged paths preserved: **213 / 213**, byte-for-byte.
  Index manifest SHA-256 `697fe30be97576ac0c143b5177d69f784d1b9d436ad6f46d0caf34c6a8f2f9b2`,
  verified identical at start, mid-run and before commit. 0 removed, 0 modified.
- One incident, resolved: partway through the milestone the index grew from 213
  to 227 paths. No `git add` was run by this work and there are no git hooks;
  something outside these commands staged 14 of the new migration files. All 213
  baseline entries were verified unchanged (same manifest hash over that subset)
  and the 14 additions were unstaged, restoring the index to the exact baseline.
  Recorded rather than silently corrected, because an index that moves on its
  own is worth knowing about before the next commit.

## Architecture

- Cloud SQL used: **NO**. None created, none required, no billing dependency.
  The previous Cloud SQL plan is cancelled; its evidence is retained untouched
  in `CLOUD_SQL_IAM_PLAN.md`, `CLOUD_SQL_SCHEMA_PROOF.md` and
  `STAGING_DATA_MIGRATION_PROOF.md`.
- PostgreSQL in the final runtime: **NO**. It remains only as the current source
  of truth, a local test oracle and a read-only reconciliation source.
- Supabase in the final runtime: **NO** (after a cutover that has not started).
- Target: Firebase Auth + Cloud Firestore + Cloud Functions + Cloud Storage +
  Security Rules, Electron unchanged as the desktop client.

## Source Inventory

Re-derived live this session, not copied from earlier reports. The earlier
staging proof recorded 77 tables; `information_schema.tables` returns 78, which
is 77 base tables plus the view `view_daily_profit_summary` — a discrepancy
worth naming rather than reconciling away.

- Tables: **77** base tables (RLS enabled on 77/77, forced on 0), 1,089 columns
- Foreign keys: **152**, of which **77** reference `auth.users`
- Constraints: 21 unique, 125 check, 3 enums, 194 indexes
- Triggers: 477 total, **23** user triggers
- Functions: **126**, of which **79** are `SECURITY DEFINER`; **27** of those
  have no pinned `search_path` (inherited posture, recorded, not certified)
- Policies: **127** (116 public, 11 storage)
- RPCs called by the client: **42**, all classified, **0 unclassified**
- Direct `.from()` table access: 48 distinct tables
- Storage: 2 buckets (`logos`, `restaurant-assets`), 3 objects, **both public**
- Realtime: 2 channels, both in the restaurant vertical; the travel product uses
  none, so the travel cutover does not depend on realtime
- Edge functions: 4 (`create-user`, `generate-trip-pdf`, `get-guide-analytics`,
  `send-whatsapp` — the last remains quarantined)
- `auth.users`: 10 accounts

## Firestore Model

Design: `migration/firestore/FIRESTORE_DATA_MODEL.md`.

- Milestone-1 collections: **12** — `users`, `businesses`, `businessSettings`,
  `auditEvents`, `trips`, `tripPaymentPlans`, `tripInstallments`,
  `tripPaymentEvents`, `tripInstallmentEvents`, `tripFinancialAudit`,
  `tripActivityLog`, `idempotency`
- Dispositions across all 77 tables: 16 TOP_LEVEL_COLLECTION, 47 SUBCOLLECTION,
  13 ARCHIVE, 1 DERIVED. **0 REMOVE_LATER** — nothing is scheduled for removal
  during a parity migration.
- Embedded entities: `travelers`, `itinerary`, `payments`, `attachments`,
  `roomType` on `trips`, each with a document-size budget and a warning
  threshold at 200 array elements. Audit and event history is never an array.
- Denormalised fields: `ownerUid`, `businessId`, `isDeleted`, `sequence` — each
  declares its canonical source, update mechanism and stale-detection method.
- Schema version: **1**. Transform version: **1**.

## Source Coverage

- Mapped source tables: **77 / 77**
- Unmapped: **0**
- Unknown: **0** ✅ (required)

Enforced by a test, in both directions: a table added upstream with no decision
fails the build, and so does a decision naming a table the source no longer has.

## Money Representation

- Representations: exact scaled integers. `unitsText` (base-10 string) is
  authoritative and always present; `units` is a numeric convenience present
  only within ±(2⁵³−1) and `null` above it; values beyond int64 are flagged
  `exceedsInt64` and never truncated.
- Scales: **taken from the value, not the column**. The live slice holds
  `card_paid_amount` at scale 20 in one row and scale 16 in another, and 74 of
  93 numeric columns are unconstrained `NUMERIC` with no declared scale at all.
  The `*_minor` BIGINT ledger columns are scale 2 by application convention.
- ISO mismatch: `JOD` is scale 3 in ISO 4217 and scale 2 in this application.
  Migrated exactly as the source holds it, flagged `isoScaleMismatch`, never
  silently corrected.
- Overflow checks: int64 and safe-integer bounds, both directions, with negative
  tests at each boundary. Excess precision is an error, not a rounding decision.
- Float use for authoritative money: **NO**. A static control asserts the module
  contains no `parseFloat`, `toFixed` or `Math.round`, and exactly one
  `Number()` call, guarded by a proven safe-integer bound.

## Synthetic Dataset

Read-only export of the two approved `migration-test--travel-` identities. Real
customer rows exported: **0**.

- Users: **2** (plus 2 `auth.users` rows read, credential columns never selected)
- Businesses / tenants: **2**
- Trips: **4**
- Source relational rows: **130** (132 including the 2 identity rows, matching
  the previous proof's count)
- Target Firestore documents: **130**
- Currencies: EUR, ILS. Text: Arabic, Hebrew and English in the same records.

## UID / ID Preservation

- User UIDs: **2 / 2** preserved. Document id = `uid` field = `userId` field =
  source `auth.users.id`. All three must agree; two of three is not preservation.
- Business IDs: **2 / 2** preserved (source UUID is the document id)
- Trip IDs: **4 / 4** preserved
- Payment plan / installment IDs: **4 / 4** and **6 / 6** preserved
- Event IDs: **108 / 108** preserved. BIGINT identity keys become zero-padded
  19-character document ids so lexical id order matches numeric order — Firestore
  sorts ids as strings, and `"10"` before `"9"` is how history silently reorders.
- Generated document ids: **0**. A test asserts no entity derives its id from
  `.doc().id`, `randomUUID` or `Math.random`.

## Reconciliation

| Level | Result |
|---|---|
| 1 source coverage | PASS |
| 2 target coverage | PASS |
| 3 entity parity | PASS |
| 4 relationship parity | PASS |
| 5 financial parity | PASS |
| 6 user parity | PASS |
| 7 file parity | See Storage — gate proven, copy not authorized |
| 8 behavioural parity | NOT RUN — application layer, later milestone |

- Entities checked: **130**
- Missing: **0** · Unexpected: **0** · Hash mismatches: **0**
- Relationship references checked: **136** · Relationship mismatches: **0**
- Migration-created orphans: **0**

The source and target sides are canonicalised independently — the source from
PostgreSQL text that never touches Firestore, the target from documents read
back out of it — so a bug in the writer cannot hide itself by also corrupting
the comparison.

Three declared references were checked at **zero rows** because the synthetic
slice does not exercise them: `user_profiles.business_id`, `trips.deleted_by`
and `audit_logs.business_id`. Their checkers exist and run; they are simply
unproven against data, and a production rehearsal must exercise them.

## Financial Reconciliation

- Currencies: EUR, ILS
- Financial values checked: **72** across 32 currency-separated totals
- Source totals = target totals exactly, e.g. `salePrice` ILS `2469.14`,
  EUR `1836.86`; `amountPaid` ILS `684.52`, EUR `540.22`
- Reverse-conversion mismatches: **0** — every stored amount reproduces its
  exact source text, including `0.00000000000000000000` and `270.1100000000000000`
- Unexplained delta: **0** (required: 0). No epsilon, no tolerance anywhere.

## Event Reconciliation

- Events: **108** (4 payment, 4 installment, 64 financial audit, 36 activity)
- Missing: **0** · Extra: **0** · Ordering mismatches: **0**
- Order is verified against the explicit `sequence` field, not document-id order.

## Firestore Security Rules

22 tests, all passing. Collections tested: all 12 milestone-1 collections plus
the proof namespace and an unmatched collection.

| Check | Result |
|---|---|
| Owner read/write own data | ALLOWED |
| Cross-tenant read | DENIED |
| Cross-tenant create/update/delete | DENIED |
| Anonymous, every collection | DENIED |
| Ownership mutation (`ownerUid`, `uid`, `businessId`) | DENIED |
| Privilege escalation (self-admin, self-unsuspend, self-grant financials) | DENIED |
| Cross-tenant role mutation | DENIED |
| Client writes to money fields | DENIED |
| Client writes to audit/event history | DENIED |
| Idempotency ledger, any access | DENIED |
| Unconstrained query (rules are not filters) | DENIED, not filtered |
| Admin claim | read-only across tenants; all writes DENIED |
| `migration_test_v1_*` proof namespace | DENIED to everyone, admins included |

Self-unsuspend is tested where it actually matters — a **suspended** account
clearing its own flag. Asserting against an already-false value would only have
proven that writing an unchanged field is a no-op.

## Negative Controls

Two independent sets, both required to fail when the defence is removed.

**Reconciler (16 / 16 corruptions detected, 16 / 16 restored clean):**
missing document · extra unexpected document · wrong UID · wrong businessId ·
broken parent reference · changed financial integer · wrong scale ·
overflow/precision loss · reordered event · altered timestamp (one microsecond) ·
missing audit event · wrong currency · cross-tenant document ·
owner outside approved slice · blanked text field · JSON null collapsed to SQL NULL

**Security Rules (6 / 6 breaches reproduced under insecure rules):**
`allow read: if true` · `allow read, write: if request.auth != null` ·
mutable `ownerUid` · client-writable admin field · client-writable money ·
writable audit history. Each insecure rule is loaded into the emulator and the
breach is *required to succeed*; if it did not, the matching positive test would
be passing for some unrelated reason and would prove nothing.

Storage checksum gate (4 / 4): byte round-trip, single flipped byte, missing
object, truncated object.

## Critical Transaction Prototype

Operation: `save_trip_transaction`, rebuilt as a callable Cloud Function over a
Firestore transaction. 17 tests passing.

- Documents read: idempotency record, user profile, trip, active payment plan,
  existing installments
- Documents written: trip, payment plan, installments, activity log, idempotency
  record
- Atomic: **YES** — one `runTransaction`; a rejected save leaves nothing behind,
  verified by test
- Idempotent: **YES** — `idempotency/{uid}__{clientRequestId}`, created *inside*
  the transaction, so a concurrent duplicate contends on that document and loses
- Concurrency test: 5 simultaneous identical requests → exactly 1 trip,
  3 installments, 1 activity event, 1 idempotency record
- Duplicate retry: returns the original result, creates nothing new
- Identity: taken from the verified caller only. The input schema is `.strict()`
  and has no `userId` or `ownerUid` field, so a smuggled ownership claim is
  rejected rather than ignored
- Cross-tenant edit returns the same error as a missing trip, so the response
  cannot be used to probe for other tenants' trip ids
- Money: server-computed from the ledger; client totals are never trusted
- Confirmed collection is immutable — a structural plan change against confirmed
  payments is refused
- No external side effect in the transaction body, asserted by a static control
  over the source, because transaction bodies retry

## Storage

- Manifest: **built**, 3 objects across 2 buckets, with target paths designed so
  ownership is legible from the path
- Files copied: **0** (copy is not authorized by this milestone)
- Production bytes downloaded: **0**
- Checksum test: **PASS** (4/4) against synthetic objects in the Storage emulator
- Private-file tests: Storage Rules written and default-deny; signatures are
  owner-only. Rules are **NOT yet executed** against the Storage emulator — the
  suite covers Firestore rules only, so this is written-and-reviewed, not proven.

Three findings, one of which blocks cutover:

1. `SOURCE_BUCKETS_ARE_PUBLIC` — both source buckets are public.
2. `SIGNATURE_BUCKET_DOES_NOT_EXIST` — the client calls
   `storage.from('business-signatures').upload` and `getPublicUrl`, but no such
   bucket exists in the source. Signature upload is either failing silently or
   writing somewhere public. **A public signature URL is a forgery kit.**
   Blocks cutover.
3. `CLIENT_BUCKET_NAMES_DIVERGE_FROM_SOURCE` — the application writes to bucket
   names the source does not have.

## Existing Production Customer Changes

**0.**

- Every source read ran inside `REPEATABLE READ READ ONLY` with
  `default_transaction_read_only=on`, verified before and after each read, with
  a deliberate `UPDATE ... WHERE false` rejected with SQLSTATE `25006`, and
  ended in `ROLLBACK`. Successful writes: **0**.
- All Firestore writes went to the **emulator**. Zero documents were written to
  the `mydesckpro` project.
- Firebase Auth: one `getUserByEmail` lookup on a random synthetic address.
  Existing users modified: **0**.
- Storage: metadata read only; no object bytes downloaded, no policy changed.

## Production Cutover

**NOT STARTED.**

## Supabase Deletion

**NOT STARTED.** No project, database, auth user, storage object or backup was
deleted or scheduled for deletion.

## Harness

- Firestore harness: **16 / 16 steps PASS, 0 failed, 0 not run**
- Assertion call sites in passing suites: **368** across 8 suites
  (exact-decimal, canonical, transform, ledger, table-map, target-safety,
  rules, save-trip-transaction)
- Test cases: 19 + 19 + 17 + 10 + 14 + 7 + 22 + 17 = **125**
- Reconciliation: RECONCILED · Negative controls: 16/16 · Failures: **0**
- Restartability proven: after a full run, a rerun without `--force` writes 0
  documents, skips 130/130 already-verified rows, and still reconciles.

**PostgreSQL harness (the previous 148-assertion suite): NOT RUN.** Its
PostgreSQL steps require a local oracle at `127.0.0.1:55433`. No PostgreSQL
binaries are installed on this machine (`pg_ctl`, `psql`, `initdb` all absent;
a `PostgreSQL\17\data` directory exists with no `bin`) and the Docker daemon is
not running, so the database cannot be started here. This is an environment
limitation, not a defect and not a coverage reduction:

- The four steps that do not need PostgreSQL were re-run and **pass**:
  `auth-classify`, `firebase-safety`, `keyless-admin`, `firebase-transaction`.
- **No pre-existing tracked file was modified by this milestone.** The only two
  that changed were regenerated evidence reports whose diffs were timestamp-only
  with identical findings, and both were restored. Every SQL file, migration
  tool and test the PostgreSQL harness covers is byte-identical to `a1a5dbb`, so
  its previous result is unaffected by this work.
- Re-running it remains required before any production rehearsal.

Firebase Admin keyless access was re-verified this session: ADC present,
`impersonated_service_account`, `mydesck-migration@mydesckpro.iam.gserviceaccount.com`,
static private key used **NO**, read-only proof **PASS**, existing users
modified **0**.

## Secret Finding

`src/commit_log.txt:29` — **UNRESOLVED. BLOCKS PRODUCTION CUTOVER.**

Re-verified this session with identical findings. Classified `ACCESS_TOKEN`,
provider GitHub, HIGH confidence from provider-specific token syntax.
Fingerprint prefix `39a987553136`. State: staged-only addition; **not** present
in any locally reachable Git history. Not transmitted for validation, not
rotated, not redacted, history not rewritten, file not modified. The value has
not been printed anywhere in this work.

The file is one of the 213 preserved staged paths and is excluded from every
migration commit. This does not block Firestore application-layer development —
the credential is not required by any migration operation — but it must be
revoked and removed before cutover.

## Other Open Gates

1. **Firestore IAM on `mydesckpro` — BLOCKED.** The database exists
   (`projects/mydesckpro/databases/default`, FIRESTORE_NATIVE, nam5) but the
   migration service account has no Firestore permission: `listCollections`
   returns `PERMISSION_DENIED`. Consistent with the deliberately narrow IAM,
   which excludes `roles/datastore.owner`. Note the database id is literally
   `default`, not `(default)`, so a plain Admin SDK connection returns
   `NOT_FOUND` rather than a permission error — worth knowing before anyone
   debugs that from scratch. Blocks any real-project proof; blocks nothing in
   the emulator.
2. **Storage Rules not executed.** Written and default-deny, but the test suite
   covers Firestore rules only.
3. **Passport encryption fails open.** `private.trip_encrypt_travelers` returns
   travelers **unencrypted** when the key is unavailable, rather than refusing
   the write. Pre-existing source behaviour, recorded here because the migration
   carries ciphertext through verbatim and never decrypts — but a row written
   during a key outage is plaintext at rest today. The synthetic slice contains
   no passport numbers, so the encrypted round trip is **NOT PROVEN** against
   real ciphertext.
4. **Timestamp shadow fields** (`<field>Micros`) are carried on every timestamp
   pending proof that the Firestore `Timestamp` alone round-trips on a full
   rehearsal. Dropping them is a milestone-2 decision, made on evidence.

## Defects found and fixed during this milestone

Recorded because each was a real way data could have changed silently:

1. **JSON `null` collapsed into SQL `NULL`.** Both were stored as a bare `null`,
   losing the difference between "the audit value was null" and "there was no
   audit value". Caught by reconciliation on 16 real audit rows. Fixed with an
   explicit encoding marker; a permanent negative control now guards it.
2. **JSON numeric literals silently rewritten.** PostgreSQL JSONB keeps
   `0.00000000000000000000`; `JSON.parse` returns `0`. Such documents now store
   their exact source text.
3. **`classifyUnits` mishandled `INT64_MIN`.** Two's complement is asymmetric —
   `|INT64_MIN|` is `INT64_MAX + 1` — so classifying by magnitude pushed the
   smallest representable int64 out of the int64 class.
4. **Ledger composite-key collision.** `["a|b","c"]` and `["a","b|c"]` produced
   the same key, so two distinct primary keys could share one ledger entry and
   one would look migrated when it never was.
5. **Ids generated inside a retried transaction.** A transaction body can run
   several times; an id minted inside it differs per attempt and leaves orphans
   from the attempts that lost. Ids are now generated before the transaction,
   and are UUIDs so the target does not end up with two id vocabularies.
6. **Ledger never promoted to VERIFIED**, so the documented restartability did
   not actually work. Reconciliation now promotes on parity and demotes on
   failure; a resumed run skips 130/130 verified rows and stays reconciled.
7. **Forbidden ledger fields silently dropped** rather than rejected — a caller
   passing `passwordHash` would have believed it was stored.
8. **The real-project guard double-prefixed an already-prefixed collection**,
   sending it to `migration_test_v1_migration_test_v1_trips`. Still inside the
   proof namespace, so never a production-safety hole, but it would have split
   proof data across two collections. Found by writing the test for the safety
   claim rather than asserting it in this report.

## DECISION

**READY FOR FIRESTORE APPLICATION-LAYER MIGRATION**

No STOP condition is met: source row coverage is complete (130/130), every one
of the 77 tables has a mapping decision, money is exactly representable and
proven so, UIDs are preserved, financial delta is zero, zero orphans were
created, every cross-tenant rule test denies, the privileged function trusts no
caller-supplied ownership, idempotency is proven under concurrency, no synthetic
write touched production, and all 213 staged paths are preserved byte-for-byte.

This authorizes application-layer work against Firestore. It does **not**
authorize production cutover, which remains blocked on: the unrotated GitHub
token, Firestore IAM on `mydesckpro`, executed Storage Rules tests, a
re-run of the PostgreSQL harness, the signature-privacy fix, and the full
production rehearsal and reconciliation of phases 6 through 11.

STOP.
