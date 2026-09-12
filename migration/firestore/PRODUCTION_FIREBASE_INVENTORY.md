# Production Firebase inventory

Inventory time: 2026-09-11, read-only. Machine evidence: `migration/reports/production-firebase-inventory.json`.

| Resource | Verified state | Preparation impact |
| --- | --- | --- |
| Firebase project | `mydesckpro` / project number `816880250172`, ACTIVE | expected target |
| Firestore database | exactly `projects/mydesckpro/databases/default`, `nam5`, Firestore Native Enterprise | tooling must require database ID `default`; `(default)` returned 404 |
| Root collections | 0 returned by `listCollectionIds` | production database is currently empty at root; no customer content was read |
| Existing indexes | 0 composite, 0 field overrides | all required indexes must be created and reach READY before switching |
| Firebase Auth | 5 current target users; count only | source plan expects 10; duplicate/UID checks are mandatory before import |
| Auth configuration | NOT RUN: API returned 403 to the inventory principal | exact provider/MFA configuration remains a GO gate |
| Storage | 0 buckets | production Storage copy cannot start until the approved private bucket exists |
| Cloud Functions | API disabled; no deployed inventory available | billing and required APIs must be enabled before deployment rehearsal |
| Firestore/Storage Rules | NOT RUN: Rules API returned 403 | expected-current hashes remain unset; deployment must fail closed |
| Hosting | default site `mydesckpro` exists | Hosting is not required for the data copy; deployment role excludes it |
| App Hosting | unavailable without Blaze | not required by the fixed architecture |
| App Check | API enabled; configuration read returned 403 | provider configuration and Electron proof remain gates |
| Billing | disabled, no billing account attached | Functions and Storage provisioning are blocked |

The registered Firebase client is one active web app. No real Firestore document contents, Auth fields, or Storage bytes were printed or persisted. The Auth count used keyless impersonated ADC and retained only the aggregate.

## IAM observed

`mydesck-migration@mydesckpro.iam.gserviceaccount.com` currently has `roles/firebaseauth.admin` and has no Firestore or Storage role. The proposed Functions runtime identity does not yet exist. One pre-existing human principal holds `roles/owner`; this milestone did not grant or change any IAM role. That broad human role is outside the least-privilege target and must be replaced with the deployment/impersonation model before an actual production GO.

## Read-only commands

- `firebase firestore:databases:list --project mydesckpro --json`
- `firebase firestore:databases:get default --project mydesckpro --json`
- `firebase firestore:indexes --project mydesckpro --database default --json`
- `firebase apps:list --project mydesckpro --json`
- `firebase hosting:sites:list --project mydesckpro --json`
- `gcloud billing projects describe mydesckpro --format=json`
- `gcloud projects get-iam-policy mydesckpro --format=json`
- `gcloud services list --enabled --project=mydesckpro`
- Firestore `documents:listCollectionIds` and aggregate Firebase Admin `listUsers`

No service was enabled and no resource or customer state was changed.
