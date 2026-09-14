# Supabase runtime burn-down

## Policy (updated 2026-09-14)

Supabase **Storage** is an intentional, permitted production dependency in the final
architecture. Supabase **database, RPC, Auth and database realtime** are not. These are counted
and gated separately so that a retained Storage call is never mistaken for a database
dependency, and a database call can never hide behind "Supabase is allowed now".

| Category | After cutover | Target |
| --- | --- | ---: |
| `supabase.from(...)` — database | **FORBIDDEN** | 0 |
| `supabase.rpc(...)` | **FORBIDDEN** | 0 |
| `supabase.auth.*` | **FORBIDDEN** | 0 |
| `supabase.channel(...)` — database realtime | **FORBIDDEN** | 0 |
| `supabase.storage.*` | **ALLOWED, intentional** | behind `StorageRepository` |

## Two composition roots — measure the right one

`src/main.tsx` is a selector, not an application. It branches on `selectBackend()`:

| Mode | Loads | Files | DB | RPC | Auth | DB realtime | Storage | Firestore |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `supabase` (**default, shipped**) | `src/production-main.tsx` | **201** | **167** | **42** | **13** | **2** | 9 | **0** |
| `firestore` | `src/migration-app/main.tsx` | 10 | 0 | 0 | 0 | 0 | 0 | 6 |

Both rows come from the same import-graph walker in
`migration/firestore/tools/active-product-parity.mjs` → `migration/reports/active-product-parity.json`.

**224 forbidden call sites** (167 + 42 + 13 + 2) must reach zero. The "zero reachable Supabase"
result applies only to the reduced travel root and is not a statement about the shipped product.
All **9** Storage calls are permitted and now sit behind `StorageRepository`; Auth is 13 rather
than 12 only because `storageIdentity` currently reads the Supabase session for the Storage
token, which disappears at cutover.

## Per-vertical burn-down

Live, read-only source inventory (`migration/reports/live-vertical-inventory.json`).

| Vertical | Tenants | Rows | Files | DB | RPC | DB realtime | Classification | Migrated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| tourism | 3 | 1,339 | 63 | 39 | 25 | 0 | ACTIVE_WITH_DATA | Partial — reduced travel workspace only |
| restaurant | 1 | 94 | 35 | 95 | 8 | 2 | ACTIVE_WITH_DATA | **No** |
| supermarket | 1 | 1 | 15 | 9 | 0 | 0 | ACTIVE_WITH_DATA | **No** |
| auto_repair | 1 | 2 | 11 | 16 | 1 | 0 | ACTIVE_WITH_DATA | **No** |
| car_parts | 0 | 1 | 4 | 4 | 0 | 0 | ACTIVE_EMPTY | **No** |
| phone_shop | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY | **No** |
| clothes_shop | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY | **No** |
| furniture_store | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY | **No** |

ACTIVE_WITH_DATA 4 · ACTIVE_EMPTY 4 · LEGACY_REACHABLE 0 · LEGACY_UNREACHABLE 0 · DEAD 0 ·
MIGRATION_ONLY 0 · **unknown 0**.

No vertical is proven unreachable, so none may be dropped without an explicit owner decision.

## Server-side logic still to be replaced

**35 RPCs.** Roughly 25 belong to tourism, 8 to restaurant, 1 to auto_repair, and
`log_business_activity_v2` is shared. These are Postgres functions holding business
invariants; each must become a Firestore transaction plus Rules. `SECURITY DEFINER` functions
needing particular care: `authenticate_staff`, `authorize_staff_action`, `apply_discount_secure`,
`void_order_item_secure`, `close_business_day_secure`, `delete_staff_secure`,
`delete_menu_item_secure`.

## Storage isolation — RESOLVED 2026-09-14

`node migration/firestore/tools/storage-isolation-guard.mjs` → **`STORAGE_ISOLATION_GO`**.

All Storage access now routes through `StorageRepository`. Direct `supabase.storage` calls
outside the allowlist: **0** (was 9). The Storage layer imports no general client and makes no
database, RPC, Auth or realtime call.

| Measure | Before | After |
| --- | ---: | ---: |
| Storage call sites | 11 | 9 |
| Outside the repository | **9** | **0** |
| General client imported by the Storage layer | yes | **no** |

`src/data/supabaseStorageClient.ts` exports only `StorageBackend`; the `SupabaseClient` is never
exported, so business code cannot widen it back into a database client. Identity is injected via
`accessToken` (verified present in supabase-js 2.89.0), so switching from the Supabase session
token to `firebaseUser.getIdToken()` changes nothing else in the Storage layer.

One transitional consequence: `src/data/storageIdentity.ts` reads the Supabase session to supply
that token, which is why the shipped-root Supabase **Auth** count moved 12 → 13. It reverts to 0
when `useFirebaseStorageIdentity` replaces it at cutover.

### Historical state (for reference)

Retaining Storage must not retain a generic Supabase client. **9 of 11** Storage call sites are
outside `SupabaseStorageRepository`:

| File | Storage calls |
| --- | ---: |
| `src/components/Settings.tsx` | 2 |
| `src/components/market/AddProductModal.tsx` | 2 |
| `src/components/ui/FileUpload.tsx` | 2 |
| `src/lib/tripAttachments.ts` | 2 |
| `src/lib/businessImages.ts` | 1 |
| `src/data/SupabaseStorageRepository.ts` *(allowed)* | 2 |

Every one imports `src/lib/supabase.ts`, which also exposes `.from()`, `.rpc()` and `.auth`.
Required: a dedicated `supabaseStorageClient` confined to the Storage module, and a static
import-graph rule that fails if business code can reach a Supabase DB/RPC/Auth API.

## Storage authorisation — HARD BLOCKER

See `migration/reports/HYBRID_FIREBASE_SUPABASE_STORAGE.md`. Supabase Storage accepts **HS256
only**; Firebase ID tokens are RS256 and are rejected at the algorithm header. Third-party
Firebase auth is not enabled on the project. Until an operator enables it, a Firebase-authenticated
client cannot reach private Storage at all, and there is no secure no-server workaround.

## After cutover

Supabase database and Auth become **rollback-only / read-only**. Supabase Storage remains a
live, writable production dependency. "Supabase read-only" must therefore be defined precisely:
it means no application business-table writes, **not** a project-wide freeze — Storage's own
platform-internal bookkeeping must keep working or uploads break. Any Storage metadata that
lives in application business tables must be identified and included in the freeze/delta design.

The Supabase project is **not** scheduled for deletion at any point: Storage remains required.
