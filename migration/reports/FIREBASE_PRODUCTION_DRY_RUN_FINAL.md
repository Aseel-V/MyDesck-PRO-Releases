# Firebase production dry-run — final

Machine authority: `migration/reports/firestore-production-dry-run.json`.

Decision: **NO_GO.** 26 PASS / 3 FAIL / 1 NOT_RUN / 0 MISSING. Blockers: `iam`, `indexes`, `realClientSmoke`,
`secret`. The orchestrator ran in dry-run mode only and structurally refuses any other mode
(`DRY_RUN_ORCHESTRATOR_REFUSES_WRITES`). It reads committed evidence and `git rev-parse`, and writes exactly one
report.

Run identity: `executableCommitSha 6f09f75b7b762651f71fe09da6fbf0ff759a6012`, generated 2026-09-17T07:29:27Z.

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
| `indexes` | FAIL | ENTERPRISE, hard-required 2, ready 0, production composite indexes 0 |
| `realClientSmoke` | NOT_RUN | hardcoded; requires deployed candidate Rules, both indexes READY, IAM, isolated production identities |
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

## Defect affecting this dry-run

`production-dry-run.mjs:29` calls `validateCounts({ authUsers: auth.totalUsers, sourceRows: 1444 }, { authUsers: 10,
sourceRows: 1444 })`. The source-row half compares a hardcoded constant against itself and never reads the live
source, so it cannot detect drift. The pinned `expectedSource.rowsAtLastRehearsal: 1444` in
`production-migration.json` also disagrees with both the live count (1,474) and the rehearsal it names (1,474 rows,
1,466 migrated, 8 excluded, 0 unknown). Live has not drifted; the pin is wrong and the check is vacuous until it
reads the live count.

## Customer mutations

| Counter | Value |
| --- | ---: |
| Production writes | 0 |
| Production customer writes | 0 |
| Production Auth imports | 0 |
| Backend cutover | NOT_STARTED |
