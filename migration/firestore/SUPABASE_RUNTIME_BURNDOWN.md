# Supabase runtime burn-down

Generated inventory: `migration/reports/firestore-runtime-burndown.json`. The inventory scans production TypeScript/TSX in `src`, counts direct `supabase.from`, `rpc`, `storage`, `channel`, and `auth` calls, and records indirect client imports separately.

| API | Current calls | Firebase destination |
| --- | ---: | --- |
| `supabase.from` | 185 | Firestore repository or vertical Firebase port |
| `supabase.rpc` | 44 | authorized Cloud Function |
| `supabase.storage` | 11 | Firebase Storage repository |
| `supabase.channel` | 2 | Firestore realtime listener |
| `supabase.auth` | 12 | Firebase Authentication |
| **Total** | **254** | **0 unknown; 0 blocked without a path** |

## Current classification

| Classification | Calls |
| --- | ---: |
| `MIGRATED_TO_FIRESTORE` | 58 |
| `MIGRATED_TO_FUNCTION` | 31 |
| `FIREBASE_AUTH` | 11 |
| `FIREBASE_STORAGE` | 9 |
| `FIRESTORE_REALTIME` | 2 |
| `ADAPTER_ONLY` | 8 |
| `LEGACY_VERTICAL` | 135 |
| `DEAD_CODE` | 0 |
| `BLOCKED` | 0 |

The 254 call sites consist of 246 production-active calls and eight migration-only adapter calls. There are 75 direct Supabase-client import sites. Each entry in the machine report has a lifecycle and a concrete `pathToZero`; no entry is `UNKNOWN`.

## Travel readiness

The Firestore-native travel runtime has zero direct Supabase dependencies: Auth 0, data 0, RPC 0, Storage 0, Realtime 0. The static application-boundary test prevents new direct Supabase imports or calls in migrated travel UI, services, repositories, and Firestore migration modules.

The currently selected legacy production travel routes still contain 77 explained calls: Auth 1, data 42, RPC 29, Storage 5, Realtime 0. They remain on Supabase because production configuration has not switched. Their destination is already classified, and they must be removed from the production bundle when the selector changes. They are a cutover execution gate, not an unexplained dependency.

## Path to zero

1. Route the travel UI to the proven Firestore repositories, Firebase Auth, Firebase Storage, Cloud Functions, and the search abstraction during the controlled production-preparation phase.
2. Port restaurant, repair, market, vehicle, admin, fiscal, and other active legacy verticals to their recorded Firebase destinations.
3. Keep the eight Supabase adapters only for comparison and rollback outside the Firebase-native application runtime.
4. Re-run the inventory after every vertical. Before cutover, require zero production-active direct Supabase calls and verify that the built bundle contains no Supabase endpoint or credential dependency.
5. Remove comparison adapters only after the separately approved Supabase read-only rollback window.

The current root selector still points to Supabase. No dual-write path was added, no production configuration was switched, and no production customer data was written.

## Post-cutover fate

| Fate | Calls |
| --- | ---: |
| `REMOVED_BEFORE_CUTOVER` | 111 |
| `UNREACHABLE_AFTER_SELECTOR` | 135 |
| `ROLLBACK_ONLY` | 8 |
| `MIGRATION_ONLY` | 0 |
| `TEST_ONLY` | 0 |
| `LEGACY_VERTICAL` without selector isolation | 0 |
| `BLOCKED` / unexplained | 0 |

The production composition root dynamically loads `production-main` only in Supabase mode and loads the Firebase-native travel bundle only in Firestore mode. The static guard verifies the Firestore production bundle has zero direct Supabase calls and requires `VITE_SUPABASE_FALLBACK_DISABLED=true`. Expected production-active Supabase references reachable after the reviewed selector switch: **0**. Current production remains on Supabase, so this is a prepared reachability result rather than an executed cutover.
