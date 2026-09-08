# Phase 1 schema drift report

Date: 2026-09-08. Scope: existing user_id ownership model. No production writes.

## Canonical source and verification

The ordered `supabase/migrations` chain is the source of application schema. The
native PostgreSQL 17 runner applies every migration to an empty database, then
queries PostgreSQL catalogs. Auth/Storage platform contracts are explicitly
supplied by `scripts/security/postgres-platform-fixture.sql`; these are test
infrastructure, not substitutes for production Supabase platform migrations.
HTTP JWT validation, Storage byte serving and Edge Runtime require the separate
local Supabase integration job.

The first complete rebuild applied 92 migrations. Before extending the tests,
all four SQL security files and the existing canonical payment SQL passed. The
runner emits the current evidence in `results/security-postgres.json` and a full
catalog inventory in `results/rebuilt-schema-catalog.json` on each run. Do not
confuse successful source rebuild with proof that production matches it.

No live production catalog or migration ledger was available in this task.
Production-only tables, indexes, constraints, triggers, policies and functions
therefore remain **unknown**, rather than being declared absent or reconciled.

## Verified missing account columns

| Object | Independent application evidence | Canonical decision |
|---|---|---|
| user_profiles.is_suspended | AuthContext signup writes false; profile refresh and App read it; EditUserModal writes it | boolean, false default, server/admin controlled |
| business_profiles.is_suspended | App reads it; EditUserModal writes it | boolean, false default, server/admin controlled |
| business_profiles.subscription_status | Settings displays it; EditUserModal writes trial/active/past_due | text, trial default; preserve existing values, no speculative production constraint |
| business_profiles.trial_start_date | EditUserModal writes ISO timestamp or null; Settings falls back to created_at | nullable timestamptz; no trial reset/backfill |

The pre-Phase-1 migration chain defined none of these columns. Migration
`20260908094000_reconcile_account_status_contract.sql` adds them without
overwriting existing values. This decision uses actual readers and writers,
not TypeScript declarations alone. Existing incompatible column types must be
detected during a live preflight before deployment.

## Application RPCs absent from the rebuilt catalog

| RPC | Caller | Status |
|---|---|---|
| check_email_exists | src/components/ForgotPassword.tsx | standalone supabase_functions.sql; not in migrations; account enumeration behavior needs removal or a separately reviewed contract |
| get_server_time | src/components/restaurant/ReservationsBoard.tsx | canonical implementation not established |
| delete_menu_item_secure | src/hooks/useRestaurant.ts | canonical implementation not established |
| delete_staff_secure | src/hooks/useRestaurant.ts | canonical implementation not established |
| log_business_activity_v2 | src/hooks/useRestaurant.ts and restaurant OrderEntry | canonical implementation not established |

These are discovery findings, not invented migrations. They prevent declaring
the entire application's expected schema fully reproducible, even though the
checked-in migration chain itself builds from zero. No restaurant rewrite was
performed to fill ambiguous contracts.

## Required object inventory

The catalog export includes every object in these categories with names and
definitions, not a TypeScript approximation:

| Category | Initial rebuilt count | Production comparison |
|---|---:|---|
| Tables (public/private/storage) | 79 | live catalog required |
| Columns | 1071 | live catalog required |
| Indexes | 190 | live catalog required |
| Constraints | 361 | live catalog required |
| Non-internal triggers | 25 | live catalog required |
| RLS policies, including storage | 124 | live catalog required |
| Functions/RPCs | 162 | live catalog required |

Counts may increase with final Phase 1 migrations; use the current generated
catalog for exact totals. Storage buckets are provisioned by migrations;
`logos` becomes private, new `business-signatures` is private and new
`business-logos` is public. Object bytes are never moved by editing SQL storage
metadata. Existing signatures stay at their original keys under private access.

Standalone SQL outside the ledger: `supabase_functions.sql`,
`supabase/restaurant_schema.sql`, `restaurant_v2_migration.sql`,
`restaurant_production_migration.sql`, `restaurant_security_hardening.sql`,
`restaurant_security_log.sql`. Several restaurant baselines were already copied
into historical migrations. Do not replay these standalone files on production;
compare their definitions to the catalog and existing ledger first.

## Release decision

Source-chain rebuild: verified on native PostgreSQL with the documented platform
fixture. Full Supabase rebuild and production parity: not yet certified.
Missing expected RPCs: unresolved. Phase 2: **NO-GO** until live drift review and
the full Supabase integration gate have real evidence.
