# Firestore production rollback plan

## Before Firestore receives production writes

Keep the selector on Supabase. A failed bulk copy or reconciliation deletes only documents and objects recorded by the reviewed `migrationRunId`; production UI traffic never saw them. Auth accounts created during a later import remain disabled or are deleted only when their ledger proves they were created by that run. Supabase remains authoritative.

## After Firestore receives production writes

A config flip alone is forbidden. Enable `_postCutoverJournal` before the selector switch. Every critical Function writes the journal in the same Firestore transaction as the business mutation, using the command idempotency key. The entry contains operation ID, business ID, caller UID, entity type/ID, idempotency key, timestamp, status, before/after canonical hashes, and Storage path/hash references; it contains no customer payload, password, token, or passport plaintext.

Rollback after writes follows this sequence:

1. Enable maintenance and reject new business/financial writes.
2. Capture the final Firestore journal marker and verify no pending callable is executing.
3. Reconcile journal entries since cutover against Firestore canonical records and immutable events.
4. Apply an idempotent, reviewed reverse adapter to Supabase in journal order. Financial events are inserted by original stable ID; duplicate IDs/idempotency keys are treated as already applied only after canonical hash equality.
5. Reconcile new Firebase Storage objects to Supabase Storage by path and SHA-256 before restoring any attachment-visible flow.
6. Reconcile Auth changes. Never change UIDs; reset/disable state is applied deliberately, and Supabase Auth remains present throughout the observation window.
7. Require exact finance, event, relationship, ID, timestamp, and Storage parity.
8. Switch the selector back only after the rollback GO engine returns GO, then disable maintenance.

Any missing journal entry, hash disagreement, ambiguous external side effect, or financial mismatch keeps the system frozen. WhatsApp, email, payment providers, and webhooks remain quarantined during migration, preventing irreversible effects from bulk writes.

## Journal retention and access

Clients have no access. The Functions runtime may create/read entries; migration reconciliation may list them. Update/delete is denied until the rollback window closes. Retention ends only after Supabase read-only retirement is separately approved.
