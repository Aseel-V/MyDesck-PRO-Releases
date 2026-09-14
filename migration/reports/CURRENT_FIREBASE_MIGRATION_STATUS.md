# Current Firebase migration status — evidence audit

Audit date: **2026-09-14**. Mode: **read-only status audit**. Production mutations caused by this audit: **0**.
No deployment, IAM change, billing change, index creation, Rules deployment, user import, or data migration was performed.

---

## 1. Current repository

| Item | Verified value |
| --- | --- |
| Branch | `codex/firebase-migration` |
| HEAD | `dbd76031e28c2f72b301cb3b80706e6806789e74` |
| HEAD subject | `Refactor Firebase runtime for Spark-only operation` (2026-09-12 17:26 +0300) |
| Latest migration commit | `dbd7603` (same as HEAD) |
| Latest recovery tag | `recovery/pre-spark-readiness-closure-20260912-175721` → annotated tag on `dbd7603` (2026-09-12 17:57) |
| Working tree | **DIRTY — mid-refactor, and currently red** |
| Staged path count | **212** (208 added, 4 modified) |
| Unstaged modifications | **12** tracked files |
| Untracked | **7** files |

### Newer evidence exists after HEAD

Files dated **2026-09-12 17:58 → 18:08** post-date the last commit (17:26). They are an **in-progress "Spark readiness closure"** phase, guarded by the recovery tag above:

- Reworked `spark-readiness.mjs` quota model to Enterprise 4 KiB read / 1 KiB write tranches
- `environment-readiness.mjs`: removed the implicit `__name__` tie-breaker assumption (Enterprise does not add one); broadened the IAM condition to document descendants
- `firestore.indexes.json`: explicit `__name__` ordering on the two paginated trip indexes
- `firebase.production.json`: **removed the `functions` and `storage` blocks** (Spark-only alignment)
- New tools: `enterprise-index-analysis.mjs`, `production-iam-analysis.mjs`, `production-rules-plan.mjs`
- New suite: `enterprise-readiness.test.mjs`; harness runner now defines **24 steps** (was 23)

**This work is incomplete.** `enterprise-readiness.test.mjs` reads `migration/reports/firestore-production-rules-plan.json`, which **does not exist**. Running the suite read-only today produces `ENOENT` at module load: `tests 1, pass 0, fail 1`. The committed harness evidence (23/23, 0 failures) therefore **does not describe the working tree**.

---

## 2. Migration timeline (verified from tags, commits and dated evidence)

| # | Milestone | Commit / tag | Decision | Key evidence | Current relevance |
| --- | --- | --- | --- | --- | --- |
| 1 | Supabase security stabilization | `8b0e963` / `recovery/phase1-20260908-115621` | Baseline secured | Postgres RLS/security suites | Historical; source stays authoritative |
| 2 | Firebase Auth compatibility proof | `79383b3` / `recovery/pre-firebase-migration-20260909-070229` | PASS | `real-gotrue-firebase-proof.json` — 42/42 tests, 3 accounts, impersonated SA, no static key, `existingCustomerChanges: 0` | Still the Auth compatibility basis |
| 3 | Full Firebase migration branch point | `16c7117` / `recovery/full-firebase-migration-20260909-073409` | — | — | Historical |
| 4 | Staging data migration | `287f4cc` / `recovery/pre-staging-data-migration-20260909-160436` | PASS | `STAGING_DATA_MIGRATION_PROOF.md`, `FULL_STAGING_MIGRATION_PROOF.md` | Superseded by #7 |
| 5 | Firestore-native data model, exact money, parity proof | `8368b17` / `recovery/pre-firestore-native-migration-20260909-220516` | PASS | `FIRESTORE_NATIVE_MIGRATION_MILESTONE_1.md` | Current data model authority |
| 6 | Firestore application-layer migration | `0f83ade`→`7fc7f99` / `recovery/pre-firestore-app-layer-20260911-032118` | PASS | `FIRESTORE_APPLICATION_LAYER_MILESTONE.md`, server-authoritative travel transactions | Current app layer (travel only) |
| 7 | Full migration rehearsal | `43fe089` / `recovery/pre-full-firestore-rehearsal-20260911-133801` | PASS | 1,439 docs, 10 reconciliation levels PASS, 18/18 corruption controls | **Current data authority** |
| 8 | Production-preparation blocker closure | `6cd86d9` / `recovery/pre-production-prep-blocker-closure-20260911-161337` | NO_GO | `FIRESTORE_PRODUCTION_PREP_BLOCKER_CLOSURE.md` | Superseded |
| 9 | Production migration preparation | `a242f51` / `recovery/pre-firestore-production-migration-preparation-20260911-203130` | NO_GO — GO 14/6/2/0 | `firestore-production-migration-preparation.json` | Superseded |
| 10 | Firebase environment blocker closure (Phase 4B) | `9bb74af`, `51e163f` / `recovery/pre-firebase-env-blocker-closure-20260912-045538` | NO_GO — GO 15/6/1/0 | `FIREBASE_PRODUCTION_ENV_BLOCKER_CLOSURE.md` | Superseded; its Blaze recommendation is now **stale** |
| 11 | **Spark-only refactor** | `dbd7603` / `recovery/pre-firebase-spark-only-20260912-163431` | NO_GO — **GO 25/3/1/0** | `FIREBASE_SPARK_ONLY_MIGRATION.md`, `firebase-spark-runtime-proof.json` | **Current architecture authority** |
| 12 | Spark readiness closure | **uncommitted**, `recovery/pre-spark-readiness-closure-20260912-175721` | In progress, **red** | Enterprise index/IAM/Rules analyses | **Newest evidence; supersedes #11 on indexes, quota units and deploy config** |

---

## 3. GO engine — current machine-readable result

Recomputed **read-only** on 2026-09-14 using the working-tree engine (`production-guard.mjs` + the uncommitted `production-dry-run.mjs` gate logic) against current evidence. No report file was written.

| Metric | Value |
| --- | --- |
| PASS | **25** |
| FAIL | **3** |
| NOT RUN | **1** |
| MISSING | **0** |
| Decision | **NO_GO** |
| Blockers | `iam`, `indexes`, `realClientSmoke`, `secret` |

Identical to the committed `firestore-production-dry-run.json` (2026-09-12T14:25:17Z). **No regression, no numeric improvement.** The one substantive change is gate semantics: `indexes` now requires **2 hard-required** indexes READY instead of 3.

### Non-PASS gates

| Gate | Status | Why | Exactly what must happen | Operator? | Code? | Prod mutation? | Blocks dry-run | Blocks cutover |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `iam` | FAIL | `mydesck-migration@mydesckpro.iam.gserviceaccount.com` synthetic Firestore read returns **403 PERMISSION_DENIED**; current bindings empty; Policy Troubleshooter API disabled so effective analysis is NOT RUN | Apply reviewed `roles/datastore.user` with the `default`-database IAM condition (approval sha `880933c4…`), then re-run the read-only inventory | **YES** | No | Yes — IAM only, no data | YES | YES |
| `indexes` | FAIL | Production has **0 composite indexes**; 2 of 3 candidates are hard-required | Create the 2 `trips` composite indexes with the narrow index-deployer identity and reach `READY` | **YES** | No | Yes — index metadata only | YES | YES |
| `secret` | FAIL | GitHub classic PAT removed from active source, but `revocationState: EXPLICITLY_OPERATOR_BLOCKED` | Revoke/rotate at GitHub; record only `revoked=true`, timestamp, verification method | **YES** | No | No | YES | YES |
| `realClientSmoke` | NOT_RUN | Only evidence has `target: "EMULATOR"`. Production Rules are **deny-all**, so no client can read or write | After the three gates above **and** candidate Rules deployment: run isolated client-SDK smoke with `migration-test--` identities, then exact-ID cleanup | **YES** (depends on operator gates) | Yes (runner) | Synthetic only, never customer data | YES | YES |

A fifth operator action — **deploying the candidate Rules** — is not its own gate but is a hard prerequisite for `realClientSmoke`.

---

## 4. Auth status

| Item | Value |
| --- | --- |
| Source user count | **10** |
| TRANSPARENT | **7** |
| REAUTH_REQUIRED | **0** |
| RESET_REQUIRED | **0** |
| MANUAL_OPERATOR_ACTION | **3** (all `MISSING_PROFILE_AND_BUSINESS`) |
| INTENTIONALLY_EXCLUDED | **0** |
| **UNKNOWN** | **0** ✅ (target met) |
| Accounted | 10 / 10 |
| UID preservation | **All 10 preserved**; `uidMismatches: 0`; `sourceTargetUidEqual: true` for every account |
| Firebase Auth compatibility proof | **PASS** — 42/42 tests, bcrypt-compatible import path, hashes/passwords/tokens memory-only |
| Production Firebase user import | **0** |

**Have real production users been imported yet? — NO.**

No password hashes, passwords, tokens, emails or names appear in this report; only UID fingerprints exist in the source evidence.

---

## 5. Firestore data status

| Item | Value |
| --- | --- |
| Source tables/domains mapped | **77 / 77** |
| Unknown mappings | **0** ✅ |
| Full rehearsal source rows | **1,444** (1,436 migrated, 8 excluded — credential fields requiring reprovision) |
| Firestore rehearsal documents | **1,439** (emulator `mydesck-migration-proof`) |
| ID mismatches | **0** (`uidMismatches` 0, `pkDocumentIdMismatches` 0) |
| Relationship mismatches | **0** of 3,047 checked |
| Migration-created orphans | **0** (1 pre-existing source orphan, not introduced) |
| Cross-tenant references | **0** |
| Event mismatches | **0** — 953 events, 0 missing / 0 extra / 0 ordering / 0 amount |
| Timestamp mismatches | **0** of 1,784 compared; 0 precision-loss cases |
| JSON / null issues | **0** of 2,025 compared; SQL-null vs JSON-null preserved |
| Document sizes | 1,436 SAFE, 0 near-limit, 0 too-large; largest 4,835 B |
| Restart / idempotency | PASS — 1,444 distinct ledger keys, 1,439 distinct target paths, 0 duplicates |
| Reconciliation status | **RECONCILED** — all 10 levels PASS |

**Has production customer data been copied to real Firestore? — NO.** Target mode was `emulator`; `productionWrites: 0`, `firebaseCustomerWrites: 0`.

---

## 6. Financial status

| Item | Value |
| --- | --- |
| Values reconciled | **1,447** |
| Currencies tested | **4** — EUR, ILS, USD, UNSPECIFIED |
| Per-value mismatches | 0 |
| Digest mismatches | 0 |
| Derived summaries checked | 198, mismatches 0 |
| **Unexplained financial delta** | **0** ✅ (exact; not rounded) |
| Exact-money representation | Signed safe-integer **minor units, scale 2**, with matching `{currency, units, unitsText, scale}` maps |
| Payment transactions | PASS — atomic immutable payment/audit/activity + exact summary delta |
| Installment transactions | PASS — event + installment/plan/trip summary |
| Idempotency | PASS — `sparkOperations/{uid}__{operationId}`; IDs/fingerprints computed before the transaction callback; identical replay has one effect, conflicting reuse rejected |
| Concurrency | PASS with a named hotspot: the trip document serializes concurrent financial updates; idempotent `ABORTED` retry is **required** |
| Tamper protections | Raw balance overwrite, cross-tenant event, immutable event edit/delete, wrong currency, wrong scale and self-admin all **DENIED** |

### Unresolved financial limitations

1. **Scale ceiling.** Any future transactional currency or value that cannot be represented in safe scaled-integer arithmetic **blocks the Spark workflow**. Only the currently verified corpus is proven representable.
2. **Decimal fallback fields.** Migration-only decimal-string fields are display/nontransactional. They are not covered by the transactional guarantees above.
3. **Installment cap.** New plans are capped at **8 installments** so schedule completeness fits the Rules access budget. At 8, the per-write Rules access count sits **at the limit of 10** with zero headroom.
4. All financial proof is **emulator-only**. No real-project financial transaction has ever executed.

---

## 7. Firestore edition / plan — real project `mydesckpro`

Read-only inventory generated 2026-09-12T14:58:17Z, `readOnly: true`, `productionMutations: 0`.

| Item | Verified value |
| --- | --- |
| Firebase plan | **Spark** |
| Billing linked | **NO** (`billingEnabled: false`, `accountLinked: false`) |
| Firestore database ID | **`default`** (`projects/mydesckpro/databases/default`) |
| Firestore edition / mode | **ENTERPRISE / FIRESTORE_NATIVE**, `freeTier: true`, location `nam5`, optimistic concurrency |
| PITR / delete protection | Both **DISABLED** |
| Firestore reachable? | **Yes for the operator identity** (metadata, indexes). **No for the migration service account** — 403 PERMISSION_DENIED |
| Rules readable? | **Yes for the operator** — release + ruleset + source captured and hash-verified. **No for the migration SA** (`firebaserules.releases.get` 403) |
| Indexes readable? | **Yes** — result is an **empty list** (0 composite indexes) |
| Auth reachable? | Yes — App Check service config readable; Firestore + Identity Toolkit both `UNENFORCED` |

### API limitations encountered (all read-only)

- `cloudfunctions.googleapis.com` — **DISABLED**
- `firebasestorage.googleapis.com` — **DISABLED** (0 project buckets)
- `policytroubleshooter.googleapis.com` — **DISABLED** → effective-IAM analysis is **NOT RUN**, not "clean"
- Enterprise `RunQuery` rejects Explain options: `INVALID_ARGUMENT — Explain options are not supported in RunQuery API for Enterprise edition. Please use the ExecutePipeline API instead.` → **index query plans could not be verified**; index classification is corpus-size reasoning, not plan-verified
- `migrationDatabasePermissions` returned HTTP 500 INTERNAL

---

## 8. No-billing status

| Item | Value |
| --- | --- |
| Active Cloud Functions calls | **0** |
| Active Firebase Storage calls | **0** |
| Active paid backend dependencies | **0** |
| Billing required for normal runtime? | **NO** |

**Proof, not assertion.** The Firebase-mode composition root `src/migration-app/main.tsx` was walked by import graph: **10 reachable files**, with `functionsImports: []`, `storageImports: []`, `supabaseImports: []`, `privilegedRuntime: []`, `fileInputs: []`. Independently corroborated by the real project: Functions API disabled, Storage API disabled, zero buckets, billing unlinked — the architecture is running against a project that **cannot** use paid services.

---

## 9. Storage status

| Item | Value |
| --- | --- |
| Historical Storage object count | **3** |
| Historical Storage bytes | **438,670** |
| Historical signature objects | 1 |
| Active Firebase Storage calls | **0** |
| Active Supabase Storage calls in Firebase mode | **0** |
| Active upload UI | **0** |
| Active signature-image dependency | **0** |
| Active attachment cloud dependency | **0** (corpus `attachments: 0`) |
| Local Electron PDF/file behaviour | OS print/save dialog only; no cloud persistence |
| Production buckets | **0**; Storage API disabled |

Historical objects remain in a **read-only Supabase archive manifest**, not deleted and not copied into Firestore. Storage rehearsal: 3/3 manifested, 3/3 copied, 0 SHA mismatches, 0 privacy failures, 0 migration-created orphans.

**Classification: NO STORAGE REQUIRED** — for the Firestore-mode travel runtime that is actually reachable today.

---

## 10. Supabase runtime status

| Classification | Count |
| --- | --- |
| Total lexical references (`src/`) | **338** |
| Firebase-mode reachable | **0** ✅ |
| Runtime-call inventory (separate scan) | 254 |
| — migration-only / rollback-only | 8 |
| — removed before cutover | 111 |
| — legacy vertical, unreachable after selector | 135 |
| — test-only | 0 |
| — dead code | 0 |
| — **active blocker** | **0** ✅ |
| Post-cutover reachable production-active | **0** |
| Unknown | **0** |

**Reachable Supabase runtime dependencies in Firebase production mode = 0.** Target met.

**Is silent fallback from Firestore to Supabase possible? — NO.** Two independent guards:
1. `selectBackend()` throws `SUPABASE_FALLBACK_MUST_BE_DISABLED` unless `VITE_SUPABASE_FALLBACK_DISABLED === 'true'`, plus `REAL_FIRESTORE_REQUIRES_PRODUCTION_BUILD`, `REAL_FIRESTORE_TARGET_MISMATCH`, `REAL_FIRESTORE_RELEASE_NOT_APPROVED`, `FIREBASE_SPARK_PLAN_REQUIRED`, `FIREBASE_BILLING_MUST_REMAIN_DISABLED`.
2. `assertNoSilentFallback()` throws `SILENT_SUPABASE_FALLBACK` if a Firestore-primary result ever records a fallback attempt.

Quota exhaustion fails closed: no financial success is shown and no Supabase path is taken.

### ⚠ Scope finding — the Spark proof covers the travel workspace, not the whole product

`index.html` loads `/src/main.tsx`, which is a **selector**:

```
mode === 'supabase'  → ./production-main   (full legacy MyDesck PRO app)
otherwise            → ./migration-app/main (10-file Firestore travel workspace)
```

The default is `supabase`. The "0 reachable Supabase / 0 Functions / 0 Storage" result is measured from the **migration-app** entry only. The restaurant, market, vehicle/car-parts and government verticals (135 `LEGACY_VERTICAL` call sites) have **no Firestore application layer**. This is documented in `SUPABASE_RUNTIME_BURNDOWN.md` — it is disclosed, not hidden — but it means the architecture migration is complete for travel and **not started for the other verticals**.

---

## 11. Cloud Functions status

| Item | Value |
| --- | --- |
| Active callable Functions | **0** |
| Active HTTP Functions | **0** |
| Firestore triggers required | **0** |
| Server runtime required | **NO** |
| Functions deployment required | **NO** |

Spark target met. Previous Functions for trip save, payment, installment, state change and analytics were replaced by `SparkTransactionService` deterministic client transactions + bounded repository analytics + Firestore Rules. Historical Function sources remain as evidence only, marked `NOT_USED_IN_SPARK_ARCHITECTURE`, and are **not** deployment prerequisites. The uncommitted `firebase.production.json` no longer contains a `functions` block at all, so the Spark deploy config **cannot** deploy one.

---

## 12. Security Rules status (candidate, emulator)

| Item | Result |
| --- | --- |
| Candidate Rules test suite | **25 tests, PASS** |
| Full-corpus security checks | **50 / 50 PASS** (6 businesses, 6 users) |
| Corruption/negative controls | **18 / 18 detected** |
| Adversarial malicious-client suite | **DENIED as required** |
| Cross-tenant read/write denial | PASS |
| `ownerUid` mutation | DENIED |
| `businessId` mutation | DENIED |
| Self-admin / role escalation | DENIED |
| Self-unsuspend | DENIED |
| Financial summary overwrite | DENIED |
| Audit mutation | DENIED |
| Immutable financial events (edit/delete) | DENIED |
| Global read / authenticated global write | DENIED |
| Server-only collection write | DENIED |
| Rules access-call limit checks | **PASS** — every operation ≤ 10 accesses per write and ≤ 20 per atomic request |

Rules access budget detail: trip create (3 installments) 7 unique / max 7 per write; trip create (8 installments) 12 unique / **max 10 per write — at the limit**; edit 4/3; payment 4/5; installment 5/5; archive-restore 4/5.

**Candidate Rules were NOT deployed by this audit.**

---

## 13. Real Firestore Rules state

| Item | Value |
| --- | --- |
| Production release | `projects/mydesckpro/releases/cloud.firestore/default` |
| Production ruleset | `projects/mydesckpro/rulesets/c6fc85cd-4681-491c-bb7c-b879e5893a92` (created 2026-09-09) |
| **Production Rules hash** | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |
| **Candidate Rules hash** | `e77ed17b8e3652a5523b25d4fb524f5afa4ec2de291ce23baf74d1a54349e9ba` |
| Same or different? | **DIFFERENT** |
| Candidate deployed? | **NO** |
| Rollback Rules available? | **YES** — captured bytes hash-verified, identical to current |

**Production Rules are deny-all:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

This is why `realClientSmoke` cannot run: no client SDK can read or write production Firestore at all. It is also a safe baseline — rollback restores exactly this fail-closed state. Nothing was changed.

---

## 14. Index status

Enterprise Native mode: **unindexed queries still execute**, so a missing index is a *cost* problem, not automatically a correctness problem. Classification below reflects that.

| # | Collection group | Query | State | Correctness? | Performance? | Free-tier efficiency? | Optional? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `trips` (ownerUid, businessId, isDeleted, startDate, `__name__`) | `listTripsForBusiness` — tenant, deletion state, start-date cursor | **MISSING** | No | Yes | **YES — hard gate** | No |
| 2 | `trips` (+ `status`, `__name__`) | `listTripsForBusiness` with status filter | **MISSING** | No | Yes | **YES — hard gate** | No |
| 3 | `tripInstallments` (ownerUid, businessId, status, dueDate) | `listDueInstallments` | **MISSING** | No | Marginal | No — cost optimization at 37 rows | **Yes** |

**Hard-required indexes: 2. Hard-required READY: 0.**

Evidence: at the current 99-trip corpus an unindexed trip-list scan costs **117 read units** versus **51** for the indexed 25-result page — materially more than double, on the most common screen. The installment index covers 37 rows and stays bounded, so its absence does not block a no-customer-write dry-run; it should be revisited as that collection grows.

**Evidence limitation:** query-plan verification returned `INVALID_ARGUMENT` on all three candidates because Enterprise `RunQuery` does not support Explain options. The classification is therefore corpus-size reasoning, **not** an executed plan proof.

⚠ Three committed documents still say "deploy exactly three indexes / wait for 3/3 READY" (`OPERATOR_ACTIONS_BEFORE_DRY_RUN.md` step 4, `FIRESTORE_CUTOVER_PLAN.md` step 5, `SPARK_CAPABILITY_MATRIX.md`). They are **stale** against the newer 2-hard-required analysis.

No index was created or modified.

---

## 15. Quota status — Enterprise free tier semantics

Free allowance: **1 GiB stored, 50,000 read units/day, 40,000 write units/day, 50,000 realtime update units/day, 10 GiB egress/month.** Enterprise bills read work in **4 KiB** tranches and write work in **1 KiB** tranches, index work included.

**Estimated stored data:** 1,439 documents, largest 4,835 B. Deliberately conservative 4× data+index upper bound = **27,830,260 bytes = 2.592% of 1 GiB.**

All figures below use the largest document for every document — they are **upper bounds**, not invented averages.

| Workflow | Read units | Write units | Max/day from limiting quota |
| --- | ---: | ---: | ---: |
| Login + business load | 4 | 0 | 12,500 |
| Trip list, 25 results, **indexed** | 51 | 0 | 980 |
| Trip list, **unindexed** scan of 99 trips | 117 | 0 | **427** |
| Trip detail (typical) | 16 | 0 | 3,125 |
| **Create trip + 3 installments** | 38 | **52** | **769** |
| Edit trip | 12 | 17 | 2,352 |
| **Payment** | 20 | **32** | **1,250** |
| **Installment payment** | 26 | **42** | **952** |
| Analytics, current 99 trips | 117 | 0 | 427 |
| **Analytics at 250-trip bound** | 296 | 0 | **168** |
| Search, current 99-trip bound | 117 | 0 | 427 |
| Archive / restore | 14 | 17 | 2,352 |

**Estimated safe daily headroom:** on a pure workload, roughly 769 trip creations, or 1,250 payments, or 952 installment payments, or 168 worst-case analytics runs per day. A mixed workload must sum its actual units against the published limits.

**Largest known quota risk:** analytics at the 250-trip bound (**168/day**), followed by unindexed trip-list and search scans (**427/day**) if the two hard-required indexes are never deployed.

**Usage rate is unknown** and no customer traffic was fabricated.

**Classification: SAFE FOR CURRENT EXPECTED SCALE** — conditional on (a) deploying the two trip indexes before volume grows, and (b) operator monitoring of the measured mix against these break-even limits. Exhaustion fails closed: no financial success, no Supabase fallback.

---

## 16. Search status

| Item | Value |
| --- | --- |
| Search features | **14** |
| Passing (active Spark travel path) | Bounded client filter, full-corpus parity **PASS** |
| Blocked (classification) | **0** |
| Unknown | **0** ✅ |
| Arabic | PASS — permanent fixture |
| Hebrew | PASS — permanent fixture |
| English | PASS — permanent fixture |
| Tenant isolation | PASS — 3 tenants, 99 rows, 12 cases, **0 mismatches**, `piiPersisted: false` |
| Does active search require Supabase? | **NO** |
| Does active search require paid external search? | **NO** |

Spark target met **for the active travel search path**.

### ⚠ Qualification the gate does not capture

Feature dispositions: `BOUNDED_CLIENT_FILTER` 3, **`SEARCH_INDEX_REQUIRED` 10**, `DEFERRED_NONCRITICAL` 1, `FIRESTORE_NATIVE` 0.

The GO gate reads `counts.BLOCKED === 0`, and `BLOCKED` is a *classification* nobody was assigned — so the gate passes while **10 of 14 features have no Spark-compatible implementation**. `SEARCH_PARITY_PLAN.md` routes them through an `ExternalSearchRepository` whose index updates are "emitted by server-authoritative Functions" — i.e. **Functions + a paid search vendor = Blaze**. Separately, `firestore-full-application-parity.json` records `search: BLOCKED`, `criticalParity: BLOCKED` for source-wide substring search, with overall status `PASS_WITH_SEARCH_BLOCKER`.

Those 10 features all belong to the verticals that have not been migrated. They are not blocking today; they **will** block any full-product cutover under Spark.

---

## 17. Analytics status — **PASS (bounded)**

| Item | Value |
| --- | --- |
| Implementation | Bounded client-side aggregation in the Firestore travel repository |
| Bounded reads | **Yes** — hard cap at 250 trips; beyond that the call fails with `ANALYTICS_SUMMARY_REQUIRED` |
| Summary documents | **Designed, not implemented** — the cap is currently the failure mode, not a fallback |
| Exact financial parity | **PASS** — exact-integer ILS/EUR totals, `analytics_financial` and `analytics_derived` assertions 0 failures |
| Unbounded scan risk | **0** measured unbounded collection scans; no N+1 per-child read loop; fixed detail fan-out of 7 |
| Supabase dependency | **0** |
| Functions dependency | **0** |

Cost: 296 read units at the 250-trip bound → 168 runs/day. Any tenant exceeding 250 trips needs the summary-document path built before it can use analytics.

---

## 18. Electron status

| Item | Evidence |
| --- | --- |
| Build | **PASS** — production build, static assets, i18n and updater checks in harness |
| Firebase Auth | **PASS** — login, session persistence across renderer reload, logout/re-login, token refresh |
| Firestore reads | **PASS** — tenant list, trip detail relationships, exact money in ILS and EUR |
| Firestore transactions | **PASS** — create mixed-plan trip with 3 installments, edit, payment, archive |
| Offline / reconnect | **PASS** — offline payment shows failure and leaves the 270.11 balance unchanged |
| Printing | **PASS** — OS print dialog |
| Local PDF | **PASS** — OS save dialog, no cloud persistence |
| Arabic RTL | **PASS** (`dir=rtl`, `lang=ar`) |
| Hebrew RTL | **PASS** (`dir=rtl`, `lang=he`) |
| English LTR | **PASS** (`dir=ltr`, `lang=en`) |
| **Admin SDK bundled?** | **NO** |
| **Service account bundled?** | **NO** — `activePrivilegedCredentials: 0`; packaged files are `dist`, `electron.js`, `updater-policy.cjs`, `preload.cjs`, `assets` |
| Cloud Function dependency | **0** |
| Storage dependency | **0** |

**Requirement met: no privileged server credential in the packaged app.** The renderer uses only the public Firebase web client config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, project `mydesckpro`, database `default`).

**Caveat:** the UI proof ran via Playwright against Vite + emulators, not against a packaged Electron binary. Packaged-binary attestation proof is explicitly **NOT_RUN**.

---

## 19. App Check status — **OPTIONAL_DEFENSE**

Current decision: `NOT_REQUIRED` in the capability matrix; plan document status `EVALUATED — NOT ENFORCED OR DEPLOYED`. Real project shows Firestore, Identity Toolkit and Data Connect all **UNENFORCED**; no App Check provider is initialized in the production client.

App Check is **not** treated as tenant authorization here, correctly. For the packaged desktop path it leans toward **NOT_PRACTICAL_FOR_ELECTRON**: browser reCAPTCHA is not assumed to attest a packaged binary, and the documented alternative — a custom provider verified by a trusted backend that mints tokens — requires a server, which Spark forbids.

**Not blocking.** In its absence, the security boundary is **Firebase Auth + Firestore Security Rules + the adversarial malicious-client suite** (25 Rules tests, 50 security checks, 18 corruption controls, all denials verified). For an untrusted-client architecture where Rules enforce UID, tenant, immutable ownership, immutable events and exact financial deltas, that is a coherent and sufficient boundary for the current scope. App Check would add abuse control, not authorization.

---

## 20. Secret status

Handled without printing, transmitting or testing the credential.

| Item | Value |
| --- | --- |
| Classification | GitHub classic personal access token |
| Present in active source? | **NO** (`activeSourcePresence: false`) |
| Present in staged files? | **NO** (`activeIndexPresence: false`) |
| Present in reachable history? | **NO** — `committedHistorically: false`, 0 matching historical blobs across all locally reachable refs at discovery |
| **Revocation confirmed?** | **NO — `revocationState: EXPLICITLY_OPERATOR_BLOCKED`** |
| Hard cutover blocker? | **YES** |
| Dry-run blocker? | **YES** (GO gate `secret` = FAIL) |
| Scanner regression | 1,169 files scanned, **0 active findings**, PASS, `valuePrinted: false` |

Liveness was deliberately never tested; the token was never transmitted or used for authentication. **Revocation remains unconfirmed.** History scope excludes deleted/unreachable objects and any remote-only refs.

---

## 21. Real project smoke status — **NOT RUN**

The only client-SDK smoke evidence has `target: "EMULATOR"`.

| Check | Status |
| --- | --- |
| Real synthetic Auth user test | **NOT RUN** |
| Real same-tenant read | **NOT RUN** |
| Real cross-tenant denial | **NOT RUN** |
| Real valid trip transaction | **NOT RUN** |
| Real payment transaction | **NOT RUN** |
| Real installment transaction | **NOT RUN** |
| Real financial tamper denial | **NOT RUN** |
| Cleanup | **NOT RUN** — manifest `state: NOT_RUN`, created 0, deleted 0 |

For reference, the **emulator** equivalents all pass: auth PASS, trip PASS, payment PASS, installment PASS, idempotency PASS, crossTenant DENIED, financialTamper DENIED, selfAdmin DENIED, cleanup PASS, `productionCustomerWrites: 0`.

**This audit did not run it, and could not have.** It requires candidate Rules deployment (production is deny-all), the migration IAM binding (currently 403) and the two indexes — all operator actions. Marked **NOT RUN / REQUIRES OPERATOR ACTION**.

---

## 22. Production migration status

| Item | Verified value |
| --- | --- |
| Production Firestore customer writes | **0** |
| Production Firebase Auth imports | **0** |
| Production write freeze | **NOT STARTED** |
| Production final delta | **NOT STARTED** |
| Production backend cutover | **NOT STARTED** |
| Supabase read-only transition | **NOT STARTED** |
| Supabase deletion | **NOT STARTED** |

Confirmed as expected: **NOT STARTED**.

---

## 23. Rollback status

| Capability | Status |
| --- | --- |
| Pre-cutover rollback | **PROVEN** — synthetic emulator rehearsal, exact-ID cleanup with run-marker + receipt + version precondition, wildcard deletion refused |
| Post-Firestore-write rollback | **DESIGNED ONLY** — reverse adapter applying journal order back to Supabase |
| Critical-write journal | **PROVEN (emulator)** — immutable operation/event records written in the same atomic commit with operationId, businessId, entityId, type, actor, timestamp, result, revision, canonical hash |
| Idempotency | **PROVEN** — 1,444 ledger entries / 1,444 distinct keys / 1,439 distinct target paths / 0 duplicates; interrupted run resumed with 199 documents reused without rewrite and 1 retried to verified |
| Supabase return path | **DESIGNED ONLY** |
| Synthetic rollback rehearsal | **PROVEN (emulator)** |
| Real rollback rehearsal | **NOT RUN** |

Rules rollback is genuinely available: the captured rollback bytes hash-match the live deny-all ruleset, and `firebase.rollback-rules.json` points at them.

---

## 24. Harness status

Last run: **2026-09-12T14:25:12Z**, at commit `dbd7603`.

| Metric | Value |
| --- | --- |
| Steps | **23 / 23** |
| Node test cases | **194** |
| Assertion call sites | **649** |
| Failures | **0** |
| Full-corpus application assertions | 1,023 |
| Full-corpus security checks | 50 |
| Corruption controls | 18 |
| Search corpus cases | 12 |
| Evidence presence | 9 expected, **0 missing** |

| Sub-suite | Outcome | Tests |
| --- | --- | --- |
| Auth emulator lifecycle | PASS | 1 |
| Migration / reconciliation (ledger, transform, 77-table map, rehearsal core) | PASS | 11 + 17 + 14 + 6 |
| Financial (exact decimal and money, canonical serialization) | PASS | 19 + 19 |
| Firestore Rules | PASS | 25 |
| Malicious client / negative controls | PASS | within Rules + 50 security checks + 18 controls |
| Transactions (trip; payment/installment/state) | PASS | 17 + 20 |
| Spark client SDK transactions | PASS | script |
| Search repository parity | PASS | script |
| Analytics | PASS | within application boundary + parity corpus |
| Electron / application boundary | PASS | script |
| Quota + no-Functions + no-Storage + Supabase-runtime guard (Spark architecture guards) | PASS | 5 |
| Production preparation guards | PASS | 8 |
| Production environment and cleanup guards | PASS | 14 |
| Production dry-run orchestrator | PASS | script |

### ⚠ This evidence is stale and would not reproduce today

The working tree defines **24** steps — a new suite, *Enterprise index, IAM and deployment guards*, was added. Running it read-only today gives **`tests 1, pass 0, fail 1`**: `enterprise-readiness.test.mjs` throws `ENOENT` because `migration/reports/firestore-production-rules-plan.json` was never generated, even though its generator `production-rules-plan.mjs` exists (untracked).

A re-run today would be **23/24 with 1 failing suite**. No fresh PASS is claimed here.

*(Verified read-only: the missing report's generator, run with its write suppressed, would emit `status: READY_FOR_OPERATOR_DEPLOYMENT`, `currentMatchesExpectedBaseline: true`, `candidateDeployed: false`, `productionMutations: 0` — so the gap is a missing artifact, not a failing check.)*

---

## 25. Production customer safety

| Item | Value | Status |
| --- | --- | --- |
| Supabase production customer writes caused by migration | **0** | ✅ |
| Firestore customer writes | **0** | ✅ |
| Firebase production user imports | **0** | ✅ |
| Real customer Storage migration | **0** / NOT STARTED | ✅ |
| Backend switch | **NOT STARTED** | ✅ |
| Billing enabled | **NO** | ✅ |
| Functions deployed | **NO** (API disabled) | ✅ |
| Storage provisioned | **NO** (0 buckets, API disabled) | ✅ |
| Cloud SQL | **NOT USED** | ✅ |

All source reads ran under `readOnly: true`, `repeatable read` isolation, with `transactionOutcome: ROLLBACK` and a rejected write attempt (`SQLSTATE 25006`) proving read-only enforcement.

**No unexpected non-zero value found.** No previous migration step changed real customer state.

---

## 26. Final status level

**LEVEL 5 — SPARK RUNTIME PROVEN LOCALLY**

Supported: L1 architecture design ✅; L2 emulator proven ✅; L3 full data rehearsal proven ✅ (1,439 documents, 10 reconciliation levels PASS, 18/18 corruption controls); L4 application parity proven ✅ for the declared travel scope (1,023 assertions, 0 failures, bounded-search full-corpus parity 12/12); L5 Spark runtime proven locally ✅ (client-SDK emulator transactions, 0 Functions, 0 Storage, 0 Supabase, Rules access budget within limits, Enterprise quota model).

**Not L6.** Real Firebase synthetic proof is incomplete: `realClientSmoke` NOT RUN, candidate Rules undeployed (production is deny-all), migration IAM 403, 0/2 hard-required indexes READY. No level was skipped.

---

## 27. Completion estimate

Cautious, not a mathematical proof.

| Dimension | Estimate | What remains |
| --- | ---: | --- |
| Architecture migration | **~75%** | Spark-only design complete and proven for travel. The full product still routes to Supabase by default; 135 legacy-vertical call sites and 10 `SEARCH_INDEX_REQUIRED` features have no Spark implementation. |
| Data migration readiness | **~90%** | 77/77 tables mapped, unknown 0, zero financial delta, restart/idempotency proven. Production copy not started; 8 credential fields need reprovision. |
| Security readiness | **~80%** | Candidate Rules proven adversarially in emulator. Undeployed; production deny-all; IAM unapplied; secret revocation unconfirmed; no real-project denial proof. |
| Production environment readiness | **~35%** | Plan/billing/database/edition verified read-only. 0/2 hard indexes, IAM 403, Rules undeployed, Policy Troubleshooter disabled, real smoke NOT RUN. |
| **Overall** | **~70%** | Software is largely proven; the environment is barely started; scope beyond travel is open. |

---

## 28. What is left

### P0 — must fix before the next step
1. **Finish the in-progress Spark readiness closure.** Generate `firestore-production-rules-plan.json`, re-green the 24-step harness, re-run the dry-run GO, commit under the existing recovery tag. *(code, local only)*
2. **Confirm GitHub token revocation** and record `revoked=true` + timestamp + verification method. *(operator)*
3. **Apply the reviewed migration IAM binding** — `roles/datastore.user`, database-scoped condition, approval sha `880933c4…`. *(operator)*
4. **Create the 2 hard-required `trips` composite indexes** and reach READY. *(operator)*
5. **Deploy the candidate Firestore Rules**, replacing deny-all; verify the deployed hash equals `e77ed17b…`. *(operator)*

### P1 — required before cutover
6. Run the **isolated real-project client-SDK smoke** with `migration-test--` identities and exact-ID cleanup; close gate `realClientSmoke`.
7. **Correct the stale documents**: `PRODUCTION_BILLING_READINESS.md` still instructs upgrading to Blaze, which contradicts the current Spark-only architecture; `OPERATOR_ACTIONS_BEFORE_DRY_RUN.md` step 4, `FIRESTORE_CUTOVER_PLAN.md` step 5 and `SPARK_CAPABILITY_MATRIX.md` still say 3/3 indexes.
8. **Decide the cutover scope explicitly.** Travel-only, or full product? If full, the 135 legacy-vertical call sites and 10 `SEARCH_INDEX_REQUIRED` features need a Spark-compatible answer — today they imply Functions + paid search, i.e. Blaze.
9. Implement **analytics summary documents** for tenants above the 250-trip bound.
10. **Real rollback rehearsal**; the post-Firestore-write reverse adapter is design-only.
11. Tighten the **`search` GO gate** so `SEARCH_INDEX_REQUIRED` counts against it rather than passing on `BLOCKED === 0`.

### P2 — cleanup / post-cutover
12. Supabase read-only transition, then deletion after the rollback window.
13. Remove the 111 `REMOVED_BEFORE_CUTOVER` Supabase call sites; retire historical Functions/Storage artifacts.
14. Re-evaluate the `tripInstallments` cost-optimization index as that collection grows.
15. Revisit App Check custom-provider attestation if packaged-desktop abuse control is later wanted.
16. Reconsider the 8-installment cap — it sits exactly at the 10-access-per-write Rules limit with no headroom.

---

## 29. Next exact step

### Milestone: **Complete and commit the Spark readiness closure**

Generate the missing `migration/reports/firestore-production-rules-plan.json` with the existing read-only `production-rules-plan.mjs`, re-run the 24-step harness to a genuine PASS, re-run the dry-run GO to refresh `firestore-production-dry-run.json`, and commit the 7 untracked + 12 modified files under the recovery tag already created for this phase.

**Why this is next:** it is the only remaining step that needs no operator approval, no production mutation and no billing — and it is a prerequisite for everything else. Right now the repository cannot produce a trustworthy GO result: the harness that backs it defines a suite that fails, the newest analyses are uncommitted, and three committed documents contradict the newest index and billing conclusions. The four operator actions should be measured against a green, committed baseline, not a red working tree.

**May it mutate:**

| Target | Mutation |
| --- | --- |
| Customer data | **NO** |
| Firebase Rules | **NO** |
| IAM | **NO** |
| Indexes | **NO** |
| Auth | **NO** |
| Billing | **NO** |

Local repository files only. The rules-plan tool hard-refuses any `--mode` other than `plan` and records `productionMutations: 0`.

**Operator approval needed for this milestone: NO.** Operator approval **is** required for every step after it — secret revocation, IAM binding, index creation and Rules deployment are all operator-only, and the real client smoke depends on all four.

---

## 30. Final decision

# BLOCKED — OPERATOR ACTION REQUIRED

The GO engine returns **NO_GO (25 PASS / 3 FAIL / 1 NOT RUN / 0 MISSING)**. Three of the four blockers — `secret`, `iam`, `indexes` — plus the Rules deployment prerequisite are operator-only actions that no code change can close. The fourth, `realClientSmoke`, is entirely downstream of them.

One code-side precondition remains inside the recommended next milestone (the missing rules-plan artifact and the resulting red suite); it does not change this classification, and no architectural defect blocks the current travel scope.

**Production customer state remains untouched: 0 writes, 0 user imports, 0 cutover, billing disabled.**
