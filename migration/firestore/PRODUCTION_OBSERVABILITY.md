# Production migration observability

Every log and metric carries `migrationRunId`, phase, mode, source table/entity type, redacted source-key fingerprint, target collection, attempt count, latency, outcome, and stable error category. Aggregates record source rows read, Firestore writes, verified/failed documents, retries and throttling, Auth pending/imported/verified/manual/failed counts, Storage objects/bytes/copied/verified, reconciliation mismatches, Function errors, Firestore API errors, and Rules permission denials.

Allowed dimensions are bounded. UID, business ID, entity ID, object path, and email are represented by keyed or SHA-256 fingerprints in central logs. Canonical hashes are evidence fields, not payloads. Logs must never contain password/auth hashes, plaintext passwords, access or refresh tokens, secrets, passport plaintext, decrypted passport data, customer document bodies, or Storage bytes.

Alerts stop the run on permanent write errors, exhausted retries, unexpected permission denials, count drift, ledger inconsistency, any reconciliation mismatch, or a Function external-side-effect attempt. Dashboards separate source-read, target-write, verification, delta, and rollback phases. A completed run publishes a signed aggregate evidence file and retains raw logs only under the approved migration retention policy.
