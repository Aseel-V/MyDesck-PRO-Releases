# Firestore Spark rollback plan

Before cutover, Supabase remains authoritative. A failed dry-run or synthetic smoke removes only exact resources in that run's cleanup manifest after confirming their `migrationRunId`; wildcard deletion is forbidden.

After Firestore begins receiving production writes, the application transaction layer writes an immutable operation/event journal in the same atomic commit. Each record carries operationId, businessId, entityId, type, actor, timestamp, result, revision, and canonical hash without secrets or unnecessary customer payload.

Rollback sequence:

1. Enable maintenance and stop new financial/business commits.
2. Capture the last Firestore journal marker and verify no pending client operation is acknowledged.
3. Reconcile new trips, payments, installments, archive/restore, and permitted user changes from immutable events and canonical hashes.
4. Apply a reviewed idempotent reverse adapter to Supabase in journal order.
5. Require exact finance, event, relationship, ID, and account parity.
6. Switch back only after rollback GO passes; otherwise remain frozen.

Historical Storage bytes are unchanged in Supabase and need no reverse copy. Functions have no runtime queue or external side effect to drain. Synthetic emulator rehearsal proves Firestore-only detection and exact-ID cleanup; real-project rehearsal remains dependent on the environment gates.
