# Spark transaction security model

The distributed Electron/React client is untrusted. Firebase Auth establishes identity; Firestore Rules establish tenant membership and permitted transitions. The client transaction only expresses intent.

Authoritative money uses signed safe integer minor units with `moneyScale = 2`, plus matching `{currency, units, unitsText, scale}` maps. The current transactional corpus is representable at this scale. Arbitrary decimal-string values remain display/nontransactional migration data. A future transactional currency/value that cannot fit safe scaled integer arithmetic blocks the Spark workflow.

| Operation | Reads | Writes | Rules per-write max | Unique Rules accesses | Limits / headroom |
| --- | ---: | ---: | ---: | ---: | --- |
| Create trip + 3 installments | 19 | 7 | 7 | 7 | 10/write, 20 atomic; +3/+13 |
| Create trip + maximum 8 installments | 29 | 12 | 10 | 12 | at per-write limit; +8 atomic |
| Edit trip | 6 | 3 | 3 | 4 | +7/+16 |
| Payment | 10 | 6 | 5 | 4 | +5/+16 |
| Installment payment | 13 | 8 | 5 | 5 | +5/+15 |
| Archive/restore | 7 | 3 | 5 | 4 | +5/+16 |

The current corpus maximum is three installments. The Spark transaction contract caps new plans at eight so schedule completeness can be proven within Rules access limits. IDs and operation fingerprints are computed before transaction callbacks. Retries read an immutable `sparkOperations/{uid}__{operationId}` record and either return the prior identical result or reject conflicting reuse.

Payments atomically create immutable payment/audit/activity records and update trip/plan/installment summaries. Rules enforce same tenant, actor, currency, scale, revision, exact delta, remaining balance, and immutable event content. Authorized staff may record internal bookkeeping facts; this does not represent card authorization. Fake card processing remains disabled.

Offline financial attempts remain pending/failed until a server-confirmed transaction resolves. The emulator suite covers duplicate clicks, concurrent calls, cross-tenant writes, direct balance overwrite, self-admin, and immutable event editing. Role, root-owner, and suspension changes are operator-only.
