# Schema portability gaps

2026-09-09. Source catalog: PostgreSQL 17.4; committed-chain local replay: 17.10.
This is an explicit migration strategy, not a Cloud SQL execution certificate.
Actual Cloud SQL provisioning is blocked by `invalidBillingAccountState`.

The baseline has 77 source public tables versus 75 replayed tables. There are
five source-only tables, three replay-only tables, 18 column differences and
19 SECURITY DEFINER functions without fixed search paths. Complete machine
details and source trigger/sequence inventories: `schema-portability-gaps.json`.

## Supabase platform replacements

| Source object | Classification | Target equivalent / required? | Migration strategy | Security impact | Data impact | Gate / required test |
|---|---|---|---|---|---|---|
| Supabase `auth.users` | AUTH_COMPAT | Application-owned compatibility identities; yes | Preserve approved UID and eleven noncredential fields with existing auth layer; no GoTrue password/session tables | No browser/runtime SELECT on compatibility identities | Same UID; no password hash stored in Cloud SQL | Blocking: FK, real Firebase token and UID parity |
| Supabase sessions, refresh tokens, providers/MFA infrastructure | SUPABASE_PLATFORM_OBJECT | Firebase Auth; no SQL clone | Intentionally exclude Supabase-owned authentication infrastructure; existing migration proof remains authoritative | Never import bearer tokens or broaden auth access | No source auth infrastructure export | Blocking for full auth migration; not needed for two password test users |
| `auth.uid`, `auth.role`, `auth.jwt`, trusted identity binding | TARGET_COMPATIBILITY_REQUIRED | Existing compatibility functions; yes | Verify token in trusted backend; transaction-local UID; runtime may SET ROLE authenticated/anon only | Runtime must never become service_role/supabase_admin | No user-ID changes | Blocking: invalid-token, RLS, RPC and pool tests on Cloud SQL |
| `service_role` BYPASSRLS in local bootstrap | AUTH_COMPAT | NOLOGIN compatibility name; yes | Precreate NOBYPASSRLS service role on Cloud SQL; schema owner performs controlled import. Do not require an unavailable superuser attribute just to replay | Runtime excluded from membership; no RLS escape | Import uses explicit schema-owner privileges | Blocking: role graph and runtime 0-owner checks |
| `supabase_admin` role name | AUTH_COMPAT | NOLOGIN, unprivileged compatibility name; yes | Keep name required by Phase 1 checks; never grant it to runtime | Protect self-admin/self-unsuspend controls | No data conversion | Blocking: both guard regressions |
| `storage.buckets`, `storage.objects`, `storage.foldername` | STORAGE_ONLY | Cloud Storage bucket/object metadata plus backend authorization; outside SQL | Do not create the harness storage schema in Cloud SQL. Externalize bucket creation and object policies from five migrations; retain all application SQL in mixed migrations | Private signatures/attachments require authenticated tenant ownership; no public URLs | Object IDs/paths retained in manifest; byte copying separate | Non-blocking for a no-file synthetic slice; blocking before file/full-data readiness |
| Legacy logos, business-signatures, business-logos policies | STORAGE_ONLY | Separate target bucket/path rules; required before bytes | Preserve legacy paths; signatures and legacy mixed bucket remain private; do not assume logos are publicly safe | Old public-signature mismatch must not return | No files copied in current blocked cloud run | Blocking before bytes: anonymous/cross-tenant download denial |
| Restaurant storage policies | STORAGE_ONLY | Cloud Storage and trusted API | Externalize policies; no `storage.objects` substitute | Preserve private writes and explicit public-read decisions per category | No restaurant files selected | Non-blocking for current no-file travel slice; required for full data |
| `supabase_realtime` publication and seven table subscriptions | REALTIME_ONLY | Authenticated backend subscriptions or scoped polling; outside PostgreSQL publication | Remove only publication statements from adapted target replay; retain restaurant tables/RPCs. Do not create fake publication | Subscribers need verified tenant scope on every channel | No relational data loss; live update delivery not proven | Non-blocking for relational slice; blocking for production app behavior |
| `pgcrypto` | EXTENSION | Cloud SQL-supported extension; yes | Install actual extension in dedicated `extensions` schema with qualified calls and fixed paths; no stub | Encryption keys remain outside client/runtime read access | Preserve ciphertext; existing production key not copied | Blocking: actual extension/functions and synthetic roundtrip where applicable |
| `uuid-ossp`, `pg_trgm` | EXTENSION | Actual Cloud SQL extensions; yes | Use Cloud SQL's supported defaults, not the local pg_trgm 1.3 packaging workaround | No privileged runtime extension creation | UUIDs preserved; search generated fields recomputed by real expressions | Blocking: extension versions, generated values and next-ID tests |
| `private.travel_mode_secrets` | TARGET_COMPATIBILITY_REQUIRED | Target-only key for synthetic rows; Secret Manager integration for eventual production | Never export source key rows. A fresh synthetic key cannot decrypt historical source ciphertext | No production plaintext/key access | Synthetic travelers contain no passports; encrypted migration remains unproven | Blocking for encrypted full-data proof |
| `private_security.whatsapp_credentials` | SUPABASE_PLATFORM_OBJECT | Secret Manager-backed service configuration | Exclude from data export; provision credentials separately only with authorization | Never copy provider credentials as tenant rows | No credential-table migration | Non-blocking for synthetic travel slice; full integration remains blocked |
| `NOTIFY pgrst, 'reload schema'` | SUPABASE_PLATFORM_OBJECT | No target PostgREST cache | Retain harmless PostgreSQL notification in replay, record that there is no subscriber | No privileged grant introduced | No row impact | Non-blocking; no false API-cache claim |

The five storage-bearing and two realtime-bearing files are explicitly listed
in machine evidence. Four storage-only migrations externalize their entire
effect; `20260429120000_trip_security_and_contract_fixes.sql` must retain its
application schema/RPC portion. The restaurant baseline DO block has internal
exception swallowing: an execution adapter must remove the known publication
operations explicitly rather than count swallowed errors as real replacements.
Original 93 migration files remain immutable. Any future adapted replay must
record the original hash, exact omitted statements and replacement responsibility
per file, with no fake storage tables/publication installed.

## Actual application table drift

Every row below is **ACTUAL_APPLICATION_SCHEMA_DRIFT**. None is mislabeled as
Supabase infrastructure or dead solely because the current slice is travel-only.

| Source object | Target equivalent / required? | Migration strategy | Security impact | Data impact | Gate / required test |
|---|---|---|---|---|---|
| `whatsapp_contact_consents` | Same relational consent table; required if selected | Forward target-only DDL from verified source catalog before importing any rows | Preserve consent owner/RLS | Do not discard consent history | Full-data blocker; compare schema/FKs/rows |
| `whatsapp_message_log` | Same log table; required if selected | Verified source DDL and tenant policies; no provider send actions | Logs may contain private content | Preserve delivery history and IDs | Full-data blocker; tenant/hash checks |
| `whatsapp_reminders` | Same schedule table; required if selected | Preserve rows but keep target dispatch workers disabled | No duplicate messages during rehearsal | Preserve timestamps/status | Full-data blocker; no outbound effects test |
| `whatsapp_server_templates` | Same configuration table; required after explicit scope decision | No synthetic UID authorizes exporting global template contents | Server configuration must remain server-only | Global rows excluded from current slice | Full-data blocker; reviewed global-data allowlist |
| `whatsapp_webhook_events` | Same event table; required after scope decision | Preserve idempotency keys; keep target webhook ingestion disabled | No unsolicited event replay | Preserve event order and payload | Full-data blocker; deduplication/hash checks |
| No source `wallets` | Existing replay table | Keep committed table empty; do not fabricate source wallets | RLS remains enabled | No source rows to import | Non-blocking if confirmed empty; explicit inventory test |
| No source `transactions` | Existing replay table | Keep committed table empty; distinguish from active `market_transactions` | Preserve RLS and FK policy | No source rows to import | Non-blocking if confirmed empty; no name substitution |
| No source `payouts` | Existing replay table | Keep committed table empty | No payout workflow enabled by migration | No source rows to import | Non-blocking if confirmed empty; no external payouts |

No DEAD/UNUSED classification is asserted without usage evidence. The three
replay-only payment-system tables are retained, not removed as presumed dead.

## All 18 column discrepancies

Classification for each row: **ACTUAL_APPLICATION_SCHEMA_DRIFT**. “Target-only”
columns have no source content to hash; their explicit target defaults/provenance
must be checked separately, never silently represented as source parity.

| Source object | Target equivalent / required? | Strategy | Security impact | Data impact | Gate / required test |
|---|---|---|---|---|---|
| `business_profiles.business_type` nullable | Same column NOT NULL | For synthetic slice assert all selected values nonnull; full-data null baseline required | Business-mode behavior must not be guessed | Do not fill source NULL silently | Conditional blocker: selected null count and exact value |
| `business_profiles.subscription_status` nullable | Same column NOT NULL | Preserve exact value; block any selected NULL | Never grant subscription entitlement to make import pass | No synthetic default substitution | Conditional blocker: NULL and entitlement checks |
| `business_profiles.is_suspended` nullable | Same column NOT NULL | Preserve; block selected NULL until explicit semantics decided | No accidental unsuspension | Do not coerce NULL to false | Conditional blocker: Phase 1 and NULL checks |
| `customer_vehicles.test_expiry` date | Missing | Add nullable date on target only | Existing tenant RLS applies | Preserve expiry | Full-data blocker; type/hash |
| `customer_vehicles.trim_level` text | Missing | Add nullable text on target only | Existing tenant RLS applies | Preserve text | Full-data blocker; UTF8/hash |
| `customer_vehicles.ownership` text | Missing | Add nullable text on target only | Existing tenant RLS applies | Preserve ownership descriptor | Full-data blocker; exact text |
| `repair_orders.currency` text | Missing | Add nullable text on target only | Do not reinterpret money across currencies | Preserve currency | Full-data blocker; currency-separated totals |
| `repair_orders.notes` text | Missing | Add nullable text on target only | Private tenant notes | Preserve text | Full-data blocker; RLS/hash |
| `trips.checklist_flight` boolean | Missing | Add nullable boolean on target only | Existing trip RLS applies | Preserve true/false/NULL | Slice blocker until overlay; row hash |
| `trips.checklist_hotel` boolean | Missing | Add nullable boolean on target only | Existing trip RLS applies | Preserve true/false/NULL | Slice blocker until overlay; row hash |
| `trips.checklist_payment` boolean | Missing | Add nullable boolean on target only | Must not imply a payment receipt | Preserve true/false/NULL | Slice blocker until overlay; finance independent |
| No source `trip_whatsapp_templates.category` | Replay-only text NOT NULL | Keep declared target default; record enrichment separately | No increased access | No source value exists | Conditional blocker if templates selected; default test |
| No source `trip_whatsapp_templates.is_favorite` | Replay-only boolean NOT NULL | Same | Existing RLS | Explicit target default | Conditional blocker if selected |
| No source `trip_whatsapp_templates.is_archived` | Replay-only boolean NOT NULL | Same | Archival behavior reviewed | Explicit target default | Conditional blocker if selected |
| No source `trip_whatsapp_templates.usage_count` | Replay-only integer NOT NULL | Same | No usage-driven side effects | Explicit target default | Conditional blocker if selected |
| No source `trip_whatsapp_templates.last_used_at` | Replay-only timestamptz | Preserve declared NULL/default separately | Existing RLS | No fabricated history | Conditional blocker if selected |
| No source `trips.source_template_id` | Replay-only UUID FK | Keep NULL on import; no invented source template | Tenant FK still enforced | Explicit target-only NULL | Non-blocking with NULL check |
| No source `trips.source_template_name` | Replay-only text | Keep NULL on import | Existing trip RLS | No invented provenance | Non-blocking with NULL check |

## SECURITY DEFINER and import triggers

Classification: **TARGET_COMPATIBILITY_REQUIRED**. All 19 unpinned functions are
enumerated with signatures in machine evidence: add_repair_service_transaction,
calculate_document_hash, cancel_fiscal_document, close_shift_with_z_report,
create_default_restaurant_staff, deduct_from_batch_fefo,
deduct_ingredients_on_order, get_expiring_items, get_fefo_batch,
get_next_document_number, get_next_z_number, get_previous_document_hash,
get_previous_z_hash, is_restaurant_manager, open_cash_shift,
trg_auto_ledger_debt, trg_update_vehicle_on_completion, update_shift_totals,
validate_staff_pin. Preserve signatures and bodies; pin trusted schemas with
`pg_temp` last and revoke CREATE on those schemas from runtime/PUBLIC. Review
unqualified references and execute tenant/RPC regression before certifying them.
This is a security gate, not merely a warning-count to ignore.

Every noninternal source trigger is recorded in JSON. The controlled importer
must disable only user triggers on imported target tables inside one transaction
so timestamps, audit rows, encryption and financial balances are not regenerated.
Keep internal FK constraints enabled, order dependencies, drain deferred checks,
restore each original trigger mode, compare generated values and rerun RLS.
No source trigger may be disabled. This strategy is required for real row parity;
it is not executed or certified on Cloud SQL while provisioning is blocked.

## Scope of completion

The discrepancies are now enumerated and assigned explicit strategies. No source
DDL was issued, no staged WhatsApp source file was adopted into the migration,
and no fake platform objects were created in a cloud target. Execution and full
catalog equivalence remain blocked until the billed disposable target exists.
