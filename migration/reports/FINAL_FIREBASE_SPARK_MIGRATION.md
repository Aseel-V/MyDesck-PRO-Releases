# Final Firebase Spark migration — outcome report

Run date: **2026-09-14**. Branch: `codex/firebase-migration`.
Starting HEAD: `dbd76031e28c2f72b301cb3b80706e6806789e74`.
Ending HEAD: `234ff2dc` (2 new commits).
Recovery tag: `recovery/pre-final-firebase-spark-migration-20260914-103342` → `dbd7603`.

**Outcome: stopped after Phase 0 with the Phase 5 gate failed. No production mutation occurred.**

---

## Phases attempted

| Phase | Status | Note |
| --- | --- | --- |
| 0 — Spark readiness closure | **COMPLETE** | Harness 24/24, 199 tests, 688 assertion sites, 0 failures. Committed. |
| Architecture re-verification | **PASS** | Spark, Enterprise Native, 0 indexes, 0 buckets, Functions API disabled, Rules at expected deny-all baseline. |
| 5 — Active product parity (run early) | **FAIL** | 0 of 8 active verticals supported in Firebase mode. Hard cutover blocker. |
| 1 — IAM | **NOT EXECUTED** | Operator authority confirmed; deliberately not applied. See "Why phases 1–4 were not executed". |
| 2 — Rules deployment | **NOT EXECUTED** | Same. |
| 3 — Indexes | **NOT EXECUTED** | Same. |
| 4 — Real client-SDK smoke | **NOT EXECUTED** | Depends on 1–3. |
| 6 — Dry-run | **RUN, NO_GO** | 25 PASS / 4 FAIL / 1 NOT RUN / 0 MISSING. |
| 7–14 | **FORBIDDEN** | Secret gate open and parity gate failed. |

---

## Phase 0 — what was actually wrong and what was fixed

### 1. Missing readiness artifact (the known failure)

`enterprise-readiness.test.mjs` threw `ENOENT` because
`migration/reports/firestore-production-rules-plan.json` had never been generated, although its
generator existed untracked. Generated it read-only:

- current ruleset `c6fc85cd-4681-491c-bb7c-b879e5893a92`, sha `ecf30f94…` — matches the expected deny-all baseline
- candidate sha `e77ed17b…` — differs, not deployed
- rollback sha `ecf30f94…` — identical to current, verified
- `productionMutations: 0`, `status: READY_FOR_OPERATOR_DEPLOYMENT`

Suite now **PASS (5 tests)**.

### 2. Release drift — the most dangerous finding in Phase 0

`production-release-manifest.json` was stale in three ways that mattered:

| Field | Manifest claimed | Actual | Consequence |
| --- | --- | --- | --- |
| `candidateHashes.firestoreRules` | `bfb3413a…` | `e77ed17b…` | Drift on the security-critical artifact; `hashDriftBehavior: REFUSE` would have blocked deploy, or worse, pinned the wrong Rules |
| `candidateHashes.firestoreIndexes` | `b145d250…` | `c516b737…` | Stale index definition |
| `deployment.command` | `--only firestore:rules,firestore:indexes,storage,functions` | — | **Would have attempted Storage and Functions deploys on a Spark project** |

Manifest and `verify-release-package.mjs` are now Spark-only. The verifier asserts the deploy
surface contains no `storage`, `functions`, `database` or `hosting`, asserts
`firebase.production.json` has exactly one key (`firestore`), and returns `decision: GO`.

### 3. Contradictory tests

`production-preparation.test.mjs` asserted `config.functions.source` exists while
`enterprise-readiness.test.mjs` asserted `config.functions === undefined`. The Spark-only refactor
at `dbd7603` removed the config but left its guard behind. Replaced with a Spark-only assertion.

### 4. Emulator toolchain was absent

`firebase-tools` was not installed anywhere. All 8 emulator suites were failing
`ECONNREFUSED 127.0.0.1:8080` — an environment gap, not a code regression. Restored via
`npx firebase-tools@15` with no repository dependency change. A further failure in
*Spark client SDK transactions* was traced to missing emulator fixture state, not a Rules defect:
after seeding the synthetic dataset (`documentsWritten: 130`, `sourceWrites: 0`,
`existingProductionCustomerChanges: 0`) the suite passes with 18 assertions, including the
expected `PERMISSION_DENIED` malicious-client denials.

### Harness

| Metric | Baseline (2026-09-12) | Now |
| --- | ---: | ---: |
| Steps | 23 / 23 | **24 / 24** |
| Node test cases | 194 | **199** |
| Assertion call sites | 649 | **688** |
| Failures | 0 | **0** |

Coverage increased; nothing was removed or weakened.

---

## Phase 5 — the blocker

`src/main.tsx` is a selector, not an application. Measured with the same import-graph walker the
Spark proof uses:

| Composition root | Reachable files | Supabase calls | Storage calls | Firestore calls |
| --- | ---: | ---: | ---: | ---: |
| `src/migration-app/main.tsx` (Firebase mode) | 10 | **0** | 0 | 6 |
| `src/production-main.tsx` (**shipped product**, selector default) | **199** | **297** | **11** | **0** |

`src/components/Dashboard.tsx` dispatches on `profile.business_type` to eight live verticals:
`tourism`, `restaurant`, `supermarket`, `auto_repair`, `car_parts`, `phone_shop`, `clothes_shop`,
`furniture_store`. Only `tourism` has any Firestore layer, and that is a reduced travel workspace,
not the shipped tourism dashboard.

These are not dead paths. The reconciled corpus holds real rows behind them — restaurant alone is
94 rows (orders 10, order_items 17, tables 13, kitchen_tickets 11, ticket_items 17,
menu_categories 17, menu_items 4, staff 1, audit_logs 4), plus `car_parts` 1,
`customer_vehicles` 1, `market_transactions` 1.

**ACTIVE: 8. Supported in Firebase mode: 0. Unknown: 0.**

Switching the selector today would replace a 199-file product with a 10-file travel workspace:
silent feature loss across seven verticals plus a reduced eighth, against live production data.
That is precisely the outcome the absolute safety rule forbids.

Evidence: `migration/reports/active-product-parity.json`, regenerated by
`migration/firestore/tools/active-product-parity.mjs` (read-only, `productionMutations: 0`).

### GO engine correction

`activeSupabase` and `search` measure the Firebase-mode root and legitimately pass for it. Nothing
measured the root the selector actually ships, so `evaluateGo` could in principle have returned
GO while the whole product still ran on Supabase. A new hard gate `activeProductParity` closes
that. This is the most important durable change from this session.

---

## Current GO result

`migration/reports/firestore-production-dry-run.json` — **25 PASS / 4 FAIL / 1 NOT RUN / 0 MISSING → NO_GO**

| Gate | Status | Class | Who closes it |
| --- | --- | --- | --- |
| `iam` | FAIL | Operator action | Apply reviewed `roles/datastore.user`, database-scoped |
| `indexes` | FAIL | Operator action | Create 2 hard-required `trips` indexes, wait for READY |
| `secret` | FAIL | Security / operator | Confirm GitHub credential revocation |
| `activeProductParity` | FAIL | **Architecture** | Migrate remaining verticals, or formally narrow the product |
| `realClientSmoke` | NOT_RUN | Downstream | Depends on iam + indexes + Rules deployment |

Separate decisions: `DRY_RUN_GO` = **NO_GO**. `BULK_COPY_GO`, `CUTOVER_GO`,
`POST_CUTOVER_HEALTHY` = **not evaluated**, prerequisites unmet.

---

## Why Phases 1–4 were not executed

Read-only `testIamPermissions` confirms the operator holds `resourcemanager.projects.setIamPolicy`,
`firebaserules.rulesets.create`, `firebaserules.releases.update`, `datastore.indexes.create` and
`datastore.entities.create`. Phases 1–4 were therefore *executable*. They were not executed as a
deliberate judgment call:

1. The parity gate fails on architecture, so cutover cannot complete in this task regardless.
2. The secret gate is open, which independently forbids Phase 7 onward.
3. Closing the remaining verticals is a substantial engineering programme. Deploying permissive
   Rules now would leave a production project holding a permissive ruleset over an empty database
   for that entire period, with the app still on Supabase and nothing to gain. **Deny-all over an
   empty database is the correct resting posture.**
4. Granting the migration service account write IAM has the same shape: real standing privilege,
   no near-term use.

All four remain ready and all are reversible — rollback Rules captured and hash-verified
byte-for-byte, indexes deletable by exact resource ID, IAM binding removable by the exact
generated `remove-iam-policy-binding` command.

---

## Production customer safety

| Item | Value |
| --- | --- |
| Supabase production customer writes | **0** |
| Firestore production customer writes | **0** |
| Firebase production Auth imports | **0** |
| Production Rules changed | **NO** — still `c6fc85cd`, deny-all |
| Production IAM changed | **NO** |
| Indexes created | **NO** — still 0 |
| Billing enabled | **NO** — disabled and unlinked |
| Functions deployed | **NO** — API disabled |
| Storage provisioned | **NO** — 0 buckets, API disabled |
| Cloud SQL / Cloud Run | **NOT USED** |
| Backend cutover | **NOT STARTED** |
| Supabase deletion | **NOT STARTED** |

All Firestore writes in this session targeted the local emulator project
`mydesck-migration-proof` under structural guards that refuse the production project without the
isolated proof prefix.

## Repository safety

- Recovery tag created before any change, never overwriting a previous tag.
- Staged-preservation manifest captured before and after: **212 entries, sha256
  `cabccf3749351b6fc40452801e341066da5ca520c27981ee93bb1b0f77096a1a`, identical.**
- Explicit pathspecs only. No `git add .`, no `git commit -a`.

---

## What must happen next, in order

1. **Owner decision on product scope.** Either migrate `restaurant`, `supermarket`, `auto_repair`,
   `car_parts`, `phone_shop`, `clothes_shop` and `furniture_store` to a Firestore application
   layer, or formally narrow MyDesck to travel and retire the other business types with a
   customer-communication and data-retention plan. Nothing else unblocks cutover.
2. **Confirm GitHub credential revocation** — independent of 1, and required before any production
   data step.
3. **Then** Phases 1–4 as one reviewable operator batch: IAM binding, candidate Rules deployment,
   2 index creations, isolated real client-SDK smoke with `migration-test--spark-*` identities and
   an exact-ID cleanup manifest.
4. Re-run the dry-run GO and re-evaluate.

Item 1 is the long pole. Items 2–3 are days; item 1 is the actual migration.
