# Firestore Spark production GO checklist

> **Superseded in part — see `migration/reports/FINAL_READINESS_CLOSURE_20260917.md` (run of 2026-09-17).**
> Current measured state: `DRY_RUN_GO = NO_GO`, blockers `iam`, `realClientSmoke`, `secret`.
> The index blocker is **CLOSED**: hard-required went 2 to 3 (paymentDate classified
> REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE) and all 3 are READY in production.
> IAM now targets the dedicated least-privilege principal `mydesck-firestore-migration@`, not
> `mydesck-migration@`; approval hash `347d47b3...` supersedes `880933c4...`.
> Candidate Rules hash `ec881395...` verified by real hashing; the candidate is NOT yet deployed.
> The staged fingerprint `72d33bd9...` quoted below could not be reproduced and is unverifiable; invariance is
> proven instead by the staged-entry hash `afb0a3f2f19e2a1b2a8ea9bf39396956a0d6c87671b2dc7a7f23ea811796e671`.


Machine authority: `migration/reports/firestore-production-dry-run.json`.
Current result: **26 PASS / 3 FAIL / 1 NOT_RUN / 0 MISSING → NO_GO** (dry-run 2026-09-17T07:29:27Z,
commit `6f09f75`). Full narrative: `migration/reports/FINAL_PRODUCTION_READINESS.md` and
`migration/reports/FIREBASE_PRODUCTION_DRY_RUN_FINAL.md`.
Billing, Functions and Storage capability gates were removed only after their runtime proofs
passed. Historical evidence is retained.

| Gate | Current | Evidence / remaining action |
| --- | --- | --- |
| Project, literal `default` database, Spark/no billing | PASS | Read-only production inventory, re-verified 2026-09-14. Billing disabled and unlinked; Enterprise Native, free tier. |
| Auth classification | PASS | 10/10; unknown 0; import not started. |
| Migration IAM | **FAIL** | Synthetic Firestore read by `mydesck-migration@` is HTTP 403; it holds only `roles/firebaseauth.admin`, `firestoreMigrationRolePresent: false`. Operator must apply the reviewed `roles/datastore.user` binding conditioned to `projects/mydesckpro/databases/default`. **Unresolved:** `FIRESTORE_IAM_REQUIREMENTS.md` prefers a separate `mydesck-firestore-migration@` principal so Auth and data authority are not combined; the gate names `mydesck-migration@`. Decide before binding. |
| Current/candidate/rollback Rules readiness | PASS | Current release `c6fc85cd` captured and hash-verified against the expected deny-all baseline; candidate emulator-tested; rollback bytes identical to current. |
| Required indexes | **FAIL** | **2 hard-required, 0 READY** (production has 0 composite indexes). Positional classification was **fixed 2026-09-17**: all four configured specs are now classified by index identity in `migration/firestore/config/index-classification.json`, and an unreviewed spec fails the gate closed. `trips … paymentDate` is **REVIEW_REQUIRED / UNVERIFIED** and needs an operator classification from a supported measurement; Enterprise rejects the Explain API the analyser uses. |
| Quota budget | PASS | Enterprise 4 KiB read / 1 KiB write tranches; 2.592% of 1 GiB; break-even limits recorded. |
| No Functions / no Storage | PASS | Active Firebase-mode graph counts are zero; Functions and Storage APIs disabled in the project; 0 buckets. |
| Critical transactions and malicious client | PASS | Firebase client SDK against emulators: 18 assertions; cross-tenant, financial tamper, self-admin and immutable-event edits denied. |
| Real production client-SDK smoke | **NOT_RUN** | **Gate fixed 2026-09-17**: derived from `migration/reports/firestore-production-client-smoke.json` via `client-smoke-evidence.mjs`, not hardcoded. Current reason `ARTIFACT_ABSENT`. An EMULATOR artifact can never satisfy it. Requires candidate Rules deployed, the hard-required indexes READY, migration IAM, and isolated production test identities. |
| Data, delta, exact finance, relationships, events | PASS | 1,439 documents; financial delta exactly 0 across 1,447 values; orphans 0; event mismatches 0. |
| Search, languages, Electron | PASS | Active Firebase-mode paths are provider-free and bounded. Scoped to the travel workspace — see the parity gate below. |
| Active Firebase-mode Supabase dependency | PASS | Reachable count 0 **from `src/migration-app/main.tsx` only**; fallback disabled. |
| **Active product parity** | PASS | **8 of 8 active verticals are supported in Firebase mode**, 0 blocking. The Firebase root reaches 0 Supabase database, RPC, Auth, realtime and Edge Function call sites; Storage stays behind `StorageRepository`. The shipped root `src/production-main.tsx` still reaches 223 files, 205 forbidden calls and 0 Firestore calls, which is why the selector has not moved. See `migration/firestore/FULL_PRODUCT_FIRESTORE_PARITY.md` and `migration/reports/active-product-parity.json`. |
| GitHub credential revocation | **FAIL** | Removed from active source (scanner passes 3/3, detects credential shapes without returning values). Provider revocation remains **unconfirmed**; no confirmation exists anywhere in the repository. Gate is hardcoded FAIL at `production-dry-run.mjs:85`. Operator action in `FINAL_PRODUCTION_READINESS.md` Phase 1. Cutover forbidden until confirmed. |
| Maintenance, rollback, observability, selector | PASS | Spark transaction journal and fail-closed controls. |

**Source-count validation** is no longer vacuous (fixed 2026-09-17). The dry-run compares a fresh live
measurement (`live-source-inventory.json`, 1,474 rows / 77 tables, read-only with SQLSTATE 25006 write rejection)
against the rehearsal's own `sourceCoverage` reference (1,474 / 77) from a different artifact: delta 0.

**Stale artifact to regenerate before deploying Rules:** `firestore-production-rules-plan.json` records a candidate
hash from 2026-09-14 that no longer matches `firestore.rules`. Verify any deployment against the hash computed from
the file, `ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f`.

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
