# Firestore Spark cutover plan

This plan targets Firebase Authentication + Firestore + Security Rules on Spark. Cloud Billing, Functions, Storage, Cloud Run, Cloud SQL, and paid search are absent.

0. **Close active product parity first.** `src/main.tsx` selects between
   `src/production-main.tsx` (the shipped product: 199 reachable files, 297 Supabase calls,
   0 Firestore calls) and `src/migration-app/main.tsx` (10 files, 0 Supabase). The dashboard
   serves eight active verticals and **0 of 8** work in Firebase mode. Until that is resolved —
   by migrating the remaining verticals or by an owner-approved decision to narrow the product —
   every step below is preparation and step 12 must not run. Authority:
   `migration/reports/active-product-parity.json`.
1. Verify project `mydesckpro`, database ID `default`, free tier/Spark expectation, and billing disabled.
2. Confirm GitHub credential revocation without recording the token.
3. Capture current Rules release/source hash and preserve rollback bytes.
4. Review and deploy the Spark candidate Rules; verify the deployed source hash.
5. Create the **2 hard-required** `trips` composite indexes and wait for **2/2 READY**. The third
   candidate (`tripInstallments` due-date) is classified `COST_OPTIMIZATION` at the current 37 rows
   and is not a dry-run gate; revisit it as that collection grows. Enterprise Native executes
   unindexed queries, so a missing index is a cost problem, not a correctness one. Create indexes
   one at a time from the reviewed plan with the narrow index-deployer identity, never by a bulk
   `firestore:indexes` deploy.
6. Apply the reviewed least-privilege migration-writer IAM binding and verify prohibited permissions remain absent.
7. Recalculate the Spark quota budget from the current corpus.
8. Use Firebase client SDK test identities for an isolated real-project Auth/Rules/transaction smoke; clean only exact IDs owned by its migrationRunId.
9. Dry-run the 10-account Firebase Auth migration and Firestore data migration. Do not import or write customers.
10. Rehearse rollback with synthetic journal entries and require exact cleanup/reconciliation.
11. Only in a later approved cutover: bulk-copy data, reconcile, enable maintenance/write freeze, capture the final read-only Supabase delta, apply it, complete Auth work, and reconcile again.
12. Switch the selector once to Firebase Spark with Supabase fallback disabled, run application smoke tests, then disable maintenance.
13. Keep Supabase database/Auth/Storage read-only through the approved rollback window.

Production migration stops on nonzero financial delta, unknown data, quota risk, Rules bypass,
active Supabase dependency, an active product surface unsupported in Firebase mode, a missing
hard-required index, IAM drift, or an unconfirmed credential revocation.

As of 2026-09-14 this plan has executed none of steps 1-13. Step 0 fails, and the credential
revocation in step 2 is still unconfirmed.
