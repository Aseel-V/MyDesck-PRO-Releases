# Spark quota budget

The verified database is Firestore Native **Enterprise** with free tier enabled. The budget therefore uses the inspected database edition: 1 GiB stored data, 50,000 read units/day, 40,000 write units/day, 50,000 realtime update units/day, and 10 GiB outbound/month. Usage-rate telemetry is unavailable, so this report gives measured per-workflow costs and single-workflow break-even limits rather than inventing customer traffic.

The rehearsed corpus contains 1,439 documents. The largest measured document is 4,835 bytes. A conservative four-times index/metadata upper bound is 27,830,260 bytes, about 2.592% of 1 GiB.

| Workflow | Reads | Writes | Maximum/day from limiting daily unit quota |
| --- | ---: | ---: | ---: |
| Login + business load | 2 | 0 | 25,000 |
| Trip list page (25) | 25 | 0 | 2,000 |
| Typical trip detail | 8 | 0 | 6,250 |
| Create trip + 3 installments | 19 | 10 | 2,631 |
| Edit trip | 6 | 3 | 8,333 |
| Cash payment | 10 | 6 | 5,000 |
| Installment payment | 13 | 8 | 3,846 |
| Analytics worst bounded load | 250 | 0 | 200 |
| Search bounded page | 100 | 0 | 500 |
| Archive/restore | 7 | 3 | 7,142 |

Queries use explicit limits. Related histories refuse 500-row unbounded behavior, analytics refuses more than 250 trips, and list/search pages are bounded. The Spark UI does not install an unbounded realtime listener. A mixed daily workload must be monitored by summing its units; the table is not additive headroom.

Quota exhaustion is a failed server operation. The app shows service unavailable/no server confirmation, does not declare a queued financial write final, and never falls back to Supabase. The current corpus fits safely; measured daily user activity must remain below the published unit limits.
