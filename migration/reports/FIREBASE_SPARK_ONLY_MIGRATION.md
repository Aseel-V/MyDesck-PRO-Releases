# Firebase Spark-only migration report

## Architecture

| Item | Result |
| --- | --- |
| Firebase plan | Spark (verified by no linked billing account and free-tier database) |
| Billing | Disabled; account linked = false |
| Auth | Firebase Authentication client SDK |
| Firestore | `projects/mydesckpro/databases/default`, Native Enterprise free tier |
| Functions | NOT USED IN SPARK ARCHITECTURE |
| Storage | NOT USED IN SPARK ARCHITECTURE |
| Cloud SQL / Cloud Run | NOT USED |
| Supabase final runtime | 0 Firebase-mode reachable dependencies; migration/rollback archive retained |

## Spark capability

Supported: Auth, tenant reads, trips, travelers, atomic payments/installments/plans, immutable audit/events, bounded analytics/search, archive/restore, RTL/LTR, Electron and local print/PDF. Redesigned: privileged Functions operations became deterministic Firestore client transactions protected by Rules. Not required: Functions, Storage, paid servers, Cloud SQL, Cloud Run and runtime role administration. Blocked environment work: migration IAM, 3 indexes, secret revocation confirmation, candidate Rules deployment and dependent production client smoke.

## Storage audit

Historical objects: **3**, 438,670 bytes, including one signature. Active cloud file workflows: **0**. Local-only workflow: OS print/save PDF. Active Storage SDK calls in Firebase mode: **0**. Historical objects remain accounted for in the Supabase read-only archive manifest and were not deleted.

## Functions removal

Previous Functions for trip save, payment, installment, state change and analytics remain as historical test artifacts. Their active replacements are `SparkTransactionService`, bounded repository analytics, and Firestore Rules. Remaining active callable/HTTP/trigger dependencies: **0**.

## Transactions

| Operation | Result | Rules access result |
| --- | --- | --- |
| Trip + travelers + plan + installments + activity | PASS, deterministic transaction | 7 unique for typical 3-installment create; 12 at capped maximum 8 |
| Payment | PASS, immutable event + exact summary delta | 4 unique; per-write max 5 |
| Installment | PASS, event + installment/plan/trip summary | 5 unique; per-write max 5 |
| Plan | PASS, exact split/remainder and schedule completeness | capped at 8 installments |
| Archive/restore/delete | PASS, validated transition + activity | 4 unique; per-write max 5 |
| Retry safety | PASS | IDs/hashes generated before callback; identical replay has one effect |

Every operation stays within 10 Rules document accesses per write and 20 per atomic request.

## Financial security

Transactional authoritative fields are signed safe integer minor units at scale 2: sale, wholesale, paid, due, profit, plan totals, installment expected/paid and event amounts. Migration-only decimal fallback fields are display/nontransactional. Transactional unsupported values: **0 in the verified corpus**. Rules validate currency, scale, revision, exact delta, operation identity and summary relationships. Exact reconciliation remains **1,447 values, unexplained delta 0**. Raw tamper, cross-tenant event, immutable event edit/delete, wrong currency and self-admin attempts are denied.

## Rules

Normal candidate suite: PASS. Tenant isolation: PASS. Firebase client SDK malicious-client suite: DENIED as required. Negative controls catch global reads, authenticated global writes, mutable tenant/owner, editable audit/event, self-admin and self-unsuspend. Current production Rules source/release and rollback bytes are retrievable; candidate hash is recorded in machine evidence and is not deployed.

## Quota

Stored corpus: 1,439 documents; conservative indexed upper bound 27,830,260 bytes (2.592% of 1 GiB). Daily free-tier budget used: 50,000 read units, 40,000 write units and 50,000 realtime units. Typical workflow costs and break-even limits are in `SPARK_QUOTA_BUDGET.md`; analytics is capped at 250 reads and search at 100. Actual daily activity is unknown, so operator monitoring must compare the measured mix to these limits. Exhaustion fails closed with no financial success and no Supabase fallback.

## Application

Travel, payments, installments, plans, audit, archive/restore: PASS in client-SDK emulator. Search: 14/14 classified, blocked 0, active travel path provider-free. Analytics: bounded exact-integer PASS. Documents/PDF: local print/save only. Arabic RTL, Hebrew RTL, English LTR: PASS. Electron build/static assets/updater: PASS. Real production Auth/Firestore client smoke: NOT RUN pending environment gates.

## Supabase burn-down

Global lexical references: 338 (broader than the prior 254 runtime-call inventory). Active Firebase-mode reachable: **0**. Migration-only, rollback-only, test and legacy source remain separated; the active import graph is the machine authority. Unknown: 0.

## Secret

The GitHub credential is removed from active source. Revocation confirmed: **NO**. It remains a hard GO blocker. The token is not stored or displayed here.

## Harness

Steps: **23/23**. Tests: **194**. Assertion sites: **649**. Failures: **0**. Full application assertions: 1,023; security checks: 50; corruption controls: 18. Production build, i18n, desktop assets and updater checks also pass.

## Production changes

| Change | Value |
| --- | --- |
| Customer writes | 0 |
| Firebase customer user imports | 0 |
| Backend cutover | NOT STARTED |
| Supabase deletion | NOT STARTED |
| Billing enabled | NO |
| Functions deployed | NO |
| Firebase Storage provisioned | NO |
| Cloud SQL | NO |

## GO

PASS: **25**. FAIL: **3** (`iam`, `indexes`, `secret`). NOT RUN: **1** (`realClientSmoke`). Missing: **0**. Decision: **NO_GO**.

The software-side Spark architecture is proven without paid services. The production migration dry-run remains blocked until the short operator action file is completed and the real isolated client-SDK smoke passes. Production customer migration was not started.
