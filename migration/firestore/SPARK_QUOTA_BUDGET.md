# Spark Enterprise quota budget

The inspected database is Firestore Enterprise Native mode with free tier enabled and no linked billing account. The verified free allowance is 1 GiB stored data, 50,000 read units/day, 40,000 write units/day, 50,000 realtime update units/day, and 10 GiB outbound/month. Enterprise charges read work in 4 KiB tranches and write work in 1 KiB tranches, including index work.

The rehearsed corpus contains 1,439 documents; the largest is 4,835 bytes. The deliberately conservative four-times data/index upper bound is 27,830,260 bytes, or 2.592% of 1 GiB. Per-operation estimates below use that largest document for every document, so they are upper bounds rather than invented average usage.

| Workflow | Conservative read units | Conservative write units | Maximum/day from limiting quota |
| --- | ---: | ---: | ---: |
| Login + business load | 4 | 0 | 12,500 |
| Trip list page, 25 results, indexed | 51 | 0 | 980 |
| Trip list, unindexed scan of current 99 trips | 117 | 0 | 427 |
| Typical trip detail | 16 | 0 | 3,125 |
| Create trip + 3 instalments (26 documents, measured) | 38 | 130 | 307 |
| Edit trip (20 documents, measured) | 12 | 100 | 400 |
| Cash payment (7 documents, measured) | 20 | 35 | 1,142 |
| Instalment payment (9 documents, measured) | 26 | 45 | 888 |
| Analytics, current 99 trips | 117 | 0 | 427 |
| Analytics at 250-trip bound | 296 | 0 | 168 |
| Search, current 99-trip bound | 117 | 0 | 427 |
| Archive/restore | 14 | 17 | 2,352 |

### Trip write sizes are measured, not estimated (2026-09-16)

The trip rows above are counted from the write models, which reproduce the source's statements and its triggers, and
from the adapter that commits them. One `save_trip_transaction` commit writes: 15 documents with no payment plan, 20
with a cash plan, 22 with a one-instalment card plan, 26 with three instalments and 36 with eight. Most of that is
history the source writes too: the audit trigger alone appends one row per audited field (nine on an insert), and the
activity trigger appends its own. The adapter coalesces repeated writes to the same document, so the trip row is
written once per commit rather than once per plan and per instalment.

Write units use the table's own convention — the largest rehearsed document (4,835 bytes) charged for every document,
so five 1 KiB write tranches each. That is an upper bound: an activity or audit row is far smaller than a trip. A
tourism owner saving twenty trips a day with three instalments each stays at roughly 2,600 write units, well inside
the 40,000/day allowance; the limiting figure in the table is the number of such saves per day at the conservative
bound, not a measured usage rate.

The two trip-list indexes remain required for acceptable free-tier usage because that screen is common and an unindexed scan more than doubles the conservative read-unit cost at the present corpus. The installment due-date index is a cost optimization at 37 current rows and is not a hard dry-run gate. It should be reconsidered as the collection grows.

**Classification source (updated 2026-09-17).** These labels are no longer derived from array position. Every
configured index spec carries an explicit reviewed classification in
`migration/firestore/config/index-classification.json`, keyed by index identity, and an unreviewed spec fails the
dry-run index gate closed rather than inheriting a neighbour's label. The `trips (ownerUid, businessId, isDeleted,
paymentDate)` index is recorded as **REVIEW_REQUIRED / UNVERIFIED**: it is reachable from the dashboard and shares
the gated indexes' tenant and deletion predicates, but it is a year range bounded at 2,000 rather than a 25-result
page, so its cost profile does not follow from theirs, and Enterprise rejects the Explain API the analyser uses
(recorded plan probes are HTTP 400). An operator must classify it from a supported measurement before the
hard-required count can be considered final. See `migration/reports/FINAL_PRODUCTION_READINESS.md`.

Usage-rate telemetry is unavailable, so no daily customer activity is fabricated. A mixed workload must sum its actual units and remain below the published limits. Quota exhaustion remains a failed server operation: the app does not show financial success and never falls back to Supabase.
