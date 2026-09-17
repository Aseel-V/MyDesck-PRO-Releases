# Firestore Spark production GO checklist

Machine authority: `migration/reports/firestore-production-dry-run.json`.
Current result: **26 PASS / 3 FAIL / 1 NOT_RUN / 0 MISSING → NO_GO.**
Billing, Functions and Storage capability gates were removed only after their runtime proofs
passed. Historical evidence is retained.

| Gate | Current | Evidence / remaining action |
| --- | --- | --- |
| Project, literal `default` database, Spark/no billing | PASS | Read-only production inventory, re-verified 2026-09-14. Billing disabled and unlinked; Enterprise Native, free tier. |
| Auth classification | PASS | 10/10; unknown 0; import not started. |
| Migration IAM | **FAIL** | Migration identity synthetic Firestore read is 403. Operator must apply the reviewed `roles/datastore.user` binding scoped to the `default` database. |
| Current/candidate/rollback Rules readiness | PASS | Current release `c6fc85cd` captured and hash-verified against the expected deny-all baseline; candidate emulator-tested; rollback bytes identical to current. |
| Required indexes | **FAIL** | **2 hard-required, 0 READY** (production has 0 composite indexes). The third candidate is a cost optimization and is not a dry-run gate. |
| Quota budget | PASS | Enterprise 4 KiB read / 1 KiB write tranches; 2.592% of 1 GiB; break-even limits recorded. |
| No Functions / no Storage | PASS | Active Firebase-mode graph counts are zero; Functions and Storage APIs disabled in the project; 0 buckets. |
| Critical transactions and malicious client | PASS | Firebase client SDK against emulators: 18 assertions; cross-tenant, financial tamper, self-admin and immutable-event edits denied. |
| Real production client-SDK smoke | **NOT_RUN** | Requires candidate Rules deployed, the 2 hard-required indexes READY, migration IAM, and isolated test identities. |
| Data, delta, exact finance, relationships, events | PASS | 1,439 documents; financial delta exactly 0 across 1,447 values; orphans 0; event mismatches 0. |
| Search, languages, Electron | PASS | Active Firebase-mode paths are provider-free and bounded. Scoped to the travel workspace — see the parity gate below. |
| Active Firebase-mode Supabase dependency | PASS | Reachable count 0 **from `src/migration-app/main.tsx` only**; fallback disabled. |
| **Active product parity** | PASS | **8 of 8 active verticals are supported in Firebase mode**, 0 blocking. The Firebase root reaches 0 Supabase database, RPC, Auth, realtime and Edge Function call sites; Storage stays behind `StorageRepository`. The shipped root `src/production-main.tsx` still reaches 223 files, 205 forbidden calls and 0 Firestore calls, which is why the selector has not moved. See `migration/firestore/FULL_PRODUCT_FIRESTORE_PARITY.md` and `migration/reports/active-product-parity.json`. |
| GitHub credential revocation | **FAIL** | Removed from active source (scanner: 1,193 files, 0 findings). Provider revocation remains unconfirmed. |
| Maintenance, rollback, observability, selector | PASS | Spark transaction journal and fail-closed controls. |

Any FAIL or NOT_RUN keeps the decision `NO_GO`. No production customer migration or backend
switch is authorized.

## Why the parity gate exists

`activeSupabase` and `search` measure the Firebase-mode composition root. Both legitimately pass
for that root. Without a second gate measuring the root the selector actually ships, the engine
could return GO while the product customers use still runs entirely on Supabase. The
`activeProductParity` gate closes that gap and is a hard cutover blocker.

## Ordering

Gates fall into three groups. The operator gates can be closed in any order; the parity gate is
an engineering programme, not an approval.

1. **Operator approval, reversible:** IAM binding, candidate Rules deployment, 2 index creations.
2. **Operator action, outside the repository:** GitHub credential revocation confirmation.
3. **Engineering:** active product parity for the remaining verticals, which then unblocks the
   real client-SDK smoke being meaningful for the whole product rather than for travel alone.
