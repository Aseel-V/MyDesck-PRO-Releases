# Firestore production GO checklist

This is the preparation-time state. `GO` is impossible while any blocking row is not PASS. Missing evidence is `NO_GO`.

| Gate | Status | Evidence | Owner / action | Blocking |
| --- | --- | --- | --- | --- |
| GitHub token revoked | FAIL | active source clean; revocation unconfirmed | credential owner deletes token and records confirmation | yes |
| Firebase project verified | PASS | project `mydesckpro`, ACTIVE | migration operator rechecks | yes |
| Firestore DB ID verified | PASS | resource ends `/databases/default`; `(default)` 404 | pin `default` in signed run manifest | yes |
| IAM approved | FAIL | migration identity Auth-only; proposed identities absent; existing human Owner | security owner approves custom roles and troubleshooter evidence | yes |
| Current Rules baseline | NOT RUN | Rules API 403 | grant read-only rules metadata access and capture current hashes | yes |
| Candidate Rules approved | PASS | local candidate hash and 25/25 + 9/9 + 50/50 tests | reviewer signs hash | yes |
| Indexes ready | FAIL | real project has 0; candidate requires 3 | deploy, wait until every required index READY | yes |
| Functions ready | FAIL | API disabled and billing disabled | enable approved capabilities, create runtime identity, deploy dormant package, smoke test | yes |
| Auth classification | PASS | 10/10, unknown 0, UID mismatch 0 | resolve three operator actions before enablement | yes |
| Auth importer | PASS | dry-run/batching/resume/fail-closed contract | pin signed manifest before production mode | yes |
| Data bulk tool | PASS | streaming writer, checkpoint ledger, retry/backoff, dry-run default | later production dry-run | yes |
| Delta strategy | PASS | 77/77, unknown 0 | validate live schema at T0 | yes |
| Storage migration | FAIL | plan complete; real bucket absent | attach billing, create private bucket, verify Rules | yes |
| Search parity | PASS | 14/14 classified, corpus parity PASS | deploy required server index before route switch | yes |
| Financial reconciliation | PASS | exact delta 0 | rerun after production copy | yes |
| Relationships/events | PASS | 0 mismatch/orphan/event loss | rerun after production copy | yes |
| Arabic / Hebrew / English | PASS | rehearsal suites | repeat smoke test on release build | yes |
| Electron | NOT RUN | App Check packaged proof pending | desktop owner runs packaged proof | yes |
| Maintenance mode | PASS | write guard and localized UI failure | deploy dormant flag, then exercise | yes |
| Rollback | PASS | before/after-write runbook and journal model | rehearse reverse adapter before cutover | yes |
| Observability | PASS | run-scoped metrics schema; secret fields prohibited | connect approved log/metric sink | yes |
| Backend selector | PASS | explicit project/database/release/fallback-off guards | later set one reviewed release value | yes |
| Supabase fallback prevention | PASS | Firestore failure returns failure; test proves one attempt | keep CI guard | yes |

Current actual production decision: **NO_GO**. This does not prevent a read-only controlled migration dry-run; it prevents all production writes and cutover.
