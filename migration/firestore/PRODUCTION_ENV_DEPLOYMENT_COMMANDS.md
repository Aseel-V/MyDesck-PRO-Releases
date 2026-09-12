# Reviewed command templates — operator execution only

These commands change the real project and have **not** been executed. Follow [ordered prerequisites](OPERATOR_ACTIONS_BEFORE_DRY_RUN.md). They do not authorize customer migration. gcloud and Firebase CLI must be authenticated as the appropriate operator.

## Narrow deployment identity

After creating the named identities, the separately authorized IAM operator may bind the custom Rules role, Functions developer role and **runtime-SA-only** actAs:

```powershell
gcloud projects add-iam-policy-binding mydesckpro --member=serviceAccount:mydesck-deployer@mydesckpro.iam.gserviceaccount.com --role=projects/mydesckpro/roles/MyDesckRulesDeployer --condition=None
gcloud projects add-iam-policy-binding mydesckpro --member=serviceAccount:mydesck-deployer@mydesckpro.iam.gserviceaccount.com --role=roles/cloudfunctions.developer --condition=None
gcloud iam service-accounts add-iam-policy-binding mydesck-functions@mydesckpro.iam.gserviceaccount.com --project=mydesckpro --member=serviceAccount:mydesck-deployer@mydesckpro.iam.gserviceaccount.com --role=roles/iam.serviceAccountUser
```

Removal uses the same resource/member/role/condition with `remove-iam-policy-binding`. No project-wide actAs, tokenCreator or Secret Manager role. Initial build/source-bucket permissions and service agents must be inspected after API provisioning; grant only the exact missing permission to the correct build identity. Do not substitute Owner/Editor/Firebase Admin. The current callables have no secrets.

## Rules deployment and exact rollback

Before deployment, compare fresh release/source hashes with the approved manifest and preserve `release/rollback-production` unchanged. Operator-approved candidate deployment:

```powershell
firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.production.json
```

Rollback uses `firebaserules.releases.update`, on only the named Firestore release, pointing to the captured existing ruleset; no ruleset deletion. Run only after explicit rollback approval, using the immutable local manifest:

```powershell
$taskRollback = Get-Content migration/firestore/release/rollback-production/manifest.json -Raw | ConvertFrom-Json
if ($taskRollback.release -ne 'projects/mydesckpro/releases/cloud.firestore/default') { throw 'Rollback resource mismatch' }
$taskRulesToken = gcloud auth print-access-token
$taskRollbackBody = @{ release = @{ name = $taskRollback.release; rulesetName = $taskRollback.ruleset }; updateMask = 'rulesetName' } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Patch -Uri ('https://firebaserules.googleapis.com/v1/' + $taskRollback.release) -Headers @{ Authorization = ('Bearer ' + $taskRulesToken); 'x-goog-user-project' = 'mydesckpro' } -ContentType 'application/json' -Body $taskRollbackBody
Remove-Variable taskRulesToken
node migration/firestore/tools/inspect-production-environment.mjs
```

The Rules token is obtained from authorized Google login, never the revoked GitHub credential. Do not enable shell tracing or print it. Verification must match the immutable rollback source SHA-256; allow propagation before client tests. Current source and rollback both deny all requests.

## Isolated first Function

After billing/IAM/index/Rules/Storage/provider prerequisites and explicit deployment approval:

```powershell
node migration/firestore/tools/build-readiness-smoke-package.mjs
npm --prefix migration/env-blocker-closure.local/smoke-functions ci --ignore-scripts --no-audit --no-fund
firebase deploy --only functions:productionReadinessSmoke --project mydesckpro --config migration/firestore/firebase.readiness-smoke.json
gcloud functions describe productionReadinessSmoke --gen2 --region=us-central1 --project=mydesckpro --format="json(name,state,serviceConfig.serviceAccountEmail,serviceConfig.uri)"
```

Use the deployment's returned URL with a valid synthetic Firebase ID token and App Check token; never invent a URL or disable authentication. The candidate accepts only `{migrationRunId}`. It must return exactly five synthetic IDs, one creation receipt and replay=false, then replay=true for the identical request. The tested core never accepts caller-supplied paths or payment amounts. Do not invoke the application financial callables for this first capability proof. Cleanup includes those five documents and the separately tracked synthetic Auth and Storage resources, then removal of only the synthetic function:

```powershell
firebase functions:delete productionReadinessSmoke --region us-central1 --project mydesckpro
```

The package lock is pinned in `config/readiness-smoke-package-lock.json` and copied by the builder along with only the exact three source files. No production deployment was attempted. Browser/Electron and Storage client integration require their additional proofs in the smoke plan.

## Storage object IAM after pinning

Only after the bucket is returned by authenticated Firebase inventory and pinned:

```powershell
$taskStorageTarget = Get-Content migration/firestore/config/production-storage-target.json -Raw | ConvertFrom-Json
if ($taskStorageTarget.project -ne 'mydesckpro' -or $taskStorageTarget.state -ne 'PINNED' -or -not $taskStorageTarget.bucket) { throw 'Discovered bucket pin required' }
gcloud storage buckets add-iam-policy-binding ('gs://' + $taskStorageTarget.bucket) --member=serviceAccount:mydesck-storage-migration@mydesckpro.iam.gserviceaccount.com --role=roles/storage.objectUser
gcloud storage buckets get-iam-policy ('gs://' + $taskStorageTarget.bucket)
```

Removal changes `add-iam-policy-binding` to `remove-iam-policy-binding`, with the exact same bucket/member/role. This is server migration IAM, not client Rules. Candidate Storage Rules deployment stays blocked by the named-database integration discrepancy; no deployment command is issued as if that discrepancy were solved.
