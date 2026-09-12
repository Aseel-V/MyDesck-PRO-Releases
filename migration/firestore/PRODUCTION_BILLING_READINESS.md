# Production billing readiness — Phase 4B

Project: **mydesckpro**. Source: authenticated Cloud Billing `GET /v1/projects/mydesckpro/billingInfo`, recorded in `migration/reports/firebase-production-environment-inventory.json`.

| Requirement | Verified state |
| --- | --- |
| Billing account linked | No; boolean only retained |
| Billing enabled | No |
| Firebase pricing plan | Spark, derived from no linked Cloud Billing account and disabled billing; Firebase CLI uses the same Cloud Billing capability endpoint |
| Functions deployment capability | **FUNCTIONS DEPLOYMENT BLOCKED BY BILLING**; v2 Functions, Run, Build and Artifact Registry APIs disabled |
| Storage capability | Blocked: zero project buckets; Cloud Storage for Firebase API disabled; Blaze required |
| Firestore capability | Native Enterprise database `default`, `nam5`, available; metadata/index reads work for operator; writer data access denied |
| Blocking services | Functions v2, Cloud Run, Cloud Build, Artifact Registry, Firebase Storage |
| Cloud SQL | NOT USED; existing API inventory does not imply architecture usage |

**BILLING OPERATOR ACTION REQUIRED:** in [Firebase project billing](https://console.firebase.google.com/project/mydesckpro/usage/details), upgrade to Blaze by linking an approved Cloud Billing account. Codex did not link, create, upgrade, or disclose an account. The operator needs project billing-assignment permission and permission to use the chosen billing account. Verify with `gcloud billing projects describe mydesckpro --format="value(billingEnabled)"`, then rerun the read-only environment inventory. Do not print the billing account record into migration evidence.

Linking Cloud Billing automatically upgrades Firebase to Blaze. The Firestore free quota does not cover the complete architecture. [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firebase billing FAQ](https://firebase.google.com/support/faq).

Firebase Storage currently requires Blaze for access/provisioning. Keep objects private; a free/public bucket substitute does not close this requirement. [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

Unlinking later is an operator-only rollback that can stop paid-service access. Do not unlink billing as routine smoke cleanup; first verify no dependent workloads exist and approve the consequences.
