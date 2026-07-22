# Migration Reconciliation & Drift Elimination Baseline

This document records the migration reconciliation rules and baseline schema contract for MyDesck PRO.

## 1. Principles

1. **Forward-Only**: All database changes must be timestamped forward-only migrations in `supabase/migrations/`.
2. **Immutable History**: Never edit or reorder an applied migration file.
3. **Automated Manifest Validation**: Pre-deployment validation verifies target Supabase schemas against `supabase/database-compatibility-manifest.json`.

## 2. Reconciled Production Objects Baseline

The following historical schema objects exist in production and are enforced by `check-database-compatibility.mjs`:

- **Tables**: `trips`, `trip_payment_plans`, `trip_installments`, `trip_activity_logs`, `trip_templates`, `trip_attachments`, `user_profiles`, `business_profiles`.
- **RPCs**:
  - `save_trip_transaction(p_trip_data jsonb, p_payment_plan jsonb, p_client_request_id uuid)`
  - `get_trips_page(p_page integer, p_limit integer, ...)`
  - `encrypt_travelers_in_db(p_trip_id uuid, p_travelers jsonb)`
  - `get_yearly_stats_overview(p_year integer)`
- **Generated Columns**:
  - `trips.profit`
  - `trips.profit_percentage`
  - `trips.amount_due`
  - `trips.search_document`
  - `trips.created_at`
