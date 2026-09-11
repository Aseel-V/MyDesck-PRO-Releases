# Firestore rehearsal scale and cost drivers

This report records usage units from the isolated emulator rehearsal. It does not assign a dollar value because production region, index configuration, listener lifetime, retention and pricing were not approved.

| Measure | Rehearsal result |
| --- | ---: |
| Source base tables | 77 |
| Source rows | 1,444 |
| Firestore documents | 1,439 |
| Collections represented | production-intended mapping from all 77 tables plus derived auth user documents |
| Storage objects / bytes | 3 / 438,670 |
| Largest document | 4,835 bytes |
| Maximum estimated index entries in one document | 109 |
| Documents near/over the size limit | 0 / 0 |

Representative emulator timings and access shape:

| Workflow | Elapsed | Read/write shape |
| --- | ---: | --- |
| Trip list | 116.207 ms | bounded tenant query with pagination cursor |
| Trip detail and related data | 23.890 ms | seven fixed queries; no row-dependent N+1 loop |
| Analytics | 98.770 ms | tenant-bounded corpus computation in rehearsal; production summaries avoid unbounded client scans |
| Bounded search | 38.224 ms | only the loaded bounded set; full search parity remains blocked |
| Create trip | 87.309 ms | transaction plus server-derived state |
| Record payment | 118.577 ms | transaction, immutable event, summary and idempotency record |
| Record installment | 71.368 ms | transaction, event, installment and summary writes |
| Archive and restore | 135.480 ms | two idempotent state transitions |

Likely cost drivers are paginated trip reads, related-document fan-out on detail screens, analytics rebuilds, immutable activity/financial events, transaction retries, composite indexes, Storage egress, and realtime listener duration. The current production source contains two indexed Supabase realtime call sites; Firebase listener counts must be measured after those features are ported. The trip document is the main contention point for serial financial summary updates, so production preparation must load-test concurrent payment traffic and consider sharded or event-derived summaries if observed contention exceeds the retry budget.

Large arrays, text, JSON payloads and response bodies that are not queried have explicit single-field index exemptions in `rules/firestore.indexes.json`. The corpus audit found no pathological index-entry estimate, but production deployment must validate generated index counts with the final Firebase index build.
