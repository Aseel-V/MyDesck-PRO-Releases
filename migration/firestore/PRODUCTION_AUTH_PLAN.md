# Production Auth migration plan

Machine ledger plan: `config/production-auth-ledger-plan.json`. It contains UID fingerprints and non-secret state only. Password hashes remain memory-only during import and are never placed in a report, ledger, argument, or log.

## Conservation

| Class | Count | Import action |
| --- | ---: | --- |
| `TRANSPARENT` | 7 | import same UID and compatible GoTrue bcrypt hash; preserve verified and disabled state |
| `REAUTH_REQUIRED` | 0 | create same UID without password; require supported provider login |
| `RESET_REQUIRED` | 0 | create same UID; issue controlled reset workflow after switch |
| `MANUAL_OPERATOR_ACTION` | 3 | confirm purpose, then create application linkage or explicitly deny access before enablement |
| `INTENTIONALLY_EXCLUDED_WITH_JUSTIFICATION` | 0 | record immutable reason; never silently skip |
| `UNKNOWN` | 0 | hard failure if nonzero |

Source total = classified total = 10. Planned Firebase UID equals Supabase UID for every account. The target currently contains 5 accounts; the importer must perform UID and normalized-email collision analysis without treating those accounts as absent or overwriting them.

## Importer contract

Default mode is `dry-run`. It reads the source in a repeatable-read, read-only transaction, proves a write attempt fails with SQLSTATE `25006`, recomputes classification, builds Firebase records in memory, and emits only fingerprints and counts. Production mode requires the explicit acknowledgement, approved project/database/source/transform/rules/commit identities, exact expected source count, unique target UID/email sets, a unique `migrationRunId`, and a GO result.

Firebase batches contain at most 1,000 users. Each batch records `PENDING`, `IMPORTED`, `VERIFIED`, `MANUAL_ACTION`, or `FAILED`. Retry reuses the same UID and run ID, classifies permanent conflicts separately, and never skips a record after retry exhaustion. `VERIFIED` requires target UID equality, disabled state, email-verification state, and the planned login/reset/manual-action proof.

## Exact sequence

1. `node migration/firestore/tools/production-auth-import.mjs --mode=dry-run --run-id=<id>`
2. Review conservation, collisions, the three operator actions, and zero unknowns.
3. Pin the reviewed preparation commit and current target Auth count in the signed run manifest.
4. During the later frozen cutover, re-inventory source and target accounts and rerun dry-run.
5. Only after an actual GO: execute production import with the exact acknowledgement and signed manifest.
6. Verify every imported account before Firestore documents become reachable.

No production import was run in this milestone.
