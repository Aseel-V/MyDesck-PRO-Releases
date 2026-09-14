# Spark Enterprise quota budget

The inspected database is Firestore Enterprise Native mode with free tier enabled and no linked billing account. The verified free allowance is 1 GiB stored data, 50,000 read units/day, 40,000 write units/day, 50,000 realtime update units/day, and 10 GiB outbound/month. Enterprise charges read work in 4 KiB tranches and write work in 1 KiB tranches, including index work.

The rehearsed corpus contains 1,439 documents; the largest is 4,835 bytes. The deliberately conservative four-times data/index upper bound is 27,830,260 bytes, or 2.592% of 1 GiB. Per-operation estimates below use that largest document for every document, so they are upper bounds rather than invented average usage.

| Workflow | Conservative read units | Conservative write units | Maximum/day from limiting quota |
| --- | ---: | ---: | ---: |
| Login + business load | 4 | 0 | 12,500 |
| Trip list page, 25 results, indexed | 51 | 0 | 980 |
| Trip list, unindexed scan of current 99 trips | 117 | 0 | 427 |
| Typical trip detail | 16 | 0 | 3,125 |
| Create trip + 3 installments | 38 | 52 | 769 |
| Edit trip | 12 | 17 | 2,352 |
| Cash payment | 20 | 32 | 1,250 |
| Installment payment | 26 | 42 | 952 |
| Analytics, current 99 trips | 117 | 0 | 427 |
| Analytics at 250-trip bound | 296 | 0 | 168 |
| Search, current 99-trip bound | 117 | 0 | 427 |
| Archive/restore | 14 | 17 | 2,352 |

The two trip-list indexes remain required for acceptable free-tier usage because that screen is common and an unindexed scan more than doubles the conservative read-unit cost at the present corpus. The installment due-date index is a cost optimization at 37 current rows and is not a hard dry-run gate. It should be reconsidered as the collection grows.

Usage-rate telemetry is unavailable, so no daily customer activity is fabricated. A mixed workload must sum its actual units and remain below the published limits. Quota exhaustion remains a failed server operation: the app does not show financial success and never falls back to Supabase.
