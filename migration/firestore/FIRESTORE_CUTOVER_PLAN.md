# Firestore production cutover plan

Status: **DESIGN ONLY — NOT EXECUTED**. The source remains authoritative. Cloud SQL is not part of this design.

## Entry gates

Cutover preparation may start with the blocker-closure evidence in `migration/reports/FIRESTORE_PRODUCTION_PREP_BLOCKER_CLOSURE.md`. The exposed GitHub credential has been removed from active source, but its owner must delete/revoke it before any credential-dependent production step. Fourteen search features have an explicit Firestore, bounded-filter, external-index, or justified deferred strategy; the external index transport must be selected and deployed before affected UI routes switch. The three formerly unknown auth accounts now have deterministic `MANUAL_OPERATOR_ACTION` dispositions and must be explicitly linked or denied application access before enablement. Provisioning for excluded restaurant credentials and the protection model for any future passport fields remain cutover gates.

The operator records the source schema fingerprint, 77/77 table dispositions, current row and auth conservation, Storage manifest, transform version, deployed Rules/index version, Functions revision, IAM bindings, rollback owner, and tested recovery point. Production import credentials are granted only for the migration window and never include Owner, Editor, or Firebase Admin.

## Write freeze

The application enters a maintenance state before the final snapshot. All Supabase application writes, scheduled jobs, webhooks, payment mutations, retry workers, restaurant/market/repair writes, and file uploads are paused. The UI keeps read access and responds to attempted writes with a maintenance message; it does not queue financial mutations on the client. Server queues are drained before the freeze and no payment can be acknowledged until its authoritative write and event are in the same backend.

The freeze begins only after monitoring proves the write paths are disabled. A database read-only enforcement layer or revoked application write grants provides the final guard. The migration connection itself starts `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; a deliberate write is expected to fail with SQLSTATE `25006`.

## Final consistent snapshot and delta method

The rehearsal ledger becomes a checkpoint, not a source of truth. The final pass performs a fresh inventory and full consistent extraction. Rows are selected in deterministic primary-key order and transformed with one pinned schema and transform version.

| Domain | Reliable change signal | Final strategy |
| --- | --- | --- |
| Trips, payments, installments, mutable profiles/settings | `updated_at` where proven plus canonical hash | Re-read all rows changed since the checkpoint, then verify the full PK set and canonical hashes inside the frozen snapshot. |
| Append-only payment, installment, activity, financial and audit events | stable event ID plus timestamp/sequence | Copy IDs after the checkpoint and compare the complete ordered ID set; timestamp alone is never the cursor. |
| Tables with `created_at` but no trustworthy `updated_at` | primary key and full hash | Re-scan the complete table during freeze and compare PK/hash sets. |
| Tables with neither trustworthy timestamp nor append-only contract | none | Full frozen-table re-scan is mandatory. No incremental assumption is allowed. |
| Storage | path, size and SHA-256 | Re-list during freeze, compare the entire path set, and stream any new or changed object before final manifest parity. |
| Auth | UID and auth `updated_at` plus full account classification | Re-inventory all accounts during freeze and enforce exact UID/account conservation. |

The final delta is accepted only when a second inventory at the end of the frozen window has the same source snapshot fingerprint and every migration-owned target collection has no missing or extra document.

## Auth sequencing

Auth is imported before user-owned Firestore documents become reachable. Accounts are classified as `TRANSPARENT`, `REAUTH_REQUIRED`, `RESET_REQUIRED`, `MANUAL_OPERATOR_ACTION`, or `INTENTIONALLY_EXCLUDED_WITH_JUSTIFICATION`; `UNKNOWN` is forbidden. The current readiness ledger accounts for all ten users: seven are transparent and three require the operator to confirm account purpose and either create application linkage or explicitly deny access. Batches preserve the Supabase UID as the Firebase UID and preserve verification state only where the source evidence supports it. Compatible GoTrue bcrypt hashes use the already-proved Firebase import path without exposing hashes in logs.

Duplicate emails, phone identities, OAuth-only identities and MFA factors are held for deterministic manual rules; none is silently merged. Batch results record source UID, intended UID, state and retry count without password material. Retry uses the same UID and fails closed on collisions. Account conservation and UID equality are required before data exposure. Rollback disables newly imported accounts if the backend switch is reversed; it never deletes the Supabase identity.

## Data and Storage sequencing

1. Deploy and verify the production-intended Rules, indexes and server Functions while the production selector still points to Supabase.
2. Import reference and tenant roots, users, domain documents, immutable events, derived summaries, and migration ledger entries in dependency order. Writes are idempotent and verified documents are not duplicated.
3. Copy Storage bytes by streaming source to Firebase Storage. Preserve privacy, target path and SHA-256; resolve pre-existing orphan classifications explicitly.
4. Rebuild every derived financial summary from canonical records. Never patch a mismatch by hand.
5. Run all ten reconciliation levels, the representative authorization matrix, application read parity, transaction smoke tests, and complete source/auth/storage conservation.

## Configuration switch and smoke test

The switch is a versioned server configuration change after all gates pass. Auth, Firestore repository selection, Functions endpoints and Storage paths change together. Smoke tests cover login, business load, paginated trips, detail, traveler, payment, installment, archive/restore, analytics, search, private signature access and cross-tenant denial. No dual-write mode is used.

## Rollback and Supabase read-only period

If any smoke, conservation, security, financial, event, timestamp, Storage or latency gate fails, application traffic returns to the prior Supabase configuration while the source remains intact. Writes resume only after operators prove no acknowledged Firebase-only mutation would be lost; otherwise the incident remains frozen and is reconciled explicitly.

After a successful switch, Supabase remains read-only for a defined observation window. Its database, Auth and Storage are retained. Deletion or disabling is a separate approved milestone after audit, backup retention, rollback expiry and zero remaining runtime references.

## Failure conditions

Cutover stops on any unknown table/account, failed or silently skipped ledger entity, UID/ID mismatch, missing or extra document/event/object, migration-created orphan, cross-tenant relation, exact financial delta, derived-summary mismatch, timestamp precision loss without canonical preservation, JSON semantic mismatch, document over the Firestore limit, unresolved critical search behavior, privacy denial failure, broad IAM binding, source write, or production target ambiguity.

## Minimum IAM plan

| Identity | Minimum later access | Constraints |
| --- | --- | --- |
| Migration writer | temporary custom role limited to required Firestore document create/update/get/list and Storage object create/get/list in the approved project/buckets; auth import permissions only during the auth stage | Separate identity; time-bound; no project policy administration, user-key creation, Owner, Editor or Firebase Admin. |
| Functions runtime | Datastore User-equivalent data operations narrowed by a custom role where practical, required Storage object access, log writer, and access to named secrets | Server authorization validates caller, membership, business ownership and input before Admin SDK writes; protected fields are derived server-side. |
| Deployment operator | deploy Functions/Rules/indexes plus service-account act-as for the named runtime | Cannot read migration corpus or change project-wide IAM; no Owner or Editor. |

Exact permissions must be generated from the final deployment commands and reviewed before any grant. This rehearsal did not broaden IAM.
