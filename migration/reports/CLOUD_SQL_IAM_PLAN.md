# Disposable Cloud SQL IAM and connectivity plan

Recorded before grants on 2026-09-09. User explicitly authorized provisioning.

- Project: `mydesckpro`; instance: `mydesck-migration-staging`.
- Region: `me-west1`; PostgreSQL 17 Enterprise, smallest shared test tier,
  zonal availability, 10 GiB SSD. This is a billed disposable staging resource.
- Provision using the signed-in operator's existing Google OAuth credentials.
  No new Owner, Editor or Cloud SQL Admin grant is requested for any identity.
- New connection-only service account:
  `mydesck-sql-staging@mydesckpro.iam.gserviceaccount.com`.
- Grant `roles/cloudsql.client` to that account, conditioned on
  `resource.name == 'projects/mydesckpro/instances/mydesck-migration-staging'`
  and `resource.service == 'sqladmin.googleapis.com'`. It grants connection/get
  access, not instance administration or database SQL privileges.
- Grant `roles/iam.serviceAccountTokenCreator` to the already signed-in operator
  on this new service account only, so the local Auth Proxy can impersonate it.
  Never create a service-account private key; preserve existing Firebase ADC.
- SQL bootstrap uses the instance's `postgres` account, with a generated database
  password stored outside Git and OneDrive in local application data. Separate
  schema-owner/migration and restricted runtime database roles follow. Runtime
  receives no schema ownership, CREATE ROLE/DATABASE, SUPERUSER or BYPASSRLS.
- The local workstation has no existing VPC route. Use an instance public IP
  solely through Google Auth Proxy, with connector enforcement REQUIRED and an
  empty authorized-networks list. No direct PostgreSQL networks are authorized.
  Proxy binds only 127.0.0.1. Public endpoint is not an unauthenticated database.
- No production app connectivity/configuration changes. Retain the instance for
  review; report its existence and ongoing billing, with cleanup requiring an
  explicit user decision.

References: [instance-scoped IAM](https://docs.cloud.google.com/sql/docs/postgres/iam-conditions),
[Auth Proxy and connector enforcement](https://docs.cloud.google.com/sql/docs/postgres/sql-proxy),
[database role defaults](https://docs.cloud.google.com/sql/docs/postgres/users).
