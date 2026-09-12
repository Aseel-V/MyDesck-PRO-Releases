# Operator actions before Spark dry-run

No action below authorizes customer migration. Billing must remain disabled.

1. **Confirm GitHub token revocation.** Revoke/rotate the removed credential at GitHub and record only `revoked=true`, timestamp, and verification method. Verification: rerun the secret scanner and inspect the provider's revoked-token list. Rollback: none; issue a new least-privilege credential only if separately needed.

2. **Approve migration Firestore IAM.** Resource: `projects/mydesckpro/databases/default`; identity: `mydesck-migration@mydesckpro.iam.gserviceaccount.com`; candidate: `roles/datastore.user` with the database resource condition where supported. Generate exact add/remove commands with `node migration/firestore/tools/production-iam.mjs --mode=plan`. Verify with `node migration/firestore/tools/inspect-production-environment.mjs`; remove only the exact generated binding after migration. Do not grant Owner, Editor, Firebase Admin, billing, broad actAs, or Secret Manager.

3. **Deploy the reviewed candidate Firestore Rules.** Resource: release `projects/mydesckpro/releases/cloud.firestore/default`. Command: `firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.production.json`. Verify by rerunning the environment inventory and comparing candidate/deployed SHA-256. Roll back by redeploying the captured source in `migration/firestore/release/rollback-production/`.

4. **Deploy exactly three verified indexes.** Review `node migration/firestore/tools/production-index-plan.mjs`, apply only its three MISSING entries with the narrow index deployment identity, then rerun until 3/3 `READY`. Remove only exact newly created index resource IDs if rollback is required.

5. **Run isolated real-project client smoke.** Only after 1–4 pass, create migration-test Auth identities and collision-safe synthetic IDs, run client-SDK tenant/payment/idempotency denials, then clean exact manifest entries. Rerun `node migration/firestore/tools/production-dry-run.mjs --mode=dry-run`.
