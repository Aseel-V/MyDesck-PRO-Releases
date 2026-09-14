# Full-product Firestore parity — scope, evidence and blockers

Date: **2026-09-14**. Branch `codex/firebase-migration`.
Target architecture: **Firebase Auth + Firestore Enterprise Native + Firestore Rules +
React/Electron + Supabase Storage only.**

**Status: `PRODUCT_PARITY_NO_GO`. No vertical has been migrated in this session.**
Production customer state unchanged: 0 writes, 0 Auth imports, 0 cutover.

---

## 1. Active product inventory (Phase 1) — live, read-only

`migration/reports/live-vertical-inventory.json`, produced inside a `READ ONLY`
transaction that was rolled back. `writeAttemptRejected: true` (SQLSTATE 25006) proves the
session could not mutate the source. `writesCaused: 0`.

Live `auth.users`: **10**. Live `public` tables: **77**. Unknown classifications: **0**.

| Vertical | Tenants | Live rows | Files | Supabase DB | RPC | DB realtime | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| tourism | **3** | 1,339 | 63 | 39 | 25 | 0 | ACTIVE_WITH_DATA |
| restaurant | **1** | 94 | 35 | **95** | 8 | 2 | ACTIVE_WITH_DATA |
| supermarket | **1** | 1 | 15 | 9 | 0 | 0 | ACTIVE_WITH_DATA |
| auto_repair | **1** | 2 | 11 | 16 | 1 | 0 | ACTIVE_WITH_DATA |
| car_parts | 0 | 1 | 4 | 4 | 0 | 0 | ACTIVE_EMPTY |
| phone_shop | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY |
| clothes_shop | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY |
| furniture_store | 0 | 0 | 1 | 0 | 0 | 0 | ACTIVE_EMPTY |

Only **four** verticals have a tenant. The other four are code-reachable with no tenant —
`ACTIVE_EMPTY`, not `DEAD`. None may be silently dropped; retiring any of them is an owner
decision, and doing so would remove four of the eight branches from the parity requirement.

`car_parts` has 0 tenants but 1 row in the `car_parts` table: that row belongs to the
`auto_repair` tenant's parts inventory, not to a `car_parts` business.

## 2. Runtime surface, by category (new Storage policy)

Supabase **Storage** is now an intentional, permitted production dependency. Supabase
**database, RPC, Auth and database realtime** are forbidden after cutover. They are counted
separately so neither can hide behind the other.

| Composition root | Files | DB | RPC | Auth | DB realtime | **Storage** | Firestore |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `src/production-main.tsx` (**shipped**) | 199 | **167** | **42** | **12** | **2** | 11 | **0** |
| Firebase root (travel workspace) | 10 | 0 | 0 | 0 | 0 | 0 | 6 |
| **Target** | — | **0** | **0** | **0** | **0** | intentional | present |

**223 forbidden call sites must reach zero.** The 11 Storage calls may remain, but only
behind `StorageRepository`.

Concentration is favourable — the work is not evenly smeared across 199 files:

| File | DB | RPC | Realtime |
| --- | ---: | ---: | ---: |
| `src/hooks/useRestaurant.ts` | **74** | 9 | 2 |
| `src/contexts/AuthContext.tsx` | 5 | 0 | 0 (plus 7 Auth) |
| `src/lib/tripNotifications.ts` | 7 | 0 | 0 |
| `src/lib/tripTemplates.ts` | 7 | 0 | 0 |
| `src/lib/tripWhatsapp.ts` | 6 | 0 | 0 |
| `src/lib/tripQueries.ts` | 0 | 6 | 0 |

One file carries 85 of restaurant's calls. That is a tractable migration unit.

## 3. Blocker A — hybrid Storage auth (architectural, decisive)

Full analysis: `migration/reports/HYBRID_FIREBASE_SUPABASE_STORAGE.md`.
Evidence: `migration/reports/hybrid-storage-auth-probe.json`.

Supabase Storage on this project accepts **HS256 only**. Firebase ID tokens are RS256 and are
rejected at the algorithm header. GoTrue external providers: `["email"]`. Supabase Third-Party
Auth for Firebase is **not enabled**.

Therefore a Firebase-authenticated client **cannot reach private Supabase Storage at all**, and
no secure no-server workaround exists — minting HS256 requires the project JWT secret, which
cannot ship in Electron, and Spark forbids a server to hold it.

Closable by operator configuration (enable Firebase third-party auth on the Supabase project)
plus a client change (`accessToken: () => user.getIdToken()`). Favourable detail: UIDs are
preserved, so the existing `{uid}/…` RLS folder policies keep matching.

**`HYBRID_STORAGE_GO` = NO_GO until the probe reports RS256 accepted and a real end-to-end
proof passes.**

## 4. Blocker B — restaurant staff authentication (per-vertical)

`authenticate_staff` is a `SECURITY DEFINER` Postgres function that reads
`restaurant_staff.password` and verifies it with `crypt()` while bypassing RLS.
`authorize_staff_action` is its authorisation counterpart.

There is no no-server equivalent. Verifying bcrypt client-side would require shipping the
hashes to an attacker-controlled Electron renderer. Firestore Rules cannot verify passwords.

The correct fix is to promote restaurant staff to **first-class Firebase Auth identities**,
with role and tenant membership held in a staff document and enforced by Rules. That is a real
product change: staff need provisioned credentials, and the existing
`pin_code` / `pin_hash` / `password` columns are already marked `REPROVISION_REQUIRED` in the
migration evidence. It needs owner sign-off before restaurant can be migrated.

## 5. Storage is not yet isolated

The new policy requires no generic Supabase client reachable from business code. Today **9 of
11** Storage call sites sit outside `SupabaseStorageRepository`:
`Settings.tsx` (2), `market/AddProductModal.tsx` (2), `ui/FileUpload.tsx` (2),
`lib/tripAttachments.ts` (2), `lib/businessImages.ts` (1).

All import `src/lib/supabase.ts`, which also exposes `.from()`, `.rpc()` and `.auth`.
Required: a dedicated `supabaseStorageClient` used only inside the Storage module, plus a static
import-graph rule failing the build if business code reaches a Supabase DB/RPC/Auth API.
`storageIsolation` = **FAIL**.

## 6. Staged GO

`migration/reports/staged-go.json`. Each stage inherits its predecessors' gates, so a later
stage cannot go green over an earlier regression. Missing evidence is `MISSING`, never PASS.

| Stage | Decision | Detail |
| --- | --- | --- |
| `PRODUCT_PARITY_GO` | **NO_GO** | 22/24 pass; `activeProductParity` FAIL, `storageIsolation` FAIL |
| `HYBRID_STORAGE_GO` | **NO_GO** | `hybridStorageAuth` FAIL, `storageTenantIsolation` NOT_RUN |
| `DRY_RUN_GO` | **NO_GO** | inherits above, plus `iam`, `indexes`, `secret` FAIL, `realClientSmoke` NOT_RUN |
| `BULK_COPY_GO` | **NO_GO** | 2 gates MISSING |
| `CUTOVER_GO` | **NO_GO** | 5 gates MISSING |
| `POST_CUTOVER_HEALTHY` | **NO_GO** | 8 gates MISSING |

## 7. Honest scope assessment

This is not a session-sized task, and reporting it as one would be the most damaging thing this
document could do.

Remaining work to reach `PRODUCT_PARITY_GO`:

- **223 forbidden call sites** across 4 tenant-bearing verticals plus 4 empty ones.
- **35 RPCs** — server-side business logic in Postgres, which must become Firestore transactions
  plus Rules. Several are `SECURITY DEFINER` and security-critical
  (`authenticate_staff`, `authorize_staff_action`, `apply_discount_secure`,
  `void_order_item_secure`, `close_business_day_secure`, `delete_staff_secure`).
- **Restaurant alone**: 19 tables, 8 RPCs, 95 DB calls, 2 realtime subscriptions across 35 files —
  materially larger than its 94 rows suggest, because the feature surface (reservations,
  modifiers, table sessions, waitlist, payments) exists even where rows do not.
- A **Firebase production composition root** containing every active vertical — explicitly not a
  10-file travel-only replacement.
- Rules, malicious-client suites, search, analytics, UI parity and quota per vertical.
- Full-corpus data rehearsal extended to all verticals with 0 unexplained mismatch.

Two blockers gate the architecture itself and should be resolved **before** that work starts,
because both can change the design:

1. Hybrid Storage auth (operator, Supabase project configuration).
2. Restaurant staff identity model (owner decision, product change).

## 8. What was delivered in this session

| Artifact | Purpose |
| --- | --- |
| `tools/live-vertical-inventory.mjs` + evidence | Phase 1 classification from live source, unknown 0, read-only proven |
| `tools/hybrid-storage-auth-probe.mjs` + evidence | Reproducible proof of the Storage auth blocker |
| `tools/active-product-parity.mjs` (rewritten) | Category-separated DB/RPC/Auth/realtime/Storage measurement under the new policy |
| `tools/generate-vertical-docs.mjs` + 8 vertical docs | Grounded per-vertical inventory with a preserved Design block |
| `lib/production-guard.mjs` → `evaluateStagedGo` | Six staged decisions with inheritance |
| `tools/staged-go.mjs` + evidence | Machine-readable staged GO |
| `HYBRID_FIREBASE_SUPABASE_STORAGE.md` | Blocker analysis and the one viable path |

No production mutation. No Rules, IAM, index or Auth change. No customer data touched.

## 9. Recommended order

1. **Operator:** enable Supabase Third-Party Auth for Firebase; re-run the probe until RS256 is
   accepted. Until then the target architecture is unproven.
2. **Owner:** decide the restaurant staff identity model, and whether the four `ACTIVE_EMPTY`
   verticals are retained or retired — retiring them removes half the parity surface.
3. **Engineering:** isolate Storage behind `StorageRepository` with a static guard. This is
   self-contained, valuable regardless of the outcome of 1 and 2, and closes `storageIsolation`.
4. **Engineering:** migrate verticals in ascending difficulty — supermarket (9 calls), auto_repair
   (16), car_parts (4), then restaurant (95 + staff identity redesign), finishing the tourism
   remainder (39 + 25 RPCs) that the travel workspace does not yet cover.
5. Only then: Firebase production composition root, parity re-measurement, and the Phase 15+
   IAM/Rules/index/smoke sequence.
