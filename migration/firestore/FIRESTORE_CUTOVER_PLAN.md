# Firestore Spark cutover plan

This plan targets Firebase Authentication + Firestore + Security Rules on Spark. Cloud Billing, Functions, Storage, Cloud Run, Cloud SQL, and paid search are absent.

1. Verify project `mydesckpro`, database ID `default`, free tier/Spark expectation, and billing disabled.
2. Confirm GitHub credential revocation without recording the token.
3. Capture current Rules release/source hash and preserve rollback bytes.
4. Review and deploy the Spark candidate Rules; verify the deployed source hash.
5. Deploy exactly the three active query indexes and wait for 3/3 READY.
6. Apply the reviewed least-privilege migration-writer IAM binding and verify prohibited permissions remain absent.
7. Recalculate the Spark quota budget from the current corpus.
8. Use Firebase client SDK test identities for an isolated real-project Auth/Rules/transaction smoke; clean only exact IDs owned by its migrationRunId.
9. Dry-run the 10-account Firebase Auth migration and Firestore data migration. Do not import or write customers.
10. Rehearse rollback with synthetic journal entries and require exact cleanup/reconciliation.
11. Only in a later approved cutover: bulk-copy data, reconcile, enable maintenance/write freeze, capture the final read-only Supabase delta, apply it, complete Auth work, and reconcile again.
12. Switch the selector once to Firebase Spark with Supabase fallback disabled, run application smoke tests, then disable maintenance.
13. Keep Supabase database/Auth/Storage read-only through the approved rollback window.

Production migration stops on nonzero financial delta, unknown data, quota risk, Rules bypass, active Supabase dependency, missing index, IAM drift, or an unconfirmed credential revocation. This milestone does not execute steps 11–13.
