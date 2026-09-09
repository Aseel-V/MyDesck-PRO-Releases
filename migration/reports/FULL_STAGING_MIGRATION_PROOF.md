# Full staging migration proof

Run date: 2026-09-09. Decision: **BLOCKED — FIX BEFORE FULL-DATA MIGRATION REHEARSAL**.

## Secret Finding

- Suspected file: `src/commit_log.txt`, staged before migration commits, line 29.
- Classification: GitHub classic personal access token syntax; high confidence.
- Redacted fingerprint: SHA-256 prefix `39a987553136`.
- State: staged-only addition; no matching blob found in locally reachable history.
- Action required: **SECRET REMEDIATION REQUIRED**. The owner must review,
  revoke/rotate if appropriate, and remove or redact it from the unrelated staged
  artifact. It was not printed, transmitted for liveness testing, modified, or
  included in migration commits. Git history was not rewritten.

## Cloud SQL

- Project: `mydesckpro`.
- Instance/database: none. `mydesck-migration-staging` creation was rejected by
  `invalidBillingAccountState`; project billing is disabled and instance listing
  is empty.
- PostgreSQL/UTF8/region/connectivity: not proven.
- Disposable: no resource created.
- Production app connected: no.
- See [CLOUD_SQL_SCHEMA_PROOF.md](CLOUD_SQL_SCHEMA_PROOF.md) and
  [CLOUD_SQL_IAM_PLAN.md](CLOUD_SQL_IAM_PLAN.md).

## Schema

- Source catalog: 77 public tables, 1,082 columns, 477 triggers, 10 sequences.
- Replay target baseline: 93 migrations, 75 public tables, 79 auth FKs, 113 RLS
  policies, all 75 tables RLS-enabled.
- Local baseline replay: 26 PASS, 60 PASS_WITH_SHIM, 7 SKIP_WITH_JUSTIFICATION,
  0 FAIL. The seven skips rely on test stubs and are not Cloud SQL proof.
- Explicit gaps: five source-only WhatsApp tables, three replay-only payment
  tables, 18 column differences and 19 unpinned SECURITY DEFINER functions.
- Full classification and per-gap strategy:
  [SCHEMA_PORTABILITY_GAPS.md](SCHEMA_PORTABILITY_GAPS.md).
- Runtime local baseline: ownership 0, `BYPASSRLS=false`, `SUPERUSER=false`.
  Cloud SQL role checks: not run.

## Synthetic Dataset

- Users: 2 synthetic `migration-test--travel-...` identities; Firebase password
  login and real ID-token verification passed for both; UID preserved.
- Businesses/tenants: 2.
- Trips: 4 (2 per tenant), with Arabic, Hebrew and English values.
- Travelers: 8.
- Payment plans: 4; installments: 6; installment events: 4; payment events: 4.
- Audit/activity rows: 100 selected by FK closure.
- Currencies: ILS and EUR.
- Documents: 0. Files/Storage objects: 0; manifest-only.
- Real customers included: **0**.
- Synthetic source writes were made only through signup, profile PostgREST and
  the normal trip/payment RPC path. After creation, extraction was read-only.
- Cleanup manifest has `deletionApproved=false`; no automatic cleanup occurred.

## Import

- Source tables with selected rows: 11.
- Rows exported: 132.
- Rows imported to Cloud SQL: 0 (no target).
- ID mismatches: not measurable; no target import.
- Private export payload is kept outside the repository and synced workspace.

## Reconciliation

- Cloud SQL count mismatches: not measured.
- Cloud SQL PK mismatches: not measured.
- Cloud SQL content mismatches: not measured.
- The deterministic exporter records row counts, primary-key values, column types,
  exact text/NULL cells, JSONB, BYTEA, timestamps and canonical row hashes.

## Financial

- Currencies: ILS, EUR.
- Financial rows: trip sale/cost, payment plans, installments and payment events.
- Exact examples include ILS sale `1234.57`, cost `987.13`, mixed plan card
  `100001` minor units, cash `23456`, partial cash `12003`; EUR sale `918.43`,
  cost `711.29`, partial cash `27011`.
- Unexplained delta: not measured against Cloud SQL; required value is **0**.
- No JavaScript floating-point value was used as export source-of-truth.

## Referential Integrity

- FK closure: 132 selected rows, all selected FK checks passed in source snapshot.
- FKs checked against target: 0.
- Migration-introduced orphans: 0 because no import occurred.
- Existing source orphan baseline: no source orphan was silently repaired; full
  production baseline remains pending target review.

## Events

- Source event rows selected: 8 payment/installment events.
- Target events checked: 0.
- Ordering mismatches: not measured against Cloud SQL; expected **0**.
- The reconciliation suite detects reordered events independently of row counts.

## Negative Controls

- Missing row: CAUGHT in 19 deterministic controls and native PostgreSQL fixture.
- Changed FK/UUID: CAUGHT.
- Changed NUMERIC: CAUGHT exactly, including `0.00000001`.
- Reordered event: CAUGHT.
- Orphan: CAUGHT.
- Changed timestamp: CAUGHT.
- Changed JSON: CAUGHT.
- Storage checksum: not applicable; no objects existed.
- Cloud SQL execution of these controls: not run; all expected managed-target
  results remain unproven.

## Storage

- Objects: 0 synthetic objects discovered.
- Copied: 0.
- SHA-256 mismatches: not applicable.
- Private access: no object to test; synthetic profile and trip references are
  empty. Broad production Storage migration remains forbidden.

## Security

- Firebase token: 2/2 real synthetic tokens verified.
- `auth.uid()`: source identity binding and Phase 1 proof passed previously;
  fresh Cloud SQL binding not run.
- Tenant isolation/RPC/pool/Phase 1 guards: prior local proof passed; managed
  Cloud SQL run blocked by missing target.

## Harness

- Migrations: 93 local replayed.
- Assertions: 148 total local controls (120 baseline + 19 reconciliation + 9
  PostgreSQL fixture).
- Failures: 0.
- Cloud SQL harness: not run.

## Production Impact

- Real customer changes: **0**.
- Production Firebase changes: 0 outside the approved synthetic identities.
- Production cutover: no.
- Production configuration changes: no.
- Source extraction writes: 0; read-only transaction showed `transaction_read_only=on`
  and rejected attempted writes with SQLSTATE `25006`.

## Git

- Starting commit: `287f4cc2a10c02911ee15c6a35639b3b24e91c2a`.
- Migration commits: `48e0747`, `3647ed4`, `a52e5d2`.
- Unrelated staged paths before: 213.
- Unrelated staged paths after: 213; index entries and working-file bytes preserved.
- New migration commits used explicit pathspecs. The suspected token file was not
  included in any migration commit.

## Final Decision

**BLOCKED — FIX BEFORE FULL-DATA MIGRATION REHEARSAL**

The next allowed step is to restore valid billing for `mydesckpro`, create the
disposable Cloud SQL target under the recorded least-privilege plan, replay the
real schema without test stubs, import only this 132-row synthetic slice, and
complete target reconciliation and security regression. Do not start full-data
rehearsal or production cutover automatically.
