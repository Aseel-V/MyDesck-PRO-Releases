# MyDesck PRO — Firestore data model

Target architecture: Firebase Authentication, Cloud Firestore, Cloud Functions
for Firebase, Cloud Storage for Firebase, Firebase Security Rules, Firebase App
Check, with Electron remaining the desktop client.

**No Cloud SQL. No PostgreSQL in the final runtime. No Supabase runtime
dependency after cutover.** PostgreSQL remains only as the existing source of
truth, a local test oracle and a read-only reconciliation source.

Schema version: **1**. Transform version: **1**.

---

## 1. The rule this model is built on

Firestore is not PostgreSQL with different words. It has no foreign keys, no
triggers, no stored procedures, no generated columns and no row-level security.
Every one of those the source relies on has to be replaced by something
explicit, and the replacement has to be *tested*, because nothing in Firestore
will complain when it is missing.

Concretely, the source leans on:

| Source mechanism | Count | Replacement |
|---|---|---|
| Foreign keys | 152 (77 to `auth.users`) | Stable ids, declared reference fields, write-time validation in functions, and an orphan checker in reconciliation |
| RLS policies | 127 (116 public, 11 storage) | Security Rules, translated by intent, plus authorization inside every function |
| `SECURITY DEFINER` functions | 79 | Callable/HTTPS Cloud Functions that verify the caller themselves |
| Generated columns | 9 | Server-computed fields that clients cannot write |
| Triggers | 23 user triggers | Explicit writes inside the same transaction |
| `NUMERIC` columns | 93 (74 unconstrained) | Exact scaled-integer amounts, never `double` |

The Admin SDK **bypasses Security Rules entirely**. Every Cloud Function
therefore performs its own authentication, authorization, tenant validation,
input validation and idempotency checks. No server code relies on a rule.

## 2. Identity

`Supabase auth.users.id` = `Firebase Auth UID` = `users/{documentId}`. This was
proven end to end in the previous phase (3/3 password logins, 3/3 wrong-password
rejections, exact UID preservation) and is not revisited here. Migrated
documents reference that same UID and nothing else.

The user document id **is** the UID, so "whose document is this" and "which
document is this" are the same question. The surrogate `user_profiles.id` is
kept as `legacyProfileId` so the source primary key is not lost.

## 3. Collection layout, and why it is mostly flat

The layout is derived from the queries the application actually runs, not from
an aesthetic preference for hierarchy.

`trips`, `tripPaymentPlans`, `tripInstallments` and the event collections are
**top level**, each carrying `ownerUid`. The decisive query is "installments due
in a date range across all of this owner's trips": under a subcollection that
needs a collection-group index, which weakens tenant scoping and makes the rule
harder to reason about. Flat collections with an `ownerUid` leading every index
keep the security story simple — a query that does not constrain `ownerUid`
fails outright.

Subcollections are used where the lifecycle really is nested and there is no
cross-parent query: `businesses/{id}/settings`, `trips/{id}/packingLists`, and
the two legacy verticals, which are business-scoped throughout.

### Embedded versus promoted

`trips.travelers` stays **embedded** as an ordered array. It is bounded by the
party size of one trip, it is written atomically by the save transaction, and
promoting it would add a read to every trip view without improving the security
boundary — the same owner reads both. The serializer enforces a document budget
and warns above 200 elements, so if that assumption ever stops holding, it
surfaces as a warning rather than a 1 MiB write failure in production.

`payments`, `itinerary`, `attachments` and `roomType` are likewise embedded, and
are legacy compatibility fields: the authoritative payment record is the native
ledger (`tripPaymentPlans` + `tripInstallments` + the event collections), not
the `payments` JSON array.

Audit and event history is **never** an array. `tripFinancialAudit` already
holds 438 rows against 93 trips in the source; an array would grow without bound
inside a document that also has to be written on every trip edit.

## 4. Money

The source stores money three different ways, and the migration has to be honest
about all three:

1. `NUMERIC(12,2)` on `trips` — `wholesale_cost`, `sale_price`, `amount_paid`.
2. `BIGINT` minor units on the payment ledger — `card_total_minor`,
   `cash_total_minor`, `expected_amount_minor`, `paid_amount_minor`. These are
   scale 2 by application convention (`round(sale_price * 100)`).
3. **Unconstrained `NUMERIC`** — 74 of 93 numeric columns, including
   `exchange_rate`, `card_paid_amount` and `cash_paid_amount`.

The third is the dangerous one. The live synthetic slice holds
`card_paid_amount` at **scale 20 in one row and scale 16 in another**, because
those values come out of SQL division. Any fixed per-column or per-currency
scale would either lose digits or invent them.

So: **scale is a property of the value.** Every migrated amount is stored as

```
{ unitsText: "91843", units: 91843, scale: 2, decimal: "918.43" }
```

- `unitsText` is authoritative and always present — the base-10 string of the
  scaled integer.
- `units` is a numeric convenience for queries, present **only** inside
  ±(2⁵³−1). Above that it is `null`, because writing 2⁶⁰ as a JavaScript number
  rounds it, and a rounded number that still looks like an integer is exactly
  the kind of silent financial change this migration exists to prevent.
- Values beyond int64 keep `unitsText` alone and are flagged `exceedsInt64`.
  Nothing is ever truncated.

Source text never passes through `Number`. Parsing is digit-by-digit into
`BigInt`, and `assertExactRoundTrip` proves every value reproduces its source
text before it is written. Excess precision is an **error**, not a rounding
decision: `1.005` at scale 2 is refused.

`JOD` is worth naming. ISO 4217 gives it three decimals; this application stores
every currency in hundredths. Parity requires migrating it as the source holds
it, so the value carries `isoScale: 3, isoScaleMismatch: true` — reported, never
silently "fixed". A migration that corrects money is a migration that loses
parity.

### Canonical financial truth

The canonical record is the event ledger: `tripPaymentPlans`,
`tripInstallments`, `tripPaymentEvents`, `tripInstallmentEvents`. The
aggregates on `trips` (`amountPaid`, `amountDue`, `profit`, `paymentStatus`) are
**derived**, recomputed inside the save transaction from the ledger, and are not
client-writable. Reconciliation recomputes them from the events and compares.

## 5. Denormalised fields

Each duplicated field declares its canonical source and how staleness is caught.

| Field | Canonical source | Update mechanism | Stale detection |
|---|---|---|---|
| `ownerUid` | the row's `user_id` | immutable; ownership transfer is not a supported operation and rules forbid changing it | reconciliation level 6 compares every document against the source owner column |
| `businessId` | `business_profiles.id` for the owner | server-side only | relationship reconciliation resolves it |
| `isDeleted` | `deleted_at IS NOT NULL` on the same document | written in the same write as `deletedAt` | an invariant check asserts the two agree, at migration and in the schema |
| `sequence` | the source BIGINT identity key | immutable, set once | event-order reconciliation |

## 6. Types that need care

**Timestamps.** PostgreSQL `timestamptz` is microsecond-resolution. Each is
stored as a Firestore `Timestamp` *and* a `<field>Micros` string. The shadow is
not decoration: read-back checks the two against each other, so a rewritten
Timestamp is caught. Once reconciliation proves the `Timestamp` alone
round-trips on a full production rehearsal, the shadow can be dropped — that is
a milestone-2 decision, made on evidence.

**JSON.** Stored natively so the model stays queryable and Firebase-shaped, with
two exceptions that fall back to exact source text:

- Shapes Firestore cannot hold — a nested array, an empty key, a reserved
  `__x__` key.
- JSON whose numeric literals JavaScript would rewrite. PostgreSQL JSONB keeps
  `0.00000000000000000000`; `JSON.parse` gives back `0`. The value is unchanged
  but the literal is not, so those documents keep their exact source text.

**JSON `null` versus SQL `NULL`.** These are different facts — "the audit value
was null" is not "there was no audit value" — and this milestone found the
transform collapsing them. A JSON column always carries `<field>Encoding`; its
absence is what marks a SQL NULL. A permanent negative control now guards it.

**Text.** Arabic, Hebrew and English are preserved code point for code point.
Nothing is Unicode-normalised, because the source does not normalise, and
normalising here would silently rewrite customer names.

## 7. Deletion

Firestore does not cascade. Deleting a parent leaves its children behind, so
every parent-child relationship declares its policy explicitly.

| Relationship | Policy |
|---|---|
| `trips` → `tripPaymentPlans`, `tripInstallments` | SOFT DELETE. `isDeleted` + `deletedAt` on the trip; the ledger is retained. Matches the source, which soft-deletes trips and keeps financial history. |
| `trips` → event and audit collections | KEEP HISTORY. Never removed with the trip. |
| `users` → everything owned | FORBIDDEN from a client. Identity deletion is administrative and cascades through a function, never a document delete. |
| `businesses` → business-scoped children | CASCADE FUNCTION. Explicit, batched, and audited. |
| Permanent trip delete | CASCADE FUNCTION (`permanently_delete_trips`). The descendants are enumerated in code, because nothing enumerates them for us. |

## 8. Security model

Translated from the source RLS *intent*: owner-only on every tenant row, a
global admin that may read but not write, and audit tables that clients can read
but never write.

Two deliberate hardenings go beyond the source, because Firestore has no
generated columns and no triggers:

1. **Money is not client-writable.** `profit`, `amountDue` and
   `profitPercentage` are GENERATED in PostgreSQL and `amountPaid` is
   synchronised by the RPC. Firestore would let a client write any number into
   them, so they are server-only and the callable function is the only path.
2. **Ownership and privilege fields are immutable to clients.** The source uses
   a `BEFORE UPDATE` trigger to block financial-permission escalation; rules
   enforce the equivalent without one. `role`, `isSuspended`,
   `canViewFinancials`, `businessId` and `uid` are all server-only.

**Rules are not filters.** `read` is evaluated per document, so an unconstrained
query fails rather than returning a subset. Every client query carries its
`ownerUid` constraint, and every composite index leads with `ownerUid` — an
index that did not could never serve a query that will actually be permitted.

**Custom claims** are used only for the global `admin` role: it changes rarely,
applies across tenants, and is exactly the case claims suit. Business membership
stays in Firestore documents, where it can change without waiting for a token
refresh.

The `migration_test_v1_*` proof namespace is denied to every client, including
admins. Migration tooling reaches it with the Admin SDK.

## 9. Transactions and idempotency

`save_trip_transaction` is rebuilt as a callable function wrapping a Firestore
transaction. Transaction bodies **retry**, so the body performs no external side
effect of any kind — no message, no email, no file deletion, no non-idempotent
network call. Anything with an outside effect belongs in an outbox document
written inside the transaction and drained after it commits.

Ids are generated **before** the transaction, not inside it: an id minted in a
retried body differs between attempts and leaves orphans from the attempts that
lost. They are UUIDs, matching the source primary keys, so the target does not
end up with two id vocabularies.

Idempotency preserves the source contract exactly: `trip_write_requests
(user_id, client_request_id)` becomes `idempotency/{uid}__{clientRequestId}`,
written **inside** the transaction with `create`. A concurrent duplicate
contends on that document and loses, which is what makes the guarantee hold
under concurrency rather than only under sequential replay.

## 10. Offline behaviour

The Firestore client SDK can accept writes offline and sync later. For financial
operations that is unacceptable: a client cannot know the authoritative balance
while offline, so an offline write would be asserting a total it cannot compute.

- **Safe offline:** reading cached trips, drafting a trip form locally,
  non-financial edits to an owned trip.
- **Requires confirmed server success:** everything that moves money — save,
  record payment, reschedule, plan changes. These go through callable functions,
  which simply fail when offline rather than queueing.

---

<!-- BEGIN GENERATED SOURCE COVERAGE -->

_This section is generated by `migration/firestore/tools/generate-data-model-doc.mjs` from the live source inventory and `lib/table-map.mjs`. Do not edit it by hand._

Source tables in the live schema: **77**. Tables with a mapping decision: **77**. Unmapped: **0**. Unknown: **0**.

### Identity and tenancy (4 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `audit_logs` | TOP_LEVEL_COLLECTION | `auditEvents/{eventId}` | source BIGINT id, zero-padded | `businessId` | 1 | 11 | 1 | 0 | 2 | 1 |
| `business_profiles` | TOP_LEVEL_COLLECTION | `businesses/{businessId}` | id | `ownerUid` | 1 | 14 | 1 | 0 | 0 | 5 |
| `business_settings` | SUBCOLLECTION | `businesses/{businessId}/settings/{settingsId}` | id | `ownerUid` | 1 | 7 | 1 | 0 | 0 | 4 |
| `user_profiles` | TOP_LEVEL_COLLECTION | `users/{firebaseUid}` | id | `uid` | 1 | 10 | 2 | 0 | 0 | 4 |

**Notes**

- `business_settings` — source quirk: business_id references auth.users

### Travel (the active product) (17 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `travel_payment_feature_rollouts` | TOP_LEVEL_COLLECTION | `featureRollouts/{rolloutId}` | source feature_key | `global` | 2 | 2 | 0 | 0 | 0 | 0 |
| `trip_activity_log` | TOP_LEVEL_COLLECTION | `tripActivityLog/{activityId}` | source BIGINT id, zero-padded | `ownerUid` | 1 | 7 | 2 | 0 | 1 | 1 |
| `trip_attachment_cleanup_queue` | TOP_LEVEL_COLLECTION | `storageCleanupQueue/{queueId}` | source id | `ownerUid` | 2 | 11 | 1 | 0 | 1 | 1 |
| `trip_financial_audit` | TOP_LEVEL_COLLECTION | `tripFinancialAudit/{auditId}` | source BIGINT id, zero-padded | `ownerUid` | 1 | 9 | 3 | 0 | 2 | 1 |
| `trip_installment_events` | TOP_LEVEL_COLLECTION | `tripInstallmentEvents/{eventId}` | source BIGINT id, zero-padded | `ownerUid` | 1 | 9 | 3 | 0 | 2 | 1 |
| `trip_installments` | TOP_LEVEL_COLLECTION | `tripInstallments/{installmentId}` | id | `ownerUid` | 1 | 13 | 3 | 0 | 0 | 1 |
| `trip_notification_settings` | SUBCOLLECTION | `users/{firebaseUid}/settings/{settingsId}` | source user_id | `uid` | 2 | 10 | 1 | 0 | 0 | 1 |
| `trip_notifications` | TOP_LEVEL_COLLECTION | `tripNotifications/{notificationId}` | source id | `ownerUid` | 2 | 14 | 1 | 0 | 1 | 2 |
| `trip_packing_lists` | SUBCOLLECTION | `trips/{tripId}/packingLists/{listId}` | source id | `ownerUid` | 2 | 9 | 2 | 0 | 1 | 1 |
| `trip_payment_events` | TOP_LEVEL_COLLECTION | `tripPaymentEvents/{eventId}` | source BIGINT id, zero-padded | `ownerUid` | 1 | 9 | 3 | 0 | 2 | 1 |
| `trip_payment_plans` | TOP_LEVEL_COLLECTION | `tripPaymentPlans/{planId}` | id | `ownerUid` | 1 | 17 | 2 | 0 | 0 | 1 |
| `trip_pdf_rate_limits` | DERIVED | `rateLimits/{ownerUid}__pdf` | source id | `ownerUid` | 2 | 3 | 1 | 0 | 0 | 0 |
| `trip_pricing_preferences` | SUBCOLLECTION | `users/{firebaseUid}/settings/{settingsId}` | source user_id | `uid` | 2 | 5 | 1 | 1 | 0 | 1 |
| `trip_templates` | TOP_LEVEL_COLLECTION | `tripTemplates/{templateId}` | source id | `ownerUid` | 2 | 13 | 1 | 0 | 1 | 1 |
| `trip_whatsapp_templates` | TOP_LEVEL_COLLECTION | `tripWhatsappTemplates/{templateId}` | source id | `ownerUid` | 2 | 7 | 1 | 0 | 0 | 1 |
| `trip_write_requests` | TOP_LEVEL_COLLECTION | `idempotency/{ownerUid}__{clientRequestId}` | user_id + client_request_id | `ownerUid` | 1 | 5 | 2 | 0 | 1 | 1 |
| `trips` | TOP_LEVEL_COLLECTION | `trips/{tripId}` | id | `ownerUid` | 1 | 60 | 2 | 12 | 5 | 5 |

**Notes**

- `trip_activity_log` — source quirk: trip_id has no foreign key

### Restaurant vertical (legacy) (31 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `restaurant_audit_logs` | SUBCOLLECTION | `businesses/{businessId}/restaurantAuditLogs/{logId}` | source id | `businessId` | 3 | 8 | 3 | 0 | 1 | 2 |
| `restaurant_cash_drawers` | SUBCOLLECTION | `businesses/{businessId}/cashDrawers/{drawerId}` | source id | `businessId` | 3 | 11 | 3 | 4 | 0 | 1 |
| `restaurant_cash_transactions` | SUBCOLLECTION | `businesses/{businessId}/cashTransactions/{transactionId}` | source id | `businessId` | 3 | 8 | 2 | 1 | 0 | 1 |
| `restaurant_daily_reports` | SUBCOLLECTION | `businesses/{businessId}/dailyReports/{reportId}` | source id | `businessId` | 3 | 21 | 2 | 11 | 1 | 2 |
| `restaurant_demand_forecasts` | SUBCOLLECTION | `businesses/{businessId}/demandForecasts/{forecastId}` | source id | `businessId` | 3 | 15 | 1 | 3 | 2 | 1 |
| `restaurant_floor_plans` | SUBCOLLECTION | `businesses/{businessId}/floorPlans/{planId}` | source id | `businessId` | 3 | 10 | 1 | 0 | 1 | 1 |
| `restaurant_guest_profiles` | SUBCOLLECTION | `businesses/{businessId}/guestProfiles/{guestId}` | source id | `businessId` | 3 | 26 | 2 | 2 | 0 | 1 |
| `restaurant_historical_data` | SUBCOLLECTION | `businesses/{businessId}/restaurantHistory/{recordId}` | source id | `businessId` | 3 | 12 | 1 | 2 | 0 | 1 |
| `restaurant_ingredients` | SUBCOLLECTION | `businesses/{businessId}/ingredients/{ingredientId}` | source id | `businessId` | 3 | 15 | 1 | 3 | 0 | 1 |
| `restaurant_item_modifier_groups` | SUBCOLLECTION | `businesses/{businessId}/itemModifierGroups/{linkId}` | source item_id, group_id | `businessId` | 3 | 2 | 2 | 0 | 0 | 1 |
| `restaurant_kitchen_tickets` | SUBCOLLECTION | `businesses/{businessId}/kitchenTickets/{ticketId}` | source id | `businessId` | 3 | 11 | 2 | 0 | 0 | 1 |
| `restaurant_menu_categories` | SUBCOLLECTION | `businesses/{businessId}/menuCategories/{categoryId}` | source id | `businessId` | 3 | 11 | 2 | 0 | 0 | 1 |
| `restaurant_menu_items` | SUBCOLLECTION | `businesses/{businessId}/menuItems/{itemId}` | source id | `businessId` | 3 | 38 | 2 | 4 | 0 | 5 |
| `restaurant_modifier_groups` | SUBCOLLECTION | `businesses/{businessId}/modifierGroups/{groupId}` | source id | `businessId` | 3 | 8 | 1 | 0 | 0 | 1 |
| `restaurant_modifiers` | SUBCOLLECTION | `businesses/{businessId}/modifiers/{modifierId}` | source id | `businessId` | 3 | 7 | 1 | 1 | 0 | 1 |
| `restaurant_notifications` | SUBCOLLECTION | `businesses/{businessId}/restaurantNotifications/{notificationId}` | source id | `businessId` | 3 | 9 | 1 | 0 | 0 | 1 |
| `restaurant_order_item_modifiers` | SUBCOLLECTION | `businesses/{businessId}/orderItemModifiers/{linkId}` | source id | `businessId` | 3 | 6 | 2 | 1 | 0 | 1 |
| `restaurant_order_items` | SUBCOLLECTION | `businesses/{businessId}/orderItems/{itemId}` | source id | `businessId` | 3 | 13 | 2 | 1 | 0 | 2 |
| `restaurant_orders` | SUBCOLLECTION | `businesses/{businessId}/orders/{orderId}` | source id | `businessId` | 3 | 25 | 4 | 6 | 0 | 2 |
| `restaurant_payments` | SUBCOLLECTION | `businesses/{businessId}/restaurantPayments/{paymentId}` | source id | `businessId` | 3 | 15 | 3 | 2 | 0 | 1 |
| `restaurant_recipes` | SUBCOLLECTION | `businesses/{businessId}/recipes/{recipeId}` | source id | `businessId` | 3 | 7 | 2 | 1 | 0 | 1 |
| `restaurant_reservations` | SUBCOLLECTION | `businesses/{businessId}/reservations/{reservationId}` | source id | `businessId` | 3 | 20 | 3 | 0 | 0 | 1 |
| `restaurant_settings` | SUBCOLLECTION | `businesses/{businessId}/restaurant/settings` | source business_id | `businessId` | 3 | 17 | 1 | 2 | 1 | 1 |
| `restaurant_staff` | SUBCOLLECTION | `businesses/{businessId}/restaurantStaff/{staffId}` | source id | `businessId` | 3 | 18 | 2 | 1 | 0 | 1 |
| `restaurant_table_sessions` | SUBCOLLECTION | `businesses/{businessId}/tableSessions/{sessionId}` | source id | `businessId` | 3 | 8 | 3 | 0 | 0 | 1 |
| `restaurant_tables` | SUBCOLLECTION | `businesses/{businessId}/tables/{tableId}` | source id | `businessId` | 3 | 16 | 1 | 0 | 0 | 1 |
| `restaurant_ticket_items` | SUBCOLLECTION | `businesses/{businessId}/ticketItems/{itemId}` | source id | `businessId` | 3 | 11 | 2 | 0 | 0 | 1 |
| `restaurant_void_logs` | SUBCOLLECTION | `businesses/{businessId}/voidLogs/{logId}` | source id | `businessId` | 3 | 10 | 5 | 1 | 0 | 1 |
| `restaurant_waitlist` | SUBCOLLECTION | `businesses/{businessId}/waitlist/{entryId}` | source id | `businessId` | 3 | 13 | 2 | 0 | 0 | 1 |
| `restaurant_whatsapp_messages` | ARCHIVE | `businesses/{businessId}/restaurantWhatsappMessages/{messageId}` | source id | `businessId` | 3 | 11 | 2 | 0 | 0 | 1 |
| `restaurant_whatsapp_settings` | ARCHIVE | `businesses/{businessId}/restaurantWhatsappSettings/{settingsId}` | source id | `businessId` | 3 | 10 | 1 | 0 | 2 | 1 |

**Notes**

- `restaurant_whatsapp_messages` — quarantined: migrated as history only, no automation re-enabled
- `restaurant_whatsapp_settings` — quarantined: migrated as history only, no automation re-enabled

### Retail and automotive vertical (legacy) (14 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `allocation_numbers_log` | SUBCOLLECTION | `businesses/{businessId}/allocationNumbers/{entryId}` | source id | `businessId` | 3 | 12 | 2 | 0 | 2 | 1 |
| `car_parts` | SUBCOLLECTION | `businesses/{businessId}/parts/{partId}` | source id | `businessId` | 3 | 12 | 1 | 3 | 0 | 4 |
| `cash_shifts` | SUBCOLLECTION | `businesses/{businessId}/cashShifts/{shiftId}` | source id | `businessId` | 3 | 34 | 3 | 0 | 0 | 1 |
| `customer_vehicles` | SUBCOLLECTION | `businesses/{businessId}/vehicles/{vehicleId}` | source id | `businessId` | 3 | 16 | 1 | 0 | 0 | 4 |
| `customers_ledger` | SUBCOLLECTION | `businesses/{businessId}/customerLedger/{entryId}` | source id | `businessId` | 3 | 12 | 2 | 3 | 0 | 1 |
| `inventory_batches` | SUBCOLLECTION | `businesses/{businessId}/inventoryBatches/{batchId}` | source id | `businessId` | 3 | 20 | 3 | 2 | 0 | 1 |
| `market_transactions` | SUBCOLLECTION | `businesses/{businessId}/marketTransactions/{transactionId}` | source id | `businessId` | 3 | 12 | 2 | 5 | 1 | 6 |
| `repair_order_items` | SUBCOLLECTION | `businesses/{businessId}/repairOrderItems/{itemId}` | source id | `businessId` | 3 | 11 | 2 | 3 | 0 | 1 |
| `repair_orders` | SUBCOLLECTION | `businesses/{businessId}/repairOrders/{orderId}` | source id | `businessId` | 3 | 21 | 3 | 5 | 0 | 5 |
| `shift_transactions` | SUBCOLLECTION | `businesses/{businessId}/shiftTransactions/{transactionId}` | source id | `businessId` | 3 | 15 | 3 | 0 | 0 | 1 |
| `shrinkage_records` | SUBCOLLECTION | `businesses/{businessId}/shrinkageRecords/{recordId}` | source id | `businessId` | 3 | 20 | 6 | 1 | 0 | 1 |
| `staff_shifts` | SUBCOLLECTION | `businesses/{businessId}/staffShifts/{shiftId}` | source id | `businessId` | 3 | 6 | 2 | 2 | 0 | 2 |
| `stock_take_items` | SUBCOLLECTION | `businesses/{businessId}/stockTakeItems/{itemId}` | source id | `businessId` | 3 | 16 | 4 | 3 | 0 | 1 |
| `stock_takes` | SUBCOLLECTION | `businesses/{businessId}/stockTakes/{stockTakeId}` | source id | `businessId` | 3 | 18 | 3 | 0 | 0 | 1 |

### Fiscal and regulatory (legacy) (6 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `fiscal_counters` | ARCHIVE | `businesses/{businessId}/fiscalCounters/{counterId}` | source id | `businessId` | 3 | 8 | 1 | 0 | 0 | 1 |
| `fiscal_document_items` | ARCHIVE | `businesses/{businessId}/fiscalDocumentItems/{itemId}` | source id | `businessId` | 3 | 20 | 1 | 3 | 0 | 1 |
| `fiscal_documents` | ARCHIVE | `businesses/{businessId}/fiscalDocuments/{documentId}` | source id | `businessId` | 3 | 46 | 4 | 0 | 0 | 3 |
| `x_reports` | ARCHIVE | `businesses/{businessId}/xReports/{reportId}` | source id | `businessId` | 3 | 15 | 3 | 0 | 0 | 1 |
| `z_report_counters` | ARCHIVE | `businesses/{businessId}/zReportCounters/{counterId}` | source id | `businessId` | 3 | 6 | 1 | 0 | 0 | 1 |
| `z_reports` | ARCHIVE | `businesses/{businessId}/zReports/{reportId}` | source id | `businessId` | 3 | 47 | 3 | 0 | 1 | 2 |

**Notes**

- `fiscal_counters` — hash-chained: the chain must be re-verified after migration
- `fiscal_document_items` — hash-chained: the chain must be re-verified after migration
- `fiscal_documents` — hash-chained: the chain must be re-verified after migration
- `x_reports` — hash-chained: the chain must be re-verified after migration
- `z_report_counters` — hash-chained: the chain must be re-verified after migration
- `z_reports` — hash-chained: the chain must be re-verified after migration

### WhatsApp automation (quarantined) (5 tables)

| Source table | Disposition | Target path | Document id | Security field | Milestone | Cols | FKs | Num | JSON | Policies |
|---|---|---|---|---|---|---|---|---|---|---|
| `whatsapp_contact_consents` | ARCHIVE | `businesses/{businessId}/whatsappConsents/{consentId}` | source id | `businessId` | 3 | 9 | 1 | 0 | 0 | 1 |
| `whatsapp_message_log` | ARCHIVE | `businesses/{businessId}/whatsappMessageLog/{messageId}` | source id | `businessId` | 3 | 20 | 3 | 0 | 1 | 1 |
| `whatsapp_reminders` | ARCHIVE | `businesses/{businessId}/whatsappReminders/{reminderId}` | source id | `businessId` | 3 | 16 | 2 | 0 | 0 | 1 |
| `whatsapp_server_templates` | ARCHIVE | `whatsappServerTemplates/{templateId}` | source template_key, language | `global` | 3 | 9 | 0 | 0 | 0 | 1 |
| `whatsapp_webhook_events` | ARCHIVE | `whatsappWebhookEvents/{eventId}` | source event_id | `global` | 3 | 4 | 0 | 0 | 0 | 0 |

**Notes**

- `whatsapp_contact_consents` — quarantined: migrated as history only, no automation re-enabled
- `whatsapp_message_log` — quarantined: migrated as history only, no automation re-enabled
- `whatsapp_reminders` — quarantined: migrated as history only, no automation re-enabled
- `whatsapp_server_templates` — quarantined: migrated as history only, no automation re-enabled
- `whatsapp_webhook_events` — quarantined: migrated as history only, no automation re-enabled

### Milestone-1 entity contracts

These are the tables migrated and reconciled in this milestone. Each row states the declared references the orphan checker enforces, and the ordering contract for append-only history.

| Target collection | References checked | Append-only | Ordering |
|---|---|---|---|
| `users` | `business_id` → `businesses` | no | — |
| `businesses` | — | no | — |
| `businessSettings` | `business_id` → `users` (required) | no | — |
| `auditEvents` | `business_id` → `businesses` (required) | yes | by `sequence` within `business_id` |
| `trips` | `deleted_by` → `users` | no | — |
| `tripPaymentPlans` | `trip_id` → `trips` (required) | no | — |
| `tripInstallments` | `trip_id` → `trips` (required)<br>`payment_plan_id` → `tripPaymentPlans` (required) | no | — |
| `tripPaymentEvents` | `trip_id` → `trips` (required)<br>`payment_plan_id` → `tripPaymentPlans` (required) | yes | by `sequence` within `payment_plan_id` |
| `tripInstallmentEvents` | `trip_id` → `trips` (required)<br>`installment_id` → `tripInstallments` (required) | yes | by `sequence` within `installment_id` |
| `tripFinancialAudit` | `trip_id` → `trips` (required) | yes | by `sequence` within `trip_id` |
| `tripActivityLog` | `trip_id` → `trips` (required) | yes | by `sequence` within `trip_id` |
| `idempotency` | `trip_id` → `trips` | no | — |

### Decimal domains

Every migrated decimal declares its scale. The scale is taken from the VALUE, not the column, because the source holds the same column at different scales.

| Source declaration | Columns |
|---|---|
| unconstrained NUMERIC | 74 |
| NUMERIC(10,3) | 7 |
| NUMERIC(12,2) | 5 |
| NUMERIC(10,2) | 3 |
| NUMERIC(5,2) | 2 |
| NUMERIC(8,4) | 1 |
| NUMERIC(6,2) | 1 |

Floating-point columns in the source: **5** (`restaurant_tables.position_x`, `restaurant_tables.position_y`, `restaurant_tables.width`, `restaurant_tables.height`, `restaurant_tables.rotation`). None of them is money — they are restaurant floor-plan geometry.

_Generated 2026-09-09T20:08:36.276Z from a source inventory taken at 2026-09-09T20:08:35.211Z._

<!-- END GENERATED SOURCE COVERAGE -->
