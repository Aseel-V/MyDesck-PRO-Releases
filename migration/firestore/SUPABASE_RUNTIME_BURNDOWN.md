# Supabase runtime burn-down

Generated inventory: `migration/reports/firestore-runtime-burndown.json`. Scope is exact `supabase.<api>` call sites in production TypeScript/TSX under `src`, excluding tests.

| API | Current calls | Phase 2 state |
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

The root production selector still defaults to `supabase`. No dual-write path exists. The final target remains zero Supabase runtime calls, but forcing that result before application and full-data parity would create an unsafe cutover.
