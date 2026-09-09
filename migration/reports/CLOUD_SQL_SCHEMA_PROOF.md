# Cloud SQL schema proof

Status: **BLOCKED — no Cloud SQL target exists**.

The requested instance `mydesck-migration-staging` in project `mydesckpro` was
queried twice. The project reports `billingEnabled=false` and no billing account;
Cloud SQL instance listing is empty. The create request was rejected with Google
API reason `invalidBillingAccountState`. No instance, database, IAM binding,
service account, database role, password, connector, or Cloud SQL row was created
by this phase.

Consequently the following Cloud SQL facts are intentionally **NOT PROVEN**:

- PostgreSQL 17, UTF8, region and connectivity;
- 93 real migrations against the managed target;
- 75 application tables, constraints, RLS, functions and triggers on Cloud SQL;
- actual extension availability and `SECURITY DEFINER` search paths;
- schema-owner/migration role and `mydesck_runtime` role attributes;
- runtime ownership zero, `BYPASSRLS=false`, `SUPERUSER=false`,
  `CREATEROLE=false`, `CREATEDB=false`;
- sequence repair, explicit-ID import, and target-only insert collision test;
- Firebase-token RLS, RPC, pool isolation and Phase 1 guard regressions on Cloud SQL.

The provisioning plan is recorded in `CLOUD_SQL_IAM_PLAN.md`. It intentionally
uses a separate connection-only service account with instance-scoped
`roles/cloudsql.client`, Google Auth Proxy/connector enforcement and no Firebase
Auth service-account Cloud SQL Admin grant. No Owner or Editor shortcut is used.

The local PostgreSQL 17.10 replay remains useful validation only: 93 migrations,
120 baseline assertions, 19 deterministic reconciliation assertions and 9 native
PostgreSQL fixture assertions passed. It cannot substitute for this managed-target
proof.

Before retrying: enable a valid billing account for `mydesckpro`, then rerun the
provisioner and independently record instance metadata before any schema replay.
Do not point production traffic at the instance.
