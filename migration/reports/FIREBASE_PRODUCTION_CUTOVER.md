# Firebase production cutover — NOT STARTED

Status as of **2026-09-14**, branch `codex/firebase-migration`, HEAD `234ff2dc`.

**No cutover was performed. No production customer state was changed.**

| Cutover step | State |
| --- | --- |
| Bulk production Firestore copy | **NOT STARTED** |
| Production Firebase Auth import | **NOT STARTED** — 0 users imported |
| Source write freeze | **NOT ACTIVATED** |
| Final source delta | **NOT CAPTURED** |
| Final reconciliation | **NOT RUN** |
| Backend selector switch | **NOT SWITCHED** — still `supabase` |
| Production smoke | **NOT RUN** |
| Maintenance disable | **N/A** |
| Supabase state | **AUTHORITATIVE PRODUCTION SOURCE**, unchanged, not read-only, not deleted |
| Post-cutover journal | **EMPTY** — no post-cutover Firestore writes exist |

## Why cutover did not start

`CUTOVER_GO` was never reachable. The dry-run GO engine returns **NO_GO** with four FAIL gates
and one NOT_RUN. Two are decisive:

1. **`activeProductParity` — architecture.** The shipped composition root
   `src/production-main.tsx` reaches 199 files, 297 Supabase calls and **0 Firestore calls**. The
   dashboard serves eight active verticals and **0 of 8** are supported in Firebase mode.
   Switching the selector would silently remove seven verticals and reduce the eighth, against
   live production data.

2. **`secret` — security.** GitHub credential revocation remains unconfirmed
   (`revocationState: EXPLICITLY_OPERATOR_BLOCKED`). Per the cutover rules this alone forbids any
   production data step.

`iam` and `indexes` are operator approvals, and `realClientSmoke` depends on them. None of those
were executed — see `FINAL_FIREBASE_SPARK_MIGRATION.md` for the reasoning.

## Rollback position

Because no Firestore customer write exists, the rollback rule that applies is the simple one:
**there is nothing to roll back.** Supabase remains the untouched source of truth and the
application still points at it. The captured rollback Rules
(`migration/firestore/release/rollback-production/source-0.rules`, sha `ecf30f94…`) are identical
to the live production ruleset, so even the Rules baseline is unchanged.

If Phases 1–4 are later executed and need reverting:

- **Rules:** `firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.rollback-rules.json`
- **Indexes:** delete only the exact created index resource IDs; never wildcard, never touch
  pre-existing indexes.
- **IAM:** the exact generated `remove-iam-policy-binding` command from
  `migration/firestore/tools/production-iam.mjs --mode=plan`.
- **Synthetic smoke objects:** exact-ID cleanup manifest keyed on `migrationRunId`.

## Preconditions before this document can be rewritten as a real cutover record

1. Owner decision and delivery on product scope for the seven unmigrated verticals.
2. Confirmed GitHub credential revocation.
3. IAM binding applied and negatively proven.
4. Candidate Rules deployed and the deployed hash verified equal to `e77ed17b…`.
5. The 2 hard-required `trips` indexes READY.
6. Real client-SDK synthetic smoke PASS with clean exact-ID cleanup.
7. `DRY_RUN_GO`, then `BULK_COPY_GO`, then `CUTOVER_GO` — each evaluated separately.
