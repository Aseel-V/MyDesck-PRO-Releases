# Phase 4B IAM analysis and operator plan

No binding was applied. Read-only evidence: `migration/reports/firebase-production-environment-inventory.json`.

The actual migration identity is **mydesck-migration@mydesckpro.iam.gserviceaccount.com**. The previous plan's proposed `mydesck-firestore-migration` is not the identity inspected or used here. The required database is **projects/mydesckpro/databases/default**; `(default)` returns 404.

## Observed effective permissions

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Keyless migration impersonation | PASS | Short-lived gcloud token; not stored or printed |
| Project policy inspection | PASS | gcloud policy: migration principal has only `roles/firebaseauth.admin`; no parent on project response |
| Firestore required permissions | FAIL | Project testIamPermissions grants none of the seven requested datastore permissions; nonexistent synthetic document GET returns 403 |
| Rules access as migration identity | FAIL, intentionally separate | `firebaserules.releases.get` explicitly denied; do not add Rules admin to writer |
| Forbidden project permissions | PASS at project scope | None returned for project IAM administration, billing assignment, actAs, or secret payload access |
| Owner / Editor / Firebase Admin on migration identity | PASS | Count 0 in effective project bindings; current bound Auth role permissions are captured |
| Human broad roles | FAIL against the earlier least-privilege target | One pre-existing human Owner; do not remove sole operator access without verified replacement |
| Database-scoped testIamPermissions | NOT RUN | API returns HTTP 500; no assumed grant |
| Policy Troubleshooter | NOT RUN | `policytroubleshooter.googleapis.com` disabled; no API enabled |
| Resource-level actAs | See `serviceAccountActAs` in inventory | Tests against every enumerated service account; no payload/credential use |
| Complete resource-level prohibition analysis | NOT RUN | Troubleshooter unavailable; project test alone does not prove absence of resource-scoped or inherited grants |

`roles/datastore.user` includes entity CRUD and `datastore.databases.get` (required for transactions), without index administration, project IAM, billing, or secrets. A conditional project binding to `resource.name=="projects/mydesckpro/databases/default"` is the documented database separation mechanism. Do not expand to a prefix over all databases if a permission probe fails. Conditions do not isolate collections: the migration tools and synthetic namespace guards remain mandatory. [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam), [database conditions](https://firebase.google.com/docs/firestore/manage-databases).

## Role separation

| Identity / purpose | Required permissions | Predefined candidate | Scope / condition | Excluded powers |
| --- | --- | --- | --- | --- |
| `mydesck-migration` / writer | `datastore.databases.get`, `getMetadata`, `entities.get/list/create/update/delete` | `roles/datastore.user` | project binding, exact `default` database condition | indexes, IAM, billing, actAs, secrets |
| `mydesck-functions` / runtime | transaction and entity CRUD | `roles/datastore.user` | same database condition, distinct identity | Auth admin, Rules, indexes, project IAM, billing, secrets; no Storage role needed by current five callables |
| `mydesck-storage-migration` / object copy | `storage.objects.get/list/create/update/delete`; bucket metadata read separately if needed | bucket `roles/storage.objectUser`; custom `storage.buckets.get` only if tool requires | discovered, pinned bucket only; no grant before pin | bucket creation/deletion/IAM, public access, project roles |
| `mydesck-rules-reader` / capture and compare | `firebaserules.releases.get/list`, `rulesets.get/list` | `roles/firebaserules.viewer` | project (Rules service roles are not document roles) | publishing, data reads, Auth, secrets |
| `mydesck-deployer` / indexes | `datastore.indexes.create/get/list/delete/update` | `roles/datastore.indexAdmin` | project; dedicated operator, never runtime | entity reads/writes, billing, project IAM |
| `mydesck-deployer` / Rules | release get/list/create/update, ruleset get/list/create/test | custom `MyDesckRulesDeployer`; `roles/firebaserules.admin` evaluated but unnecessary delete powers excluded | project; YAML in release directory | Rules deletion, data reads, Auth, billing, IAM |
| `mydesck-deployer` / Functions v2 | function create/get/list/update/delete, build/operation reads and source upload | `roles/cloudfunctions.developer`, named build-source object access as required | project functions and specific source bucket; `roles/iam.serviceAccountUser` only on `mydesck-functions` | runtime data, secrets, billing, project IAM, broad actAs |
| human operator | short-lived token mint for selected work identity | `roles/iam.serviceAccountTokenCreator` | only explicitly named service-account resource | project-wide impersonation, routine Owner/Editor/Firebase Admin |
| billing / IAM administrator | billing assignment or exact approved binding change | separate authorized administrative operator | only project/account necessary for each action | never attach these permissions to migration/runtime |

For initial callable ingress, a human deployment operator reviews the individual Cloud Run service policy. `cloudfunctions.functions.setIamPolicy` / `run.services.setIamPolicy`, if needed, are scoped to the named function/service; do not turn the migration account into a deployment administrator. The current callable package needs no Eventarc trigger identity, no Secret Manager payload access, and no provider notification credentials. Build and managed service agents remain distinct from runtime. [Functions IAM](https://docs.cloud.google.com/functions/docs/reference/iam/roles).

The current `firebaseauth.admin` binding remains pre-existing. Before writer use, the operator should move future Auth work to a separate dedicated identity and remove that binding from the writer after checking dependencies. This milestone imports no Auth users and changes no binding.

## Executable plan / apply

`node migration/firestore/tools/production-iam.mjs` defaults to **plan**, performs no authentication or mutation, and prints exact add/remove commands and an approval hash. To inspect one binding:

```powershell
node migration/firestore/tools/production-iam.mjs --mode=plan --binding=migration-writer
```

Only the operator executes `--mode=apply --binding=migration-writer --approval-sha256=<hash printed by plan>` after reviewing that exact binding. The tool requires one binding, matches all arguments to the hash, and executes without shell interpretation. It never creates accounts or changes billing. Other bindings are listed in the default plan; named accounts must exist first.

After a binding, rerun `inspect-production-environment.mjs`, wait for IAM propagation, and use Policy Troubleshooter on `//firestore.googleapis.com/projects/mydesckpro/databases/default` for required entity/transaction permissions. Test prohibited permissions separately and against other databases / identities. `gcloud policy-troubleshoot iam //firestore.googleapis.com/projects/mydesckpro/databases/default --principal-email=mydesck-migration@mydesckpro.iam.gserviceaccount.com --permission=datastore.entities.create --project=mydesckpro` is the read-only verification command after the operator enables that API. An IAM plan is not IAM readiness.
