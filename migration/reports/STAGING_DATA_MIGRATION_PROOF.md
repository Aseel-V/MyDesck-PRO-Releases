# STAGING DATA MIGRATION PROOF

Run date: 2026-09-09. **BLOCKED — FIX BEFORE FULL STAGING MIGRATION**.

The read-only source inventory and local reconciliation controls ran. No Cloud
SQL instance exists in `mydesckpro`; no production slice was exported or imported.
Local fixture parity is not evidence of Supabase-to-Cloud-SQL data parity.

## Source

- Database: Supabase project `pubugnfaqqukelvgckdr`, PostgreSQL 17.4, UTF8.
- Read-only enforcement: connection startup `default_transaction_read_only=on`,
  explicit REPEATABLE READ / READ ONLY transaction, verified before and after
  successful reads, followed by ROLLBACK. TLS certificate verification enabled.
- The supplied role is not superuser, but has UPDATE privilege. The transaction
  guard is therefore necessary; no source role/grant/configuration was changed.
- Three deliberately impossible writes (`UPDATE ... WHERE false`) were rejected
  with SQLSTATE `25006`, across the inventory attempts and catalog capture.
- Selected slice: the three exact Supabase UIDs in the existing six-entry cleanup
  manifest. UID/email correspondence passed. No hashes, passwords or keys read.
- Rows read: **6 synthetic identity-row reads, 3 distinct identities**. An initial
  inventory attempt read the three identities and then stopped because the SQL
  allowlist rejected an UPDATE privilege-name literal; the corrected attempt
  read the same three again. Other reads were catalogs and aggregate counts.
- All direct public-table FK reference counts for these UIDs are zero.
- Real customers included: **0**. Business-row payloads read/exported: **0**.
- No synthetic business data was created: the retained accounts' passwords and
  sessions were deliberately discarded by the previous proof. No approved,
  available application session was present, and the committed source rules
  require no source writes. The signup/import proof was not rerun.

## Target

- Cloud SQL instance/database: **none**. The signed-in operator's read-only
  `gcloud sql instances list --project=mydesckpro` succeeded and returned `[]`.
- The migration service account's instance-list request was denied. Its existing
  Firebase permissions do not establish Cloud SQL access. No IAM changes made.
- Cloud SQL PostgreSQL version/encoding: **BLOCKED**, no target to inspect.
- Disposable local validation database:
  `mydesck_migration_staging_local_be3aca044351`, PostgreSQL 17.10, UTF8.
- This newly created local database is retained with the clean replayed schema.
- Production app connected: **No**. No application configuration changed.
- No cloud resource was provisioned while the source slice and schema were blocked.

## Schema

- Local replay: **93 executed, 0 failures**, 75 public tables, 79 FKs to auth.users,
  113 public RLS policies, RLS enabled on all 75 tables.
- Replay outcomes: 26 PASS, 60 PASS_WITH_SHIM, 7 SKIP_WITH_JUSTIFICATION. Those
  seven SQL files executed against the established infrastructure stubs; they
  do not prove Cloud SQL equivalents for Supabase infrastructure.
- Runtime `mydesck_runtime`: SUPERUSER=false, BYPASSRLS=false, public ownership=0.
- Source inventory: **77 public tables**, 1,082 columns, 477 triggers including
  internal constraint triggers, 10 owned sequences. No unvalidated public FKs.
- Table drift is more than a count difference. Source-only:
  `whatsapp_contact_consents`, `whatsapp_message_log`, `whatsapp_reminders`,
  `whatsapp_server_templates`, `whatsapp_webhook_events`. Local replay-only:
  `payouts`, `transactions`, `wallets`. No drift was patched or excluded silently.
- Full column/constraint equivalence remains BLOCKED. The source catalog records
  every public FK and PK, generated/identity columns, and trigger names. No
  production function body or encryption secret was exported.
- User triggers remain BLOCKED for import pending individual review; internal
  constraint triggers are classified SAFE and must stay enabled. None was
  disabled on Supabase. Local temp-fixture triggers were restored and verified.
- Existing replay reports 19 SECURITY DEFINER functions without a pinned
  search_path. This inherited posture is recorded, not certified as hardened;
  function-by-function Cloud SQL review is still required.

## Data Slice

- Users: 3 validated synthetic source identities; target migrated users: 0.
- Businesses, trips, travelers, payments, installments, events, documents:
  **0 selected/exported/imported**. No representative business slice exists.
- Other dependent rows: no payload extraction. All 77 tables are accounted for
  in the dependency plan, but it is not an executed FK-closure export.
- Auth-unreachable public tables are explicitly listed in the plan. Global
  configuration and webhook rows are not authorized by a synthetic UID alone.
- Exporter/importer execution and complete row closure remain BLOCKED. No
  untested importer was used to work around missing data or schema drift.

## UID / ID Preservation

- Supabase UID/email vs retained manifest: **3/3 MATCH**.
- Existing Supabase/Firebase UID mapping is retained from the verified Phase 1
  proof. Firebase was not changed or freshly re-verified during this phase.
- Target compatibility auth.users.id, business/trip/other PK preservation:
  **BLOCKED — no Cloud SQL import**.
- Local temp-fixture BIGINT and UUID preservation: PASS, including IDs above 2^53.

## Reconciliation

- Cloud SQL tables checked: **0**. Count, PK and content mismatches: **not measured**.
- Every planned table and each of the three user entities is BLOCKED. No empty
  slice is labeled MATCH or used to produce a readiness decision.
- Added deterministic column/type-aware row hashes, PK-set comparison, exact
  decimal sums, grouped totals, per-parent event order and orphan checks.
- Cells must be PostgreSQL text or NULL. JavaScript Number is rejected. Native
  PostgreSQL canonical JSONB text preserves large JSON numbers; raw JSON text,
  microseconds, DATE, BOOLEAN and BYTEA are also covered. Hashes include column
  types, names, NULLs and PKs. Row and column enumeration order is irrelevant.
- These are tested reconciliation components, not a completed production export
  pipeline. Real entity/financial/document/storage reconciliation is BLOCKED.

## Financial Parity

- Production slice currencies/source totals/target totals/unexplained delta:
  **BLOCKED — not measured**, not zero.
- Local fixture exact amount sum: source and target both
  `9007199254740993.12345677`; unexplained fixture delta **exactly 0**.
- A change of `0.00000001` is detected without epsilon. Currency-separated
  grouping is tested; per-user/business/trip production totals remain BLOCKED.

## Referential Integrity

- All source public FK definitions inventoried. Public unvalidated FKs: 0.
- Production orphan baseline and migrated FK checks: **BLOCKED**, no row closure.
- Migration-created production/Cloud SQL orphans: no import performed; no claim
  that existing production data is orphan-free.
- Local changed UUID/FK corruption is detected as an orphan; deferred constraints
  validate after restoration. Clean fixture orphan count: **0**.

## Event Ordering

- Production events checked: **0**; ordering mismatches: **not measured**.
- Native PostgreSQL fixture order uses parent, timestamp, sequence and ID.
  Reordering is detected independently of count and unordered content equality.
- Missing row, UUID/FK, NUMERIC, event order, orphan and timestamp corruptions
  all detected. Each SQL corruption was rolled back and clean parity rechecked.

## Sequences, Triggers and Encryption

- Ten source sequence definitions inventoried without nextval/setval on source.
- Local explicit BIGINT import followed by setval and a real next INSERT passed
  without collision. Historical timestamps and computed balance matched.
- Deferred FK events must be drained before re-enabling target triggers; the
  local control caught PostgreSQL `55006`, was corrected, and passed on rerun.
- Synthetic encrypted passport round trip: **BLOCKED**, no synthetic business
  payload exists. No production encryption material or plaintext passport read.

## Storage Manifest

- Manifest status: **BLOCKED/inventory only**; no selected business-row payloads.
- Objects discovered: 0; public/private/signature object counts: not measured.
- Catalog reference candidates are listed in `staging-storage-manifest.json`.
  Object entries require bucket/path/owner/business/trip/MIME/size/privacy.
- Copied/downloaded objects: **0**. Checksums and unauthenticated/cross-tenant
  object access tests: not run. Storage copy is not authorized by the committed
  staging plan. No storage policies, URLs or rules changed; no signature exposed.

## Security Regression

- Existing complete local harness: **120 assertions, 0 failures**.
- Reconciliation unit/guard controls: **19 assertions, 0 failures**.
- Native PostgreSQL temp-fixture controls: **9 assertions, 0 failures**.
- Combined current validation: **148 assertions, 0 failures**, 93 migrations.
- auth.uid(), RLS, cross-tenant, RPC, pool identity and Phase 1 guards: existing
  local suites PASS. Offline Firebase token-boundary guards PASS.
- Fresh real Firebase token and post-import Cloud SQL security suite:
  **BLOCKED/not run**. The prior real-token proof was preserved, not rerun.
- Temp fixtures/functions were removed by ROLLBACK. All four pre-existing
  generated report files were restored byte-for-byte.

## Production Changes

- Customer writes: **0**. Source auth changes: **0**. Firebase auth changes: **0**.
- Application configuration changes: **0**. Cutover: **No**.
- Evidence: read-only server settings, rejected-write SQLSTATE, SELECT-only
  extraction interface, and terminal ROLLBACK. No source mutation SQL other than
  the deliberately rejected false-predicate controls was submitted.
- No database-wide before/after checksum or privileged audit-log access was
  available/used. This proves the tool sessions did not commit source writes;
  it does not claim unrelated production activity stopped during the run.

## Repository and Evidence

- Starting branch: `codex/firebase-migration`.
- Starting commit: `287f4cc2a10c02911ee15c6a35639b3b24e91c2a`.
- Tooling commit: `48e0747` (`Add read-only staging inventory and exact reconciliation controls`).
- Recovery tag: `recovery/pre-staging-data-migration-20260909-160436`.
- **213/213 unrelated staged paths and working-file bytes preserved**. Existing
  recovery tags and six-entry cleanup manifest retained; deletionApproved=false.
- `migration/.env.local` and local runtime evidence are ignored.
- The current-index secret scan found a GitHub-token-shaped value in the already
  staged `src/commit_log.txt`. The value was not printed, tested against GitHub,
  edited, or included in either migration commit. Its validity is unverified.
  “No secret tracked” cannot be certified until that unrelated staged artifact
  is handled by its owner. The fake private-key unit-test string was identified
  as a literal placeholder and excluded from that finding.
- Machine evidence: `staging-preflight.json`, `staging-source-inventory.json`,
  `staging-schema-plan.json`, `staging-local-validation.json`,
  `staging-postgres-controls.json`, `staging-storage-manifest.json`,
  `staging-data-migration-evidence.json`.

## Decision

**BLOCKED — FIX BEFORE FULL STAGING MIGRATION**

Required before the next attempt: resolve the staged secret finding, reconcile
the explicit source/replay schema differences, supply an approved representative
synthetic business slice through a permitted application path, and establish a
disposable Cloud SQL 17 target with migration access. Then complete FK-closure
export/import, real entity and financial reconciliation, storage references,
target security tests and staging review. No full migration or cutover follows
automatically from the local results above.
