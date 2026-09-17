# Firebase production dry-run — final

> **Superseded in part — see `migration/reports/FINAL_READINESS_CLOSURE_20260917.md` (run of 2026-09-17).**
> Current measured state: `DRY_RUN_GO = NO_GO`, blockers `iam`, `realClientSmoke`, `secret`.
> The index blocker is **CLOSED**: hard-required went 2 to 3 (paymentDate classified
> REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE) and all 3 are READY in production.
> IAM now targets the dedicated least-privilege principal `mydesck-firestore-migration@`, not
> `mydesck-migration@`; approval hash `347d47b3...` supersedes `880933c4...`.
> Candidate Rules hash `ec881395...` verified by real hashing; the candidate is NOT yet deployed.
> The staged fingerprint `72d33bd9...` quoted below could not be reproduced and is unverifiable; invariance is
> proven instead by staged tree object `e9b915a30d3c351d22abe750b061e982ef7cccc3`.


Machine authority: `migration/reports/firestore-production-dry-run.json`.

Decision: **NO_GO.** 26 PASS / 3 FAIL / 1 NOT_RUN / 0 MISSING. Blockers: `iam`, `indexes`, `realClientSmoke`,
`secret`. The orchestrator ran in dry-run mode only and structurally refuses any other mode
(`DRY_RUN_ORCHESTRATOR_REFUSES_WRITES`). It reads committed evidence and `git rev-parse`, and writes exactly one
report.

Run identity: `executableCommitSha 5d8a64b2389bce259217932529d1d835739d208a`, generated 2026-09-17T08:42:36.340Z. This is the run produced after the gate fixes, so its source-count, index and client-smoke evidence are the corrected ones.

## Environment validations

| Check | Result |
| --- | --- |
| Firebase project | `mydesckpro` |
| Firestore database | literal `default` (`projects/mydesckpro/databases/default`) |
| Edition / mode | ENTERPRISE, FIRESTORE_NATIVE, free tier, location `nam5` |
| Billing | disabled, no account attached |
| Functions | not deployed; APIs disabled |
| Storage | not provisioned; 0 buckets |
| Cloud SQL | not used |
| Supabase source project | `pubugnfaqqukelvgckdr` |
| Schema / transform version | 1 / `1.full.1` |
| Rules hash (candidate) | `ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f` |
| Indexes hash | `b4321049ef068288250b8fd59faf935fbd6d78302edcf8b0a36b7177ae4e8bb2` |
| Delta map | 77 tables, 0 unknown |

## Live source, read-only

Re-read this session rather than taken from the rehearsal, inside one REPEATABLE READ READ ONLY snapshot with TLS
verification enabled (`rejectUnauthorized: true`, pinned `SUPABASE_CA_FILE`):

| Measure | Live value |
| --- | ---: |
| Public base tables | 77 |
| Rows | 1,474 |
| Auth users | 10 |

Snapshot evidence, server-reported rather than self-declared:

- `read_only: on` and `isolation: repeatable read` at both start and end
- write rejected with SQLSTATE **25006**; the helper fails closed with `SOURCE_WRITE_CONTROL_FAILED` otherwise
- `successfulWrites: 0`, `transactionOutcome: ROLLBACK`
- the query helper refuses any statement that is not a bare `SELECT`

## Auth

From `firestore-auth-production-readiness.json` (2026-09-11), unchanged and not re-imported:

| Measure | Value |
| --- | ---: |
| Total users | 10 |
| TRANSPARENT | 7 |
| MANUAL_OPERATOR_ACTION | 3 |
| REAUTH_REQUIRED / RESET_REQUIRED | 0 / 0 |
| **unknown** | **0** |
| accounted | 10 |
| uid mismatches | 0 |
| production Firebase imports | **0** |

The three `MANUAL_OPERATOR_ACTION` accounts need a purpose decision before any enablement. No production Firebase
Auth import was performed or attempted.

## Gate results

Passing (26): environment, sparkPlan, auth, rules, quota, noFunctions, noStorage, criticalTransactions,
ruleAccessBudget, maliciousClient, bulkData, delta, financial, relationships, events, search, arabic, hebrew,
english, electron, activeSupabase, activeProductParity, writeFreeze, rollback, observability, backendSwitch.

Not passing:

| Gate | Status | Evidence |
| --- | --- | --- |
| `iam` | FAIL | `mydesck-migration@mydesckpro.iam.gserviceaccount.com`, synthetic Firestore read HTTP 403 |
| `indexes` | FAIL | ENTERPRISE, hard-required 2, ready 0, production composite indexes 0. All four configured specs now classified by identity; `trips … paymentDate` is REVIEW_REQUIRED / UNVERIFIED |
| `realClientSmoke` | NOT_RUN | derived from `firestore-production-client-smoke.json`; reason `ARTIFACT_ABSENT`. Requires deployed candidate Rules, the hard-required indexes READY, IAM, and isolated production identities |
| `secret` | FAIL | credential removed from active source; provider revocation confirmation missing |

`criticalTransactions`, `maliciousClient` and `rollback` derive from
`firestore-spark-client-smoke.json`, which records `target: "EMULATOR"`. They are emulator-scoped evidence and are
not production proof.

## Quota

PASS. Enterprise free tier: 1 GiB stored, 50,000 read units/day, 40,000 write units/day, 50,000 realtime update
units/day, 10 GiB outbound/month. Rehearsed corpus 1,439 documents, largest 4,835 bytes, conservative four-times
data/index upper bound 27,830,260 bytes = **2.592%** of 1 GiB. Conclusion
`SAFE_AT_CURRENT_CORPUS_WITH_BREAK_EVEN_MONITORING`, with `usageRateKnown: false` recorded honestly rather than a
fabricated usage rate. Rules access budget passes: 80 paths, 0 over the 850 ceiling, max 814.

## Rollback, write freeze, backend selector

- Rollback: rehearsed in the emulator with a synthetic operation journal, detection and exact-ID cleanup; real-project
  rehearsal remains dependent on the environment gates.
- Write freeze: maintenance guard with no Supabase fallback; not engaged, and not to be engaged in a dry-run.
- Backend selector: `src/main.tsx` still selects `src/production-main.tsx`. Cutover NOT_STARTED.

## Source-count validation (defect fixed 2026-09-17)

The source-row check previously compared a hardcoded 1,444 against the same hardcoded 1,444 and never read the live
source, so it could not detect drift. It now takes its two halves from different artifacts and fails closed when
either is missing, unproven, or shares an origin with the other.

| Half | Origin | Value |
| --- | --- | ---: |
| Measured | `migration/reports/live-source-inventory.json` (fresh, 2026-09-17T08:31:01Z) | 1,474 rows / 77 tables |
| Reference | `migration/reports/firestore-full-import.json` → `sourceCoverage.rows` | 1,474 rows / 77 tables |
| Delta | — | **0** |

The old 1,444 pin was a ledger-entry count from an earlier rehearsal generation, not a source-row count.
`production-migration.json` now names the artifacts rather than carrying a number.

## Customer mutations

| Counter | Value |
| --- | ---: |
| Production writes | 0 |
| Production customer writes | 0 |
| Production Auth imports | 0 |
| Backend cutover | NOT_STARTED |
