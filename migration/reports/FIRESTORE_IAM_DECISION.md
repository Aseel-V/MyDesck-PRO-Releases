# Firestore migration IAM decision

Generated from live, read-only inspection of project `mydesckpro`
(`migration/reports/firebase-production-environment-inventory.json`). Every claim below is a measurement, not a
restatement of a prior session.

## Live evidence that forced this decision

| Measurement | Value | Source |
| --- | --- | --- |
| Service accounts that exist | `mydesck-migration@`, `firebase-adminsdk-fbsvc@` | `evidence.serviceAccounts` (HTTP 200) |
| `mydesck-firestore-migration@` exists? | **NO** | same listing |
| Roles held by `mydesck-migration@` | **`roles/firebaseauth.admin` only** | `evidence.iamPolicy.bindings` |
| `roles/datastore.user` holders | **none** | same |
| Impersonation of `mydesck-migration@` | **PASS** | `report.impersonation` |
| Migration synthetic Firestore read | **HTTP 403 PERMISSION_DENIED** | `evidence.migrationSyntheticRead` |
| Databases in project | exactly one: `projects/mydesckpro/databases/default` | `evidence.databases` |
| Database edition / tier | `ENTERPRISE`, `freeTier: true` | same |
| Billing enabled | **false** | `evidence.billing` |
| `datastore.googleapis.com` | ENABLED | `evidence.services` |

Because impersonation succeeds, the 403 is a true measurement of the migration principal's Firestore authority and
not an artifact of a missing token. The blocker is real.

## The discrepancy, resolved

`FIRESTORE_IAM_REQUIREMENTS.md` prefers a separate `mydesck-firestore-migration@` principal "so Auth and
data-migration authority cannot be combined accidentally". The reviewed binding `migration-writer` in
`environment-readiness.mjs` instead targets `mydesck-migration@`.

The live policy settles it. `mydesck-migration@` holds `roles/firebaseauth.admin`, whose included permissions are
`firebaseauth.users.create`, `.delete`, `.update`, `.get`, `.createSession`, `.sendEmail`, plus
`firebaseauth.configs.getHashConfig` and `.getSecret`. Granting that same principal Firestore data authority would
produce a single identity that can both **mint or alter any customer identity** and **write any tenant's business
and financial data**, including reading the password hash configuration. That is the precise combination the
mission and the repository's own requirements forbid, and no documented justification for combining them exists.

**Decision: do not extend `mydesck-migration@`. Provision the dedicated principal.**

## Selected principal

`serviceAccount:mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com` — created for this purpose, holding
no other role.

## Selected role

A custom project role rather than `roles/datastore.user`, because the mission asks for "`roles/datastore.user` or
narrower if practical" and `FIRESTORE_IAM_REQUIREMENTS.md` already specifies the narrower set:

- `datastore.databases.get`
- `datastore.databases.getMetadata`
- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.create`
- `datastore.entities.update`
- `datastore.entities.delete`
- `resourcemanager.projects.get`

`roles/datastore.user` additionally carries `datastore.indexes.list`, `datastore.namespaces.*`,
`datastore.statistics.*` and `datastore.entities.allocateIds`. The migrator uses deterministic document IDs, so
`allocateIds` is not required; the rest are not required either.

## Permissions deliberately excluded

Index administration (`datastore.indexes.create/delete/update`), import/export
(`datastore.databases.import/export`), database create/delete, `resourcemanager.projects.setIamPolicy`,
`iam.serviceAccounts.actAs`, billing assignment, and every Firebase Auth permission. Owner, Editor, Firebase Admin,
Project IAM Admin, Billing Admin and Service Account Admin are all excluded. Index deployment and Rules deployment
remain with the human operator identity, which keeps release authority separate from data authority.

## Separation-of-duties analysis

After this change the project has three distinct authorities:

1. **Auth administration** — `mydesck-migration@`, `roles/firebaseauth.admin`. Unchanged. No Firestore data access.
2. **Firestore data migration** — `mydesck-firestore-migration@`, custom role. No Auth access, no index authority,
   no IAM authority.
3. **Release/deployment** — the human operator (`roles/owner`). Deploys indexes and Rules.

No principal holds both identity-minting and tenant-data-writing authority.

## Scope and condition

The project contains exactly one database, so a database-scoped condition adds no isolation that the project
boundary does not already provide. It is applied anyway when it is proven not to break access, and abandoned if it
does — the mission forbids a fragile condition that prevents required Firestore access. Firestore's data plane is
not reliably IAM-condition-aware for `datastore.entities.*`, so the condition is treated as a hypothesis to be
tested against the synthetic read, not as a given.

Condition under test:

```
resource.name=="projects/mydesckpro/databases/default" ||
resource.name.startsWith("projects/mydesckpro/databases/default/documents/")
```

## Verification gate

`inspect-production-environment.mjs` must report `migrationSyntheticRead.http === 200` while impersonating the
selected principal. Anything else leaves the IAM gate FAIL. Broadening to an admin role as a shortcut is refused.
