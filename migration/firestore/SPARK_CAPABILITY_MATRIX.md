# Firebase Spark capability matrix

Target: project `mydesckpro`, Firestore database ID `default`, Firebase Spark plan, Cloud Billing disabled.

| Capability | Classification | Evidence / design |
| --- | --- | --- |
| Firebase Authentication and token refresh | SUPPORTED_ON_SPARK | Client SDK and Auth emulator lifecycle pass; 10/10 source users classified. |
| Firestore data and transactions | SUPPORTED_ON_SPARK | Client SDK transaction suite covers trip, plan, installment, payment, archive and retry. |
| Firestore Security Rules | SUPPORTED_ON_SPARK | Candidate Rules default-deny and adversarial emulator suites pass. |
| Three composite indexes | SUPPORTED_ON_SPARK | Spark supports composite indexes; production still has 0/3 and needs operator deployment. |
| Business/trip/traveler reads | SUPPORTED_ON_SPARK | Tenant-bound repository queries and Rules. |
| Payment/installment/plan writes | REQUIRES_REDESIGN | Implemented as deterministic client transactions plus immutable events and Rules `getAfter` validation. |
| Audit/events | REQUIRES_REDESIGN | Append-only documents are created atomically with the operation and are immutable to clients. |
| Analytics | REQUIRES_REDESIGN | Bounded aggregation at 250 trips; larger tenants fail with `ANALYTICS_SUMMARY_REQUIRED`. |
| Search | REQUIRES_REDESIGN | Active travel search is bounded to the loaded tenant page; no external paid search or Supabase call is reachable. |
| Archive/delete/restore | SUPPORTED_ON_SPARK | Validated state transaction with immutable operation/activity records. |
| Staff role, root owner and suspension changes | REQUIRES_REDESIGN | Normal clients cannot mutate them; these security changes are operator-only. |
| Printing and PDF export | SUPPORTED_ON_SPARK | Electron/browser OS print dialog; no cloud persistence. |
| Arabic/Hebrew RTL and English LTR | SUPPORTED_ON_SPARK | Existing language regression plus Spark UI directions. |
| Electron | SUPPORTED_ON_SPARK | Renderer uses public Firebase client config only; no Admin SDK or service-account key. |
| App Check for Electron | NOT_REQUIRED | Optional defense; Auth and Rules remain the security boundary. |
| Cloud Functions / Cloud Run / Cloud SQL | NOT_REQUIRED | Zero reachable imports/calls in Firebase-mode graph. Historical packages are retained as evidence only. |
| Firebase/Supabase Storage runtime | NOT_REQUIRED | Zero reachable Storage calls and zero file-upload UI in Firebase-mode graph. Historical bytes remain inventoried. |
| Active Supabase runtime after selector | NOT_REQUIRED | Reachability scan reports zero Firebase-mode calls. Migration/rollback code stays isolated. |

Unknown: **0**. Current environment blockers are IAM, candidate Rules deployment, 3 indexes, secret revocation confirmation, and the dependent real-project client smoke. None requires billing.
