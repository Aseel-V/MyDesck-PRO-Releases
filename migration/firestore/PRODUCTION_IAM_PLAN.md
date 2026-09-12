# Production IAM least-privilege plan

Phase 4B current identity/permission evidence and executable plan supersede the proposed identities below: see [PRODUCTION_ENV_IAM_ANALYSIS.md](PRODUCTION_ENV_IAM_ANALYSIS.md). The verified migration writer identity is `mydesck-migration@mydesckpro.iam.gserviceaccount.com`. No grant has been applied.

No role is granted by this plan. Static service-account keys are forbidden. Human operators use short-lived service-account impersonation and receive `iam.serviceAccounts.getAccessToken` only on the named identity they operate.

| Identity | Proposed binding | Scope | Purpose |
| --- | --- | --- | --- |
| `mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com` | custom `MyDesckFirestoreMigrationWriter` | `projects/mydesckpro/databases/default` where database-level IAM supports it; otherwise project binding with an exact database resource condition validated first | create/get/list/update migration-owned documents, ledger and checkpoints; delete only for controlled rollback |
| `mydesck-storage-migration@mydesckpro.iam.gserviceaccount.com` | custom `MyDesckStorageMigrationWriter` | approved Firebase Storage bucket | list/get metadata, create/read/verify target objects, delete migration-owned objects only during rollback |
| `mydesck-functions@mydesckpro.iam.gserviceaccount.com` | `roles/datastore.user`, bucket-scoped `roles/storage.objectUser`, named-secret `roles/secretmanager.secretAccessor`, `roles/logging.logWriter` | database, bucket, individual secrets, project logs | server-authoritative callable Functions |
| `mydesck-deployer@mydesckpro.iam.gserviceaccount.com` | custom `MyDesckFirebaseReleaseDeployer`; `roles/iam.serviceAccountUser` only on the Functions runtime identity | project plus named runtime service account | deploy candidate Rules, indexes and Functions; no data reading |
| approved human operator | `roles/iam.serviceAccountTokenCreator` on the one identity needed per step | service-account resource | keyless impersonation |

## Custom migration-writer permissions

`datastore.databases.get`, `datastore.entities.allocateIds`, `datastore.entities.create`, `datastore.entities.delete`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.update`, `datastore.indexes.get`, `datastore.indexes.list`, `resourcemanager.projects.get`, and `serviceusage.services.use`. The application collections, `_migrationLedger`, `_migrationControl`, and `_postCutoverJournal` are the only allowed logical paths; the tool enforces that allowlist in addition to IAM.

## Custom Storage-writer permissions

`storage.buckets.get`, `storage.objects.create`, `storage.objects.delete`, `storage.objects.get`, `storage.objects.list`, and `storage.objects.update`, scoped to the approved bucket. Source Supabase access remains read-only and separate.

## Custom deployment permissions

Only the permissions exercised by reviewed deployment commands are admitted: read/update Firebase Rules releases and rulesets, create/list/get Firestore indexes, create/update/get/list Cloud Functions v2, read build/operation state, upload build source, and `iam.serviceAccounts.actAs` on `mydesck-functions`. Hosting, project IAM administration, billing administration, Auth user administration, Secret payload access, and customer Firestore reads are excluded.

## Explicitly absent

No proposed identity receives `roles/owner`, `roles/editor`, `roles/firebase.admin`, project-wide `roles/iam.serviceAccountUser`, `roles/iam.serviceAccountAdmin`, `roles/resourcemanager.projectIamAdmin`, Hosting administration, Billing administration, Secret Manager administration, or arbitrary service-account impersonation.

## Effective-permission result

- Migration Auth identity: PASS for separation; observed only `roles/firebaseauth.admin`, with no Firestore/Storage role.
- Proposed Firestore, Storage, Functions and deployer identities: NOT RUN because they do not yet exist and no binding was granted.
- Existing human project Owner: FAIL against the target least-privilege operator model. It is pre-existing and was not changed here.
- IAM policy analyzer/troubleshooter for proposed bindings: NOT RUN until identities and conditional bindings are approved.

Before granting anything, create the custom-role YAML from this permission list, run IAM Policy Troubleshooter for every required and prohibited permission, obtain security approval, and bind one identity at a time. Any unexpected effective permission is `NO_GO`.
