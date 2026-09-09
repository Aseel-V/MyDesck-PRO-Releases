# Disposable staging data proof

See `reports/STAGING_DATA_MIGRATION_PROOF.md` for the current BLOCKED decision.
These commands run from the repository root and read only ignored local config:

```powershell
node migration/tools/staging-preflight.mjs
node migration/tools/staging-source-inventory.mjs
node migration/tools/staging-schema-plan.mjs
node migration/tools/staging-local-validation.mjs
node migration/tests/staging-postgres-controls.mjs
```

The preflight requires this run's ignored `migration/staging.local/preflight.json`
baseline. It returns nonzero for a secret finding; never print matching content.
The source commands access only the pinned source project in read-only
transactions; they do not seed accounts, business data, or read password hashes.
The inventory counts direct synthetic references, not a complete row closure.

The local validation command requires the already established local PostgreSQL
17 compatibility target, creates a new disposable database, runs the unchanged
120-assertion harness plus 19 new offline tests, and restores pre-existing report
bytes. The PostgreSQL controls add nine tests using transaction-local temporary
fixtures; their final ROLLBACK removes the fixtures. The clean local database is
retained. Neither command connects to Cloud SQL or imports a production slice.

`lib/staging-reconcile.mjs` accepts text-only PostgreSQL projections with explicit
column types and PKs. Use UTC/ISO timestamps and PostgreSQL-native JSONB text.
It intentionally rejects JS numeric cells. It is a tested reconciliation library,
not an operator-approved exporter/importer. A complete importer must still gate
schema identity, tenant closure, trigger review, target provenance, exact rows,
nonempty representative coverage, and all report criteria before reporting READY.

No automatic cleanup, storage copying, Firebase mutations, source business
writes, production configuration changes or cutover is authorized by these tools.
