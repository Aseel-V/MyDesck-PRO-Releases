# Full-product Firestore parity

Machine authority: `migration/reports/active-product-parity.json`, and the per-vertical evidence it reads
(`migration/reports/vertical-parity-<vertical>.json`). Both are regenerated on every run and measure the current
tree, so an edit that reintroduces a Supabase call, breaks a suite or outgrows the Rules budget turns them back.

Current result: **PRODUCT_PARITY_GO — 8 of 8 verticals supported, 0 blocking.**

This says the product's verticals are proven on the Firebase composition root. It does **not** authorize a cutover:
`DRY_RUN_GO` remains NO_GO on four gates that are operator actions outside this repository. See
`FIRESTORE_PRODUCTION_GO_CHECKLIST.md`.

## Which root is measured

`src/main.tsx` is a selector. Parity is measured on `src/firebase-main.tsx`, the Firebase production root, by the
TypeScript AST import graph (`migration/firestore/lib/import-graph.mjs`) — not on comments or strings, and not on
the shipped Supabase root, which still reaches 223 files and 205 forbidden call sites. Measuring the wrong root is
how a green report can coexist with a product that runs entirely on Supabase.

| Category in the Firebase root | Count |
| --- | ---: |
| `supabase.from(...)` — database | 0 |
| `supabase.rpc(...)` | 0 |
| `supabase.auth.*` | 0 |
| `supabase.channel(...)` — database realtime | 0 |
| Supabase Edge Functions | 0 |
| Generic Supabase client imports | 0 |
| `src/data/supabase` adapter imports | 0 |
| `supabase.storage.*` behind `StorageRepository` | 7 — intentional, retained |
| Firestore call sites | 12 |

## Per-vertical

Every vertical must be reachable from the Firebase root with zero forbidden call sites **and** carry per-vertical
evidence in which every gate passes.

| Vertical | Classification | Tenants | Rows | Surface files | Forbidden | Evidence |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| tourism | ACTIVE_WITH_DATA | 3 | 1,339 | 66 | 0 | all gates PASS |
| restaurant | ACTIVE_WITH_DATA | 1 | 94 | 28 | 0 | all gates PASS |
| auto_repair | ACTIVE_WITH_DATA | 1 | 2 | 5 | 0 | all gates PASS |
| supermarket | ACTIVE_WITH_DATA | 1 | 1 | 6 | 0 | all gates PASS |
| car_parts | ACTIVE_EMPTY | 0 | 1 | 3 | 0 | all gates PASS |
| phone_shop | ACTIVE_EMPTY | 0 | 0 | 1 | 0 | 4 gates measured not applicable |
| clothes_shop | ACTIVE_EMPTY | 0 | 0 | 1 | 0 | 4 gates measured not applicable |
| furniture_store | ACTIVE_EMPTY | 0 | 0 | 1 | 0 | 4 gates measured not applicable |

## Gates each vertical's evidence must pass

`firebaseRoot`, `generatedSchema`, `suites`, `rulesBudget`, `dataRehearsal`, `uiSmoke`, and the surface
classifications `search`, `analytics`, `rpc`, `realtime`, `edgeFunctions`.

## Verticals with nothing to prove

phone_shop, clothes_shop and furniture_store own no source table, no tenant and no row — measured, in
`migration/reports/live-vertical-inventory.json` — and each renders one "coming soon" dashboard with no data call.
Nothing was migrated for them, because there is nothing to migrate.

Four gates take a stated not-applicable reason for them: `suites`, `rulesBudget`, `dataRehearsal` and `uiSmoke`. A
gate accepts that reason **only** when the live inventory measures the vertical empty. A vertical claiming exemption
while holding tenants, rows or tables fails, and so does one with no inventory entry at all; that was verified by
running the tool against a control vertical which claims all three exemptions and has no measured inventory, whose
`suites`, `dataRehearsal` and `uiSmoke` all returned FAIL. Each exemption is recorded in the evidence file with its
reason and the measurement that honoured it, and the generated vertical documents render such a gate as N/A rather
than as proof.

Their reachability is not exempted: `firebaseRoot` measures each one's single surface file in the Firebase root with
zero forbidden call sites, like any other vertical.

## What parity does not cover

- Production migration. No production customer data has been written; `backendCutover` is NOT_STARTED.
- The four dry-run blockers: migration IAM, the two hard-required composite indexes, the real production client-SDK
  smoke that depends on them, and the GitHub credential revocation confirmation.
- Supabase **Storage**, which is an intentional retained dependency behind `StorageRepository`, counted separately
  so that a retained Storage call is never mistaken for a database dependency.
