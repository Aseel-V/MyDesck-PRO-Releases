# Supabase runtime burn-down

Generated inventory: `migration/reports/firestore-runtime-burndown.json`. Scope is exact `supabase.<api>` call sites in production TypeScript/TSX under `src`, excluding tests.

| API | Current calls | Phase 3 state |
| --- | ---: | --- |
| `supabase.from` | 185 | Production source remains; travel and non-travel legacy paths remain |
| `supabase.rpc` | 44 | 1 is behind `SupabaseTripRepository`; remaining legacy paths remain |
| `supabase.storage` | 11 | 2 are behind `SupabaseStorageRepository`; private signature public-URL behavior removed |
| `supabase.channel` | 2 | Active legacy realtime subscriptions remain outside the new travel workspace |
| `supabase.auth` | 12 | 1 is inside the storage adapter; production Auth cutover is deferred |
| **Total** | **254** | **8 adapter-only; 72 travel/settings blockers; 174 deferred non-travel/auth/realtime calls** |

## Classification

- **MIGRATED:** the new `firestore-emulator` travel workspace has zero direct Supabase/Firestore calls and uses domain repositories and `TripService`.
- **ADAPTER_ONLY (8):** legacy access now contained in `SupabaseTripRepository` and `SupabaseStorageRepository`.
- **BLOCKED (72):** production travel/settings/reporting helpers still bind the existing production UI to Supabase. They remain until the emulator implementation is integrated into the complete production screens and the full-data rehearsal passes.
- **DEFERRED (174):** Auth and restaurant, repair, market, vehicle, Realtime, and other out-of-scope verticals.
- **DEAD (0):** no call was declared dead without proof.

The root production selector still defaults to `supabase`. No dual-write path exists. The Phase 3 recount is exactly 254 indexed production call sites: 0 classified `MIGRATED`, 8 `ADAPTER_ONLY`, 72 `BLOCKED`, 174 `DEFERRED`, and 0 `DEAD`.

## Path to zero

1. Replace the 72 travel/settings/reporting blockers with the proved Firestore repositories, Functions, bounded tenant queries, and a production-grade search implementation.
2. Move the 174 Auth, restaurant, repair, market, vehicle and realtime calls behind equivalent Firebase-native ports, with server authorization for privileged writes.
3. Retain the eight Supabase adapters only for comparison and rollback until the controlled observation period ends.
4. Run the runtime inventory after each vertical. A call is marked `DEAD` only with an owning feature decision and reachability evidence.
5. Before cutover, require zero direct production call sites and verify the built bundle has no Supabase endpoint or credential dependency.
6. Remove comparison adapters only after the Supabase read-only rollback window expires in a separately approved milestone.

The current Firestore travel read model passes business, trip, traveler, payment, installment, event, document, analytics and pagination parity across the complete rehearsal corpus. Search remains blocked because the migrated UI filters only the loaded page and cannot reproduce the current SQL/tsvector behavior across all records. This is a production-preparation blocker, not an allowed silent degradation.
