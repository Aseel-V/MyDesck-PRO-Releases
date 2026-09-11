# Firestore IAM requirements

Status: **PLAN ONLY — NO IAM GRANTS APPLIED**

Project: `mydesckpro`. Phase 2 uses only the local emulator. The existing Firebase Auth migration identity, `mydesck-migration@mydesckpro.iam.gserviceaccount.com`, is not granted Firestore access. A separate `mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com` identity is the preferred migration principal so Auth and data-migration authority cannot be combined accidentally.

## Migration read/write identity

Create a custom project role containing only:

- `datastore.databases.get` (begin/rollback transactions)
- `datastore.databases.getMetadata`
- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.create`
- `datastore.entities.update`
- `datastore.entities.delete` (rehearsal rollback and corruption-control restoration)
- `resourcemanager.projects.get`

The migrator uses deterministic document IDs, so it does not require `datastore.entities.allocateIds`. Bulk import/export, index administration, database creation/deletion, IAM mutation, Firebase Admin, Owner, and Editor are excluded. Before granting the custom role, constrain the executable to the approved synthetic/full-rehearsal manifest and retain the real-customer and project-ID guards.

## Trusted Functions runtime

Use a dedicated Functions runtime service account. The safe predefined starting point is `roles/datastore.user`, which Google documents as the read/write role intended for application service accounts. A later hardening pass can replace it with the same entity CRUD/transaction custom permissions above after every deployed function's access is inventoried. Server SDK access is controlled by IAM and bypasses client Security Rules, so each function must continue to derive UID from the verified callable context and perform its own tenant check.

## Deployment identity

Keep release authority separate from both data principals:

- `roles/datastore.indexAdmin` only for index definition deployment.
- A custom Rules deployer role with `firebaserules.rulesets.create`, `firebaserules.rulesets.get`, `firebaserules.rulesets.list`, `firebaserules.rulesets.test`, `firebaserules.releases.create`, `firebaserules.releases.get`, `firebaserules.releases.list`, and `firebaserules.releases.update`, plus the Firebase/project read permissions required by the CLI.
- For a Functions release job, Google documents `roles/cloudfunctions.admin` plus `roles/iam.serviceAccountUser` on the selected runtime service account. Grant these only to the release identity and only when real deployment is approved.

## Normal web and Electron clients

Normal clients receive **no Google Cloud IAM role** and contain no service-account credential. They use Firebase Auth, tenant-scoped queries, Security Rules, and App Check. The API key identifies the Firebase project; it is not database authority.

Sources: [Firestore server IAM and required API permissions](https://cloud.google.com/firestore/docs/security/iam), [Firestore roles and permissions](https://cloud.google.com/iam/docs/roles-permissions/firestore), and [Firebase IAM permissions for Rules and Functions deployment](https://firebase.google.com/docs/projects/iam/permissions).

