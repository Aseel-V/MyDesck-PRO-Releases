# Firestore Spark production GO checklist

Machine authority: `migration/reports/firestore-production-dry-run.json`. Billing, Functions, and Storage capability gates were removed only after their runtime proofs passed. Historical evidence is retained.

| Gate | Current | Evidence / remaining action |
| --- | --- | --- |
| Project, literal `default` database, Spark/no billing | PASS | Read-only production inventory. |
| Auth classification | PASS | 10/10; unknown 0; import not started. |
| Migration IAM | FAIL | Migration identity synthetic Firestore read is 403; approve minimum writer binding. |
| Current/candidate/rollback Rules readiness | PASS | Current source/release captured; candidate emulator-tested; rollback bytes hashed. |
| Required indexes | FAIL | 0/3 READY; operator must deploy exactly the verified three and wait. |
| Quota budget | PASS | Bounded workflow costs and break-even limits recorded. |
| No Functions / no Storage | PASS | Active graph counts are zero; billing remains disabled. |
| Critical transactions and malicious client | PASS | Firebase client SDK and adversarial Rules emulator tests. |
| Real production client-SDK smoke | NOT_RUN | Requires candidate Rules, indexes, IAM and isolated test identities. |
| Data, delta, exact finance, relationships, events | PASS | Existing complete reconciliation preserved. |
| Search 14/14, languages, Electron | PASS | Active Firebase-mode paths are provider-free and bounded. |
| Active Firebase-mode Supabase dependency | PASS | Reachable count 0; fallback disabled. |
| GitHub credential revocation | FAIL | Removed from source; provider revocation remains unconfirmed. |
| Maintenance, rollback, observability, selector | PASS | Spark transaction journal and fail-closed controls. |

Any FAIL or NOT_RUN keeps the decision `NO_GO`. No production customer migration or backend switch is authorized.
