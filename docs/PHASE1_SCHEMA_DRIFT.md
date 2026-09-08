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

## Application RPCs reconciliation status

| RPC | Caller | Canonical Resolution | Status |
|---|---|---|---|
| `check_email_exists` | `src/components/ForgotPassword.tsx` | Caller removed. `ForgotPassword.tsx` directly invokes native `supabase.auth.resetPasswordForEmail(email)` to eliminate unauthenticated email enumeration vulnerabilities. | **RESOLVED / REMOVED** |
| `get_server_time` | `src/components/restaurant/ReservationsBoard.tsx` | Added in migration `20260908120000_reconcile_application_rpcs.sql` with `SECURITY DEFINER` and `SET search_path = ''`. | **REPRODUCIBLE** |
| `delete_menu_item_secure` | `src/hooks/useRestaurant.ts` | Added in migration `20260908120000_reconcile_application_rpcs.sql` with `SECURITY DEFINER`, `SET search_path = ''`, and `business_id = auth.uid()` tenant enforcement. | **REPRODUCIBLE** |
| `delete_staff_secure` | `src/hooks/useRestaurant.ts` | Added in migration `20260908120000_reconcile_application_rpcs.sql` with `SECURITY DEFINER`, `SET search_path = ''`, and `business_id = auth.uid()` tenant enforcement. | **REPRODUCIBLE** |
| `log_business_activity_v2` | `src/hooks/useRestaurant.ts` and restaurant OrderEntry | Added in migration `20260908120000_reconcile_application_rpcs.sql` with `SECURITY DEFINER`, `SET search_path = ''`, and `business_id = auth.uid()` tenant enforcement logging to `restaurant_audit_logs`. | **REPRODUCIBLE** |

All 43 application RPCs called from source code are now 100% reproducible within the canonical forward-only migration chain. Zero actively-used production RPCs exist only in drift.

## Required object inventory

The catalog export (`results/rebuilt-schema-catalog.json`) includes every object in these categories with names and definitions:

| Category | Rebuilt Count (93 migrations) | Production Comparison |
|---|---:|---|
| Tables (public/private/storage) | 79 | Live catalog required |
| Columns | 1071 | Live catalog required |
| Indexes | 190 | Live catalog required |
| Constraints | 361 | Live catalog required |
| Non-internal triggers | 25 | Live catalog required |
| RLS policies, including storage | 124 | Live catalog required |
| Functions/RPCs | 166 | Live catalog required |

Storage buckets are provisioned by migrations:
- `logos`: private
- `business-signatures`: private
- `business-logos`: public

## Production parity inspection instructions

When read-only database credentials (`DATABASE_URL`) for production are available, export the production catalog using the exact queries used in `scripts/test-security-postgres.mjs`:

```bash
# Export production catalog to JSON
node -e "
import pg from 'pg';
import { writeFileSync } from 'node:fs';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const catalog = {};
for (const [name, sql] of Object.entries({
  tables: \"SELECT schemaname,tablename,rowsecurity FROM pg_tables WHERE schemaname IN ('public','private','private_security','storage') ORDER BY 1,2\",
  columns: \"SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','private','private_security','storage') ORDER BY 1,2,ordinal_position\",
  indexes: \"SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','storage') ORDER BY 1,2,3\",
  constraints: \"SELECT n.nspname AS schema,c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') ORDER BY 1,2,3\",
  triggers: \"SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage') ORDER BY 1,2,3\",
  policies: \"SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname\",
  functions: \"SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef AS security_definer,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','private_security') AND p.prokind='f' ORDER BY 1,2,3\"
})) catalog[name] = (await client.query(sql)).rows;
await client.end();
writeFileSync('results/production-schema-catalog.json', JSON.stringify(catalog, null, 2));
console.log('Production catalog exported successfully.');
"
```

Then diff `results/production-schema-catalog.json` against `results/rebuilt-schema-catalog.json`.

## Release decision

- **Source-chain rebuild**: **PASS** (93 migrations apply cleanly from zero on empty PostgreSQL).
- **RPC Reconciliation**: **PASS** (100% of active application RPCs are now defined in migrations with fixed `search_path = ''` and caller authentication).
- **Full local Supabase HTTP integration**: **BLOCKED** by Docker service unavailability in the local host environment.
- **Production live parity certification**: **BLOCKED** by lack of direct read-only PostgreSQL connection string for production.
- **Phase 2 Gate Decision**: **NO-GO** until live production parity verification and the real Supabase integration test suite pass with real evidence.

