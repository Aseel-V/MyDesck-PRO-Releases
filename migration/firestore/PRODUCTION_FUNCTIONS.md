# Production Cloud Functions package

Candidate runtime: Cloud Functions v2, Node.js 22, `us-central1`, 512 MiB, 60-second timeout, maximum 20 instances, dedicated runtime identity `mydesck-functions@mydesckpro.iam.gserviceaccount.com`. All five endpoints are callable, require Firebase Auth and enforced App Check, perform their own user/business/suspension checks under Admin SDK, and expose no secret.

| Function | Input / idempotency | Reads | Writes | Retry and migration safety |
| --- | --- | --- | --- | --- |
| `saveTrip` | strict trip/payment schema; `ownerUid + clientRequestId` | user, business, trip, plan, installments, idempotency | trip, plan, installments, activity, idempotency | Firestore transaction; stable IDs outside retry; `SAFE_DURING_BULK_MIGRATION` |
| `recordPayment` | trip, exact decimal amount/currency, expected revision; same idempotency key | user/business/trip/plan/installments/idempotency | plan, trip, payment event, financial audit, activity, idempotency | bounded ABORTED retry; no outside effects; safe |
| `recordInstallmentPayment` | payment input plus installment ID | same plus installment | same plus installment and installment event | bounded ABORTED retry; safe |
| `setTripState` | trip, archive/restore/delete/unarchive, request ID | user/business/trip/idempotency | trip, activity, idempotency | transactional/idempotent; safe |
| `travelAnalytics` | empty strict request | user, business, tenant-scoped trips | none | read-only bounded aggregation; safe |

No Firestore event trigger is included. Bulk migration writes therefore cannot invoke messages, email, payment providers, webhooks, notifications, or Storage deletion. The WhatsApp code remains quarantined. There are no runtime secrets in the travel package.

Privilege/staff changes, regulated document generation, and Storage cleanup were evaluated and are outside the travel cutover package. They remain `ENABLE_ONLY_AFTER_CUTOVER` legacy/server operations. A future cleanup drainer must ignore migration writes and operate only on explicit queue entries after the observation window.

The project currently has billing disabled and the Cloud Functions API disabled. Function deployment and real IAM/App Check smoke are `NOT STARTED`.
