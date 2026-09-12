# Production Firestore paths

Every document carries `schemaVersion: 1` and `migrationTransformVersion: 1.full.1` (legacy transformed documents also retain the existing `transformVersion` field during compatibility). Source IDs remain target document IDs. Migration control paths are server-only and are never queried by clients.

| Path | Purpose / ID | Tenant fields | Client access | Retention / relationship |
| --- | --- | --- | --- | --- |
| `users/{firebaseUid}` | application identity; Supabase UID = Firebase UID = document ID | `uid`, `businessId` | own read; protected-field writes through server | account lifetime; references owned business |
| `businesses/{businessId}` | tenant root; source business UUID | immutable `ownerUid` | tenant read; protected writes through server | business lifetime; owner UID |
| `trips/{tripId}` | canonical trip; source trip UUID | immutable `ownerUid`, `businessId` | tenant-scoped read; writes through callable Functions | soft-delete/archive policy; embeds bounded travelers/itinerary metadata |
| `tripPaymentPlans/{planId}` | one active plan per trip; source UUID | `ownerUid`, `businessId`, `tripId` | read only for tenant; server writes | trip lifetime |
| `tripInstallments/{installmentId}` | installment schedule; source UUID | `ownerUid`, `businessId`, `tripId`, `paymentPlanId` | read only for tenant; server writes | financial retention |
| `tripPaymentEvents/{eventId}` | append-only payment event; source identity text | `ownerUid`, `businessId`, `tripId` | tenant read; no client write | permanent financial audit |
| `tripInstallmentEvents/{eventId}` | append-only installment event | `ownerUid`, `businessId`, `tripId`, `installmentId` | tenant read; no client write | permanent financial audit |
| `tripFinancialAudit/{auditId}` | append-only financial audit | `ownerUid`, `businessId`, `tripId` | tenant read; no client mutation | permanent |
| `tripActivityLog/{activityId}` | ordered activity history | `ownerUid`, `businessId`, `tripId` | tenant read; no client mutation | audit retention |
| `auditEvents/{eventId}` | cross-domain server audit | `businessId`, actor UID | authorized read only; server write | permanent/regulatory |
| `businesses/{businessId}/documents/{documentId}` | document metadata; source UUID | parent business and `ownerUid` | tenant read; server-controlled write | entity retention; Storage object reference |
| `businesses/{businessId}/analytics/{summaryId}` | materialized summary rebuilt from canonical events | parent business | tenant read; client write denied | rebuildable, versioned |
| `idempotency/{ownerUid}__{clientRequestId}` | command response/idempotency | `ownerUid`, `businessId` | none | bounded operational retention after audit window |
| `_migrationLedger/{migrationRunId}/entities/{sourceKeyHash}` | production migration ledger | target path and redacted source key | none | retain through rollback/approval window |
| `_migrationControl/{migrationRunId}` | checkpoint, source snapshot marker, hashes, GO result | global server control | none | permanent migration evidence |
| `_postCutoverJournal/{operationId}` | temporary critical-write journal | `businessId`, `userUid`, entity IDs | none | remove only after rollback window and reconciliation approval |

Storage bytes remain in Firebase Storage under `businesses/{businessId}/signatures/{objectId}` and `businesses/{businessId}/trips/{tripId}/attachments/{objectId}`. Firestore stores metadata and SHA-256 only. Public business logos use a separate explicitly public path when approved; signatures never do.

The complete 77-table source-to-path mapping remains authoritative in `FIRESTORE_DATA_MODEL.md` and `table-map.mjs`. No production path uses the `migration_test_v1_` rehearsal prefix.
