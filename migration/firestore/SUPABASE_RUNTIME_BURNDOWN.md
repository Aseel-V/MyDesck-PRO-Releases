# Supabase runtime burn-down for Spark

## Two composition roots — measure the right one

`src/main.tsx` is a selector, not an application. It branches on `selectBackend()`:

| Mode | Loads | Reachable files | Supabase calls | Storage calls | Firestore calls |
| --- | --- | ---: | ---: | ---: | ---: |
| `supabase` (**current default, the shipped product**) | `src/production-main.tsx` | **199** | **297** | **11** | **0** |
| `firestore` / `firestore-emulator` | `src/migration-app/main.tsx` | 10 | **0** | 0 | 6 |

Both rows are produced by the same import-graph walker in
`migration/firestore/tools/active-product-parity.mjs` → `migration/reports/active-product-parity.json`.

**The "zero reachable Supabase" result is true for the Firebase-mode root and is not a
statement about the shipped product.** Quoting it as product-wide readiness is the single
easiest way to authorize a destructive cutover, so the GO engine now carries a separate
`activeProductParity` gate that measures `src/production-main.tsx` directly.

## Active product surfaces

`src/components/Dashboard.tsx` dispatches on `profile.business_type`. Every branch below is
reachable by a logged-in customer today:

| Vertical | Firestore application layer | Production rows in the reconciled corpus | Blocks cutover |
| --- | --- | ---: | --- |
| `tourism` | Reduced travel workspace only | 1,292 | **YES** |
| `restaurant` | **None** | 94 | **YES** |
| `supermarket` | **None** | 1 | **YES** |
| `auto_repair` | **None** | 1 | **YES** |
| `car_parts` | **None** | 1 | **YES** |
| `phone_shop` | **None** | 0 | **YES** |
| `clothes_shop` | **None** | 0 | **YES** |
| `furniture_store` | **None** | 0 | **YES** |

ACTIVE: **8**. LEGACY_UNREACHABLE: 0. MIGRATION_ONLY: 0. ROLLBACK_ONLY: 0. DEAD: 0. Unknown: **0**.
Active verticals supported in Firebase mode: **0 of 8**.

Even `tourism` blocks: the Firebase-mode workspace is a reduced travel surface, not the shipped
tourism dashboard. Verticals with zero rows are still classified ACTIVE because the code path is
reachable and a customer could adopt that business type at any time; absence of rows today is not
proof of disuse.

## Classification of the historical reference count

The global lexical scan reports 338 Supabase references across `src/`. The earlier runtime-call
inventory counted 254. Neither is the cutover authority.

| Classification | Current disposition |
| --- | --- |
| ACTIVE_BLOCKER | **297 reachable calls across 56 files from `src/production-main.tsx`.** Previously reported as 0 by measuring the wrong root. |
| MIGRATION_ONLY | Extraction, reconciliation and Auth/data migration tooling retained. |
| TEST_ONLY | Compatibility and historical regression fixtures retained. |
| ROLLBACK_ONLY | Supabase adapters and archive access retained through the rollback window. |
| LEGACY_UNREACHABLE | **0.** No vertical was shown to be unreachable; all eight dispatch branches are live. |
| REMOVE_NOW | 0 reachable Firebase-mode sites. |

The shipped product also reaches **11 Supabase Storage calls across 6 files**. The Spark
architecture provisions no Storage, so those workflows have no Firebase-mode equivalent.

## What this means for cutover

Switching the selector to `firestore` today would replace a 199-file product with a 10-file
travel workspace. That is silent feature loss for seven verticals plus a reduced eighth, against
live production data. **Backend cutover is blocked on architecture, not on configuration.**

Closing it requires either migrating the remaining verticals to a Firestore application layer, or
an explicit, owner-approved decision to narrow MyDesck's supported product to travel and formally
retire the other business types with a customer-communication and data-retention plan.

Current production still runs Supabase because cutover is not started. During any later cutover the
Spark selector requires `VITE_SUPABASE_FALLBACK_DISABLED=true`; any Firestore failure remains a
failure and never silently writes to Supabase. Supabase deletion remains a separate future task.
