# Firestore production migration preparation

## Recovery

- Starting SHA: `6cd86d95a855fd1b2fd6e930b6cc88b5ebf839fe`
- Ending SHA: commit containing this report; exact immutable SHA is reported after commit
- New commits: one preparation commit planned
- Recovery tag: `recovery/pre-firestore-production-migration-preparation-20260911-203130`
- Staged baseline: 212 paths; manifest SHA-256 `9a69caa8c65eec5f0d4b85a931b8463fc038290ae439f9f2b24929649b0c44d3`
- Staged preserved: 212/212 byte-identical index entries

## Firebase production inventory

- Project: `mydesckpro`, ACTIVE, project number `816880250172`
- Firestore database: verified ID `default`; `projects/mydesckpro/databases/default`, Firestore Native Enterprise, `nam5`; `(default)` does not exist
- Existing collections: 0 root collections returned
- Auth: 5 current target users counted without persisting user data; provider configuration NOT RUN (403)
- Storage: 0 buckets
- Functions: Cloud Functions API disabled; no deployed inventory available
- Rules: current Firestore and Storage rules NOT RUN (403)
- Indexes: 0 composite, 0 field overrides
- App Check: API enabled; configuration NOT RUN (403)
- Billing/capabilities: billing disabled. Firestore metadata works; Functions and Storage provisioning are blocked. Hosting default site exists.

All inventory actions were read-only. No customer document, Auth field, or object content was stored in the report.

## IAM

- Migration writer: custom least-privilege identity/permission set designed; identity/binding NOT CREATED
- Functions runtime: dedicated identity and scoped Firestore/Storage/secret/log roles designed; NOT CREATED
- Storage migration: bucket-scoped custom role designed; NOT CREATED
- Deployment identity: release-only custom role plus act-as on the named Functions identity; NOT CREATED
- Broad roles granted by this milestone: NONE
- Existing broad roles: one pre-existing human `roles/owner` binding; FAIL against the proposed least-privilege operator model
- Effective-permission analysis: current Auth migration identity separation PASS; proposed identity Policy Troubleshooter NOT RUN

## Rules / indexes / Functions

- Candidate Rules: prepared; Firestore candidate SHA-256 `bfb3413ad1af01377b8e079dd4cfa9ea7813a2b18b61a70c43ac0f9c520cee90`
- Rules hash: candidate verified locally; expected current production hash unavailable because Rules API returned 403
- Index readiness: FAIL, 0/3 required indexes deployed
- Function readiness: FAIL, production v2 package prepared but API/billing/runtime identity unavailable
- Trigger migration safety: PASS; candidate contains no Firestore trigger and no external side effect. WhatsApp remains quarantined.

The release package refuses deployment while expected-current Rules hashes or rollback rulesets are unresolved.

## Auth

- Users: 10; Transparent 7; Reauth 0; Reset 0; Manual 3; Excluded 0; Unknown 0
- Importer: default dry-run, conservation/collision/version/project/ack/run-ID guards, planned batching/retry/resume states
- Production import: **NOT STARTED**

The real target currently contains 5 accounts. The later dry-run must compare target UIDs and normalized emails before any import. The three manual accounts remain disabled from application enablement until the operator links or explicitly denies them.

## Data

- Bulk-copy tooling: dry-run orchestrator, production mode guards, bounded streaming writer, exponential backoff, permanent-error classification, metrics, checkpoints
- Source snapshot: exact Supabase ref guard; `REPEATABLE READ READ ONLY`; negative write must fail with SQLSTATE `25006`
- Streaming / resume / idempotency / ledger: implemented and covered by guards; production execution locked
- Transform version: `1.full.1`; schema version 1

The previously reconciled corpus remains unchanged. No full extraction was repeated because no transform/model regression occurred.

## Delta

- Domains/tables: 77
- Reliable updated-at: 5; reliable created-at immutable history: 5; append-only event: 16
- Full re-copy: 50; freeze required: 1
- Unknown: 0

Every strategy ends with full PK/canonical-hash reconciliation; timestamp watermarks never replace conservation.

## Storage

- Objects: last rehearsal 3 objects / 438,670 bytes; one pre-existing source orphan
- Bulk strategy: complete listing, stream, conditional create, checkpoint, target reread and SHA-256
- Delta strategy: fresh complete object listing plus path/size/hash comparison
- Checksum/privacy: prior 3/3 and privacy suite PASS
- Production copy: **NOT STARTED**; real target has no bucket

## Supabase burn-down

- Current total: 254
- Production-active: 246
- Travel active legacy calls: 77, all explained
- Post-cutover reachable production-active references: 0 under the locked selector
- Unexplained: 0

Post-cutover fate is 111 removed before cutover, 135 unreachable after selector, and 8 rollback-only adapters.

## Maintenance mode

- Ready: code and tests PASS
- Writes blocked: trip create/edit, traveler, documents, attachments, staff/admin
- Financial writes blocked: payment and installment requests rejected; UI returns a maintenance failure in English, Hebrew, or Arabic and never reports success

## Backend switch and rollback

- Selector: requires production build, project `mydesckpro`, database `default`, release `mydesck-firestore-v1`, and explicit Supabase-fallback disable flag
- Silent fallback prevented: PASS; Firestore errors return failure after one write attempt
- Rollback before Firestore writes: delete only run-ledger output and retain Supabase authority
- Rollback after writes: freeze, reconcile `_postCutoverJournal`, reverse idempotently, reconcile Storage/Auth/finance/events, then switch only on rollback GO
- Production rollback rehearsal: NOT RUN

## Secret

- Active source: no credential present
- Revoked/rotated: no confirmation
- Production blocker: YES. Actual production GO remains blocked until the owner confirms deletion/revocation.

## GO engine

- PASS: 14
- FAIL: 6 (`environment`, `secret`, `iam`, `indexes`, `functions`, `storage`)
- NOT RUN: 2 (`rules`, `electron`)
- Missing: 0
- Decision: `NO_GO`

## Dry-run orchestrator

- Implemented: YES; validates identities, versions/hashes, inventory, evidence, counts, Auth, delta, release artifacts, rollback/freeze, and GO state
- Production writes: 0
- Current result: `NO_GO`, with every blocker named; no missing evidence was treated as PASS

## Harness

- Steps: 19/19
- Tests: 172
- Assertion call sites: 528
- Failures: 0

This includes the prior migration, money, transform, ledger, security Rules, transactions, Storage, Auth-emulator, search, and application suites plus production identity, acknowledgement, drift, collision, run-ID, ledger-resume, trigger, maintenance, fallback, and GO-engine controls.

## Production changes

- Supabase writes caused by migration tooling: 0
- Firebase Firestore customer writes: 0
- Firebase Auth production imports: 0
- Storage production migration: NOT STARTED
- Backend cutover: NOT STARTED
- Supabase deletion: NOT STARTED
- Cloud SQL: NOT USED

## Decision

**BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN**

The dry-run machinery is executable and safely returns `NO_GO`, but a controlled production migration dry-run cannot yet simulate the deploy/IAM/real-service sequence. Required external closure is: pin the reviewed preparation commit; revoke the GitHub token; attach approved billing; enable Functions build/runtime APIs; create the private Storage bucket and dedicated identities; grant read-only Rules/App Check inventory access; capture current/rollback Rules hashes; deploy and wait for three indexes; run IAM Troubleshooter; and prove packaged Electron App Check. None of those actions was automatically performed.
