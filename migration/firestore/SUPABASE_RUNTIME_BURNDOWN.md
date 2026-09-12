# Supabase runtime burn-down for Spark

The whole source tree still contains historical Supabase references. The final Firebase-mode composition root imports ten runtime files and reaches **zero** Supabase imports/calls, zero Storage calls, and zero fallback path. Unknown: **0**.

| Classification | Current disposition |
| --- | --- |
| LEGACY_UNREACHABLE | Existing Supabase production UI and verticals remain intact until cutover; excluded by the Firebase-mode composition root. |
| MIGRATION_ONLY | Extraction, reconciliation and Auth/data migration tooling retained. |
| TEST_ONLY | Compatibility and historical regression fixtures retained. |
| ROLLBACK_ONLY | Supabase adapters and archive access retained through rollback window. |
| REMOVE_NOW | 0 reachable Firebase-mode sites. |
| ACTIVE_BLOCKER | 0 Firebase-mode sites. |

The global lexical scan currently reports 338 Supabase references, a broader count than the earlier 254 runtime-call inventory because it includes imports, tests, tooling, comments and adapters. It is not treated as an active-call count. The machine reachability result in `firebase-spark-runtime-proof.json` is the cutover authority: active Firebase-mode reachable = **0**.

Current production still runs Supabase because backend cutover is not started. During the later cutover, the Spark selector requires `VITE_SUPABASE_FALLBACK_DISABLED=true`; any Firestore failure remains a failure. Supabase deletion is a separate future milestone.
