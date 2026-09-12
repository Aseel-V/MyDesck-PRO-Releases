# Firebase production environment blocker closure — Phase 4B

**BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN**

Software closure tooling and local regression are ready. Project capability remains blocked. Provider-dependent App Check integration and Storage database compatibility also require resolution; billing alone will not close every gate. No production environment mutation, customer migration, backend switch or write freeze occurred.

## Recovery

Starting SHA: a242f5141c3526c8f06dc88b78d81e19fbbc2848

Evidence executable HEAD: 9bb74afbcfc8df1d2fcf5420f44d49e198b8f6ec

Ending SHA: resolve the report-bearing commit with `git log -1 --format=%H -- migration/reports/FIREBASE_PRODUCTION_ENV_BLOCKER_CLOSURE.md`. The final response records the exact ending SHA; a commit cannot embed its own content-derived SHA.

Branch: codex/firebase-migration

Recovery tag: recovery/pre-firebase-env-blocker-closure-20260912-045538

Staged preserved: 212/212, byte-identical index blobs/modes/stages. Manifest SHA-256: `9a69caa8c65eec5f0d4b85a931b8463fc038290ae439f9f2b24929649b0c44d3`. Baseline path/hash inventory is in ignored `migration/env-blocker-closure.local/staged-baseline.json`; public verification is `firebase-env-staged-preservation.json`. No `git add .`, `git commit -a`, reset, or pre-existing staged content included in closure commits. Supplementary suites' historical staged report worktrees were restored.

## Previous GO state

PASS: 14; FAIL: 6; NOT RUN: 2; Missing: 0. Decision: NO_GO.

Authority: archived machine evidence [previous GO](firebase-env-previous-go.json), originally `firestore-production-dry-run.json`. Its exact FAIL gates are environment, secret, iam, indexes, functions, storage. NOT_RUN gates are rules and electron. Rollback was PASS for a plan/journal model; real rollback and synthetic smoke were not independent gates in that 22-gate engine. They are additional mandatory dry-run prerequisites here, all NOT_RUN in the real project.

## Exact blocker matrix

The mutation column describes an outstanding closure action, not an action taken. All actual production mutations remain zero. OPERATOR_BLOCKED is explanatory metadata; the engine retains FAIL/NOT_RUN semantics.

| Gate | Previous → current / closure | Root cause | Can Codex safely fix? | Operator? | Billing? | IAM? | Deploy? | Production mutation? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| environment | FAIL → FAIL / OPERATOR_BLOCKED | approvedPreparationCommit remains PENDING_POST_REVIEW_PIN; actual project/database identity is confirmed | Prepare reviewed commit; operator approval required for pin | YES | NO | NO | NO | NO | config/production-migration.json; current GO identityFailures |
| secret | FAIL → FAIL / OPERATOR_BLOCKED | Active source credential removed; provider revocation has not been confirmed | No; operator-only provider action | YES | NO | NO | NO | YES, closure action only | active-secret-regression.json; no revocation attestation |
| iam | FAIL → FAIL / OPERATOR_BLOCKED | Migration account has firebaseauth.admin only; datastore permissions absent; runtime/deployer identities absent; human Owner remains; full resource analysis blocked by disabled Troubleshooter | Read-only analysis and exact plan/apply tooling completed; no grant authorized | YES | NO | YES | NO | YES, closure action only | firebase-production-environment-inventory.json; PRODUCTION_ENV_IAM_ANALYSIS.md; production-iam.mjs |
| rules | NOT_RUN → PASS / CLOSED | Human Rules API request lacked quota-project header; migration identity separately lacks firebaserules.releases.get | Yes, using already-authorized human read with quota project | NO | NO | NO | NO | NO | release/current-production/manifest.json; source-0.rules; current GO rules evidence |
| indexes | FAIL → FAIL / OPERATOR_BLOCKED | Authenticated index listing succeeds and returns zero composites; three ordered repository queries require exact composites | Verified queries and prepared three creation commands; apply requires operator | YES | NO | YES | YES | YES, closure action only | firebase-production-index-readiness.json; src/data/FirestoreTravelRepository.ts:27,48 |
| functions | FAIL → FAIL / OPERATOR_BLOCKED | Billing disabled; Functions/Run/Build/Artifact Registry disabled; runtime identity absent; deployment and real Auth/App Check callable path unproven | Local v2 synthetic candidate and emulator proof prepared; capability actions require operator | YES | YES | YES | YES | YES, closure action only | inventory APIs/billing; production-readiness-smoke.mjs; readiness-smoke.test.mjs; PRODUCTION_REAL_SMOKE_PLAN.md |
| storage | FAIL → FAIL / OPERATOR_BLOCKED | No project buckets; Firebase Storage API disabled; billing disabled; candidate Rules references nonexistent (default) database while production uses default | Inventory, target guard and private-smoke plan completed; provider capability confirmation needed before secure integration changes | YES | YES | YES | YES | YES, closure action only | inventory buckets/defaultBucket; production-storage-target.json; rules/storage.rules:40; PRODUCTION_REAL_SMOKE_PLAN.md |
| electron | NOT_RUN → NOT_RUN / OPERATOR_BLOCKED | Packaged Electron attestation provider and real token proof absent; production client has no initialized App Check provider | Proof design prepared; approved provider/configuration required before client integration | YES | YES | YES | YES | YES, closure action only | inventory appCheck; src/data/firebaseClient.ts; APP_CHECK_PLAN.md; PRODUCTION_REAL_SMOKE_PLAN.md |

### environment

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: approvedPreparationCommit remains PENDING_POST_REVIEW_PIN; actual project/database identity is confirmed.

Action: Kept commit gate intact; no self-approval.

Evidence: config/production-migration.json; current GO identityFailures. Operator required: YES.

### secret

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: Active source credential removed; provider revocation has not been confirmed.

Action: Safe scanner rerun; asked for confirmation without requesting token; no confirmation received.

Evidence: active-secret-regression.json; no revocation attestation. Operator required: YES.

### iam

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: Migration account has firebaseauth.admin only; datastore permissions absent; runtime/deployer identities absent; human Owner remains; full resource analysis blocked by disabled Troubleshooter.

Action: Project policy, role permissions and permission probes inspected; separate named identities and conditional datastore.user planned.

Evidence: firebase-production-environment-inventory.json; PRODUCTION_ENV_IAM_ANALYSIS.md; production-iam.mjs. Operator required: YES.

### rules

Previous state: NOT_RUN. Current state: PASS (CLOSED).

Root cause: Human Rules API request lacked quota-project header; migration identity separately lacks firebaserules.releases.get.

Action: Read release and source, captured deny-all rollback and source SHA-256; candidate emulator suite PASS; no deployment.

Evidence: release/current-production/manifest.json; source-0.rules; current GO rules evidence. Operator required: NO.

### indexes

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: Authenticated index listing succeeds and returns zero composites; three ordered repository queries require exact composites.

Action: Exact specification/state matcher added; no count-only PASS and no unrelated field override deployment.

Evidence: firebase-production-index-readiness.json; src/data/FirestoreTravelRepository.ts:27,48. Operator required: YES.

### functions

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: Billing disabled; Functions/Run/Build/Artifact Registry disabled; runtime identity absent; deployment and real Auth/App Check callable path unproven.

Action: Classified all callables, kept notifications quarantined; isolated synthetic candidate prepared; no API enablement/deployment.

Evidence: inventory APIs/billing; production-readiness-smoke.mjs; readiness-smoke.test.mjs; PRODUCTION_REAL_SMOKE_PLAN.md. Operator required: YES.

### storage

Previous state: FAIL. Current state: FAIL (OPERATOR_BLOCKED).

Root cause: No project buckets; Firebase Storage API disabled; billing disabled; candidate Rules references nonexistent (default) database while production uses default.

Action: Bucket pin intentionally empty; flagged database-reference mismatch; no guessed bucket or weakened Rules.

Evidence: inventory buckets/defaultBucket; production-storage-target.json; rules/storage.rules:40; PRODUCTION_REAL_SMOKE_PLAN.md. Operator required: YES.

### electron

Previous state: NOT_RUN. Current state: NOT_RUN (OPERATOR_BLOCKED).

Root cause: Packaged Electron attestation provider and real token proof absent; production client has no initialized App Check provider.

Action: Read real App Check service configuration; documented provider-dependent integration; no debug-token or enforcement bypass.

Evidence: inventory appCheck; src/data/firebaseClient.ts; APP_CHECK_PLAN.md; PRODUCTION_REAL_SMOKE_PLAN.md. Operator required: YES.

## Billing

Billing account linked: NO. Billing enabled: NO (authenticated HTTP 200). Firebase plan: Spark, derived from account-unlinked/billing-disabled state using the same capability endpoint as Firebase CLI. Functions capable: NO. Storage capable: NO. Operator action: link an approved billing account / upgrade Blaze; then enable only required APIs. No account/payment details were retained. [Billing readiness](../firestore/PRODUCTION_BILLING_READINESS.md).

## Firestore IAM

Migration identity: `mydesck-migration@mydesckpro.iam.gserviceaccount.com`. Database: `projects/mydesckpro/databases/default`; metadata read confirms Native Enterprise, nam5; `(default)` returns 404.

Bindings current: migration account only `roles/firebaseauth.admin`. Roles proposed: conditional `roles/datastore.user` for writer and separate runtime; bucket objectUser for separate Storage identity; Rules viewer / custom release deployer; indexAdmin for separate deployer. No grant applied.

Permission analysis: required datastore permissions FAIL (none returned at project scope; synthetic nonexistent read HTTP 403). Project-level prohibited-permission probes PASS for absence; complete resource-level analysis NOT_RUN because Troubleshooter is disabled and database testIamPermissions returns HTTP 500. Resource actAs tests are preserved in inventory. Broad role count: migration 0; human 1 pre-existing Owner; newly granted broad roles 0. [Detailed separation and exact plan/apply](../firestore/PRODUCTION_ENV_IAM_ANALYSIS.md).

## Rules

Current Rules retrievable: YES. Release: `projects/mydesckpro/releases/cloud.firestore/default`. Version: `projects/mydesckpro/rulesets/c6fc85cd-4681-491c-bb7c-b879e5893a92`.

Current hash: `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb`. Current source denies all reads/writes.

Candidate hash: `bfb3413ad1af01377b8e079dd4cfa9ea7813a2b18b61a70c43ac0f9c520cee90`.

Rollback available: YES, captured immutable [source](../firestore/release/rollback-production/source-0.rules) and [manifest](../firestore/release/rollback-production/manifest.json); rollback hash equals current hash. Candidate and current differ. Reader fix: explicit quota project on the human Rules request, no IAM grants. Migration principal still correctly lacks Rules read permission. Tests: complete candidate Rules emulator suite PASS, 25 tests; full security/transaction/application harness below. Deployed: NO. Hash availability is readiness evidence, not a claim of active candidate behavior.

## Indexes

Required: 3. Ready: 0. Creating: 0. Missing: 3. Error: 0.

Three exact repository query shapes verified: tenant/deletion ordered startDate; tenant/deletion/status ordered startDate; tenant/status dueDate range. The first two use document-ID ASC cursor tie-breaking. Exact fields, orders and live states: [index readiness and commands](firebase-production-index-readiness.json). No indexes or field overrides were deployed. 3/3 READY is required.

## Functions

Required APIs: Cloud Functions, Cloud Run, Cloud Build, Artifact Registry DISABLED. Eventarc DISABLED and not required for current callables; Pub/Sub ENABLED. Billing: disabled. Deploy capability: FUNCTIONS DEPLOYMENT BLOCKED BY BILLING. Synthetic smoke: NOT_RUN in real project; isolated v2 candidate and emulator transaction/idempotency/journal proof prepared.

External-side-effect suppression: no Firestore event triggers in current candidate; all callable/legacy/notification functions classified in [smoke plan](../firestore/PRODUCTION_REAL_SMOKE_PLAN.md). WhatsApp remains NOTIFICATION_QUARANTINED. The four application mutators are ENABLE_AFTER_CUTOVER, not falsely described as dormant-safe without server suppression. No production Function was deployed.

## Storage

Target bucket: UNPROVISIONED (authenticated all-buckets list returned zero). Billing: disabled. Firebase Storage API: disabled; generic Storage API enabled. IAM: no bucket binding to plan/apply until a real target is discovered and pinned; object-only identity separated from clients. Rules: candidate kept private, not deployed. Synthetic checksum smoke: NOT_RUN.

Additional integration blocker: candidate cross-service Rules point to `(default)`; production database ID is `default`. Existing emulator tests exercise `(default)` and cannot prove that named-database integration. Official Storage documentation restricts cross-service database access. Resolve through platform confirmation and a secure synthetic test; no duplicate database or weakened tenant boundary. [Official Storage conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

## Secret

Active source: REMOVED; fresh scanner active findings 0. Revocation confirmed: NO. Hard GO blocker: YES. Operator continuation is not revocation confirmation. No token displayed, used, authenticated with, or stored. Provider revocation/rotation must be confirmed separately.

## Real Firebase smoke

Firestore: NOT_RUN. Auth: NOT_RUN. Function: NOT_RUN. Storage: NOT_RUN. Prerequisites blocked. Cleanup: NOT_APPLICABLE, real resources created 0; [empty tracked cleanup manifest](firebase-production-synthetic-cleanup.json). Only a read of a nonexistent synthetic Firestore path was attempted for IAM diagnosis; HTTP 403, no customer data read/write.

## Rollback synthetic rehearsal

Real-project result: NOT_RUN, blocked by capabilities. Emulator result: PASS for isolated transactional synthetic payment/journal, idempotency, Firestore-only detection and exact cleanup plan. Backend remains Supabase; source customer writes 0. Existing GO rollback PASS remains a plan-level result and is not represented as a real rehearsal PASS.

## GO engine

Previous: NO_GO — 14 PASS / 6 FAIL / 2 NOT RUN / 0 missing.

Current: NO_GO — 15 PASS / 6 FAIL / 1 NOT RUN / 0 missing.

Machine evidence: [current GO](firestore-production-dry-run.json), [closure matrix](firebase-production-env-blocker-closure.json). The 22 required gate identities and evaluateGo semantics are unchanged. Rules closure is source/release/hash capture plus existing emulator evidence. Index readiness now matches specifications and READY state rather than a count. Nothing absent was counted as PASS. Real smoke/rollback are additional blockers even though the legacy engine does not enumerate them independently.

## Harness

Steps: 21/21. Tests: 189. Assertion sites: 607. Failures: 0.

Previous baseline retained: 19/19, 172 tests, 528 assertion sites. Added 14 environment/cleanup/Rules artifact guards and 3 isolated synthetic callable tests. Supplementary local regression: 15/15 PASS, 0 failures, including the existing 10-step PostgreSQL migration/reconciliation harness and native PostgreSQL security plus application suites. [Main harness](firestore-full-harness.json), [supplementary regression](firebase-environment-regression.json). Corpus evidence from the prior migration phase is preserved, not presented as a fresh customer-corpus migration. A discarded run used the wrong emulator project; another lost the emulator and completed late. The final verified run replaces these failures; no test was removed or relaxed.

## Production changes

Supabase customer writes: 0. Firebase customer Firestore writes: 0. Firebase customer Auth imports: 0. Customer Storage migration: 0. Backend cutover: NOT STARTED. Write freeze: NOT STARTED. Supabase deletion: NOT STARTED. Cloud SQL: NOT USED. Production environment mutations: 0. Real synthetic resources created: 0.

## Remaining actions

[Short executable operator list](../firestore/OPERATOR_ACTIONS_BEFORE_DRY_RUN.md): revocation confirmation, approved commit pin, billing/Blaze, APIs, separated IAM, 3 indexes READY, private Storage provisioning/pin and database compatibility, App Check provider/client integration, separately approved candidate deployment and real synthetic smoke/rollback/cleanup. Do not run production-copy, final-delta, source Auth import, Storage corpus copy, write freeze or cutover.

BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN
