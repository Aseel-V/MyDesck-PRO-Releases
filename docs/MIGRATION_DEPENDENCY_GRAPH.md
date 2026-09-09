# Migration Dependency Graph

Derived mechanically from `supabase/migrations/*.sql` at commit `35db4a6`
(recovery tag `recovery/pre-firebase-migration-20260909-070229`).

**Method:** every `CREATE TABLE` block was parsed and every inline `REFERENCES <table>(...)`
edge extracted, then topologically sorted. 76 application tables, 4 dependency tiers.
This file is design documentation only — it does not move data.

> Re-derive after any schema change:
> the parser lives in the audit transcript; re-run it before executing any import.

---

## Tier 0 — identity root (must exist before everything)

| Object | Notes |
| --- | --- |
| `auth.users` | **62 of 76 tables reference it** via 92 FK constraints. Owned by Supabase Auth today. In any non-Supabase target this must be re-created as an application-owned table holding the *same* UUID primary keys, populated from the Firebase Auth export, before a single business row is inserted. |

Columns that carry an `auth.users(id)` FK, by frequency:

| Column | FK count |
| --- | --- |
| `business_id` | 37 |
| `user_id` | 21 |
| `generated_by` | 4 |
| `created_by` | 4 |
| `performed_by`, `opened_by`, `closed_by`, `cancelled_by` | 2 each |
| `recorded_by`, `mechanic_id`, `counted_by`, `completed_by`, `approved_by`, `actor_user_id` | 1 each |

⚠️ `business_id` resolves to `auth.users(id)` on the ~37 restaurant/market tables but to
`business_profiles(id)` on `user_profiles` and `audit_logs`. This name collision is a
pre-existing modelling defect. **Do not "normalise" it during the migration** — carry it
across verbatim and fix it in the later `org_id` work, or the two meanings will be merged
silently and cross-tenant rows will be created.

---

## Tier 1 — direct children of `auth.users` (36 tables)

Import only after Tier 0 is complete and verified.

```
business_profiles        business_settings        cash_shifts
customer_vehicles        customers_ledger         fiscal_counters
fiscal_documents         payouts                  restaurant_daily_reports
restaurant_demand_forecasts                       restaurant_floor_plans
restaurant_historical_data                        restaurant_ingredients
restaurant_menu_categories                        restaurant_modifier_groups
restaurant_notifications restaurant_settings      restaurant_staff
restaurant_tables        restaurant_whatsapp_settings
stock_takes              travel_payment_feature_rollouts
trip_activity_log        trip_attachment_cleanup_queue
trip_financial_audit     trip_notification_settings
trip_notifications       trip_pdf_rate_limits     trip_pricing_preferences
trip_templates           trip_whatsapp_templates  trips
user_profiles            wallets                  z_report_counters
```

Also in this tier but **out of application scope**: `private_security.whatsapp_credentials`
(quarantined credential store, migration `20260908091000`). Handle as a secret, not as data —
it must be re-provisioned in the target secret manager, never copied through an export file.

---

## Tier 2 — depend on Tier 1 (20 tables)

```
allocation_numbers_log   audit_logs               car_parts
fiscal_document_items    restaurant_audit_logs    restaurant_cash_drawers
restaurant_guest_profiles                         restaurant_menu_items
restaurant_modifiers     restaurant_orders        restaurant_table_sessions
restaurant_waitlist      shift_transactions       staff_shifts
transactions             trip_packing_lists       trip_payment_plans
trip_write_requests      x_reports                z_reports
```

---

## Tier 3 — depend on Tier 2 (14 tables)

```
inventory_batches        market_transactions      repair_orders
restaurant_cash_transactions                      restaurant_item_modifier_groups
restaurant_kitchen_tickets                        restaurant_order_items
restaurant_payments      restaurant_recipes       restaurant_reservations
restaurant_whatsapp_messages                      stock_take_items
trip_installments        trip_payment_events
```

---

## Tier 4 — leaves (6 tables)

```
repair_order_items       restaurant_order_item_modifiers
restaurant_ticket_items  restaurant_void_logs
shrinkage_records        trip_installment_events
```

---

## Travel-path subgraph (the financially critical path)

This is the only subgraph that must be perfect on day one; everything else can be
re-imported without customer impact.

```
auth.users
   │
   ├── business_profiles ──── business_settings
   ├── user_profiles
   │
   └── trips
         ├── trip_payment_plans
         │     ├── trip_installments ──── trip_installment_events
         │     └── trip_payment_events
         ├── trip_packing_lists
         ├── trip_write_requests        (idempotency ledger — see note)
         ├── trip_activity_log
         └── trip_financial_audit

   (also user-scoped, not trip-scoped:)
   trip_templates · trip_whatsapp_templates · trip_notifications
   trip_notification_settings · trip_pricing_preferences
   trip_pdf_rate_limits · trip_attachment_cleanup_queue
```

Exact edges as parsed:

| Table | References |
| --- | --- |
| `trips` | `auth.users` |
| `trip_payment_plans` | `auth.users`, `trips` |
| `trip_installments` | `auth.users`, `trip_payment_plans`, `trips` |
| `trip_installment_events` | `auth.users`, `trip_installments`, `trips` |
| `trip_payment_events` | `auth.users`, `trip_payment_plans`, `trips` |
| `trip_packing_lists` | `auth.users`, `trips` |
| `trip_write_requests` | `auth.users`, `trips` |
| `trip_activity_log`, `trip_financial_audit`, `trip_notifications`, `trip_notification_settings`, `trip_templates`, `trip_whatsapp_templates`, `trip_pricing_preferences`, `trip_pdf_rate_limits`, `trip_attachment_cleanup_queue` | `auth.users` |
| `business_profiles`, `business_settings`, `user_profiles` | `auth.users` |

---

## Import-order hazards

These are the specific things that break a naïve tier-ordered import.

### 1. `GENERATED ALWAYS ... STORED` columns cannot be inserted

Must be **excluded from every INSERT/COPY column list**; PostgreSQL recomputes them.

| Table | Generated column | Expression |
| --- | --- | --- |
| `trips` | `profit` | `sale_price - wholesale_cost` |
| `trips` | `profit_percentage` | `((sale_price - wholesale_cost) / wholesale_cost) * 100` |
| `trips` | `amount_due` | `sale_price - amount_paid` |
| `fiscal_documents` | `requires_allocation` | `total_amount >= 2500000` |
| `restaurant_guest_profiles` | `full_name` | `first_name || ' ' || last_name` |
| `fiscal_document_items`, inventory tables | `line_total` etc. | `unit_cost * quantity` |

Reconciliation must still compare these columns source-vs-target. Same major version
(PostgreSQL 17 both sides) and identical `numeric` inputs give identical outputs; a mismatch
means an input column was imported wrong and is a **stop signal**, not a rounding artefact.

### 2. Sequences and identity columns must be resynced after import

If skipped, the first new row written after cutover collides with an imported row.

- `bigint GENERATED ALWAYS AS IDENTITY` PKs: `trip_activity_log`, `trip_financial_audit`,
  `trip_attachment_cleanup_queue`, `trip_whatsapp_templates`, and others in
  `20260719090000` / `20260719140000` / `20260719160000`.
- `SERIAL` columns: `restaurant_orders.order_number`, `z_reports.report_number`,
  `x_reports.report_number`, `stock_takes.stock_take_number`,
  `restaurant_daily_reports.z_report_number`.

After every import run: `setval(pg_get_serial_sequence(...), max(col))` for each.

### 3. Deferred / cyclic references

No true cycles were found among the 76 tables. `trip_installment_events` references both
`trip_installments` and `trips`, which is a diamond, not a cycle — the tier order resolves it.

### 4. `trip_write_requests` is an idempotency ledger, not ordinary data

`save_trip_transaction` replays a cached `response_payload` when it sees a repeated
`client_request_id`. It **must** be migrated with the trips it guards. Migrating trips
without it lets a retried client request create a duplicate trip after cutover.

### 5. Encrypted columns are keyed to a database-resident secret

`trips.travelers[].passport_number` is encrypted with `pgp_sym_encrypt` using
`private.travel_mode_secrets.passport_encryption_v1` (`20260719090000`).
Ciphertext is portable, **the key is not** — the `private` schema is revoked from all
client roles and is excluded from ordinary exports. If the key is not carried across
first, every passport number in the target decrypts to an error and the loss is silent
until a customer opens a trip. Treat the key as Tier 0, alongside `auth.users`.

### 6. Storage objects are not rows

Copying `trips.attachments` (jsonb paths) does **not** copy the bytes in the
`trip-attachments` bucket. See the storage manifest requirement in the design report.

---

## Recommended execution order

```
0.  auth.users shim + passport encryption key + storage bucket definitions
1.  Tier 1 (36 tables)   — business_profiles first, then the rest in any order
2.  Tier 2 (20 tables)
3.  Tier 3 (14 tables)
4.  Tier 4 (6 tables)
5.  Resync all sequences and identity columns
6.  Re-enable FK constraints / triggers if they were deferred
7.  Reconcile (counts → hashes → financial sums → orphan checks)
8.  Storage byte copy + SHA-256 verification
```

Steps 1–4 may run with `session_replication_role = replica` to defer trigger side effects,
**but** the audit and activity-log triggers must then be verified as not-fired rather than
assumed — several of them write rows that reconciliation will otherwise count as a mismatch.
