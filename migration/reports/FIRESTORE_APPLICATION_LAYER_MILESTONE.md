# FIRESTORE APPLICATION-LAYER MILESTONE

Date: 2026-09-11

Scope: emulator-first Travel application layer. Production remains on Supabase. No production cutover or full customer migration was performed.

## Recovery

- Starting SHA: `66b8597642474d21a866e90b5ea9f9f56ea3df27`
- Ending tested application/tooling SHA: `8be137ebd028fca38948310a5b6e8608002157ab`
- Recovery tag: `recovery/pre-firestore-app-layer-20260911-032118`
- Staged baseline: 213 paths; prior manifest SHA-256 `697fe30be97576ac0c143b5177d69f784d1b9d436ad6f46d0caf34c6a8f2f9b2`
- Staged preserved: **YES**. Index entries and working-tree bytes matched the local baseline before and after every commit.
- Migration commits used explicit pathspecs. `git add .` and `git commit -a` were not used.

## Backend Architecture

- Supabase production backend: **ACTIVE DEFAULT**
- Firestore emulator backend: **PASS**, available only in a dev build, on loopback, with project `mydesck-migration-proof`
- Firestore real backend: **FAIL CLOSED / NOT APPROVED IN PHASE 2**
- Invalid backend mode: **FAIL CLOSED**
- Dual-write production path: **NO**
- Cloud SQL: **NO**

`src/main.tsx` is the composition root. It loads the existing production application for `supabase` and the isolated repository-driven travel workspace for `firestore-emulator`. A production build, non-loopback host, wrong project, unknown mode, or `firestore` mode is rejected before client creation.

## Repository Layer

- Interfaces: Auth, Business, Trip, Traveler, Payment, PaymentPlan, Installment, FinancialEvent, Document, Attachment, Audit, Analytics, and Storage
- Domain service: `TripService`
- Supabase implementations: `SupabaseTripRepository`, `SupabaseStorageRepository`
- Firestore implementation: `FirestoreTravelRepository`
- Direct database calls in the migrated travel UI: **0**
- Direct Firebase Admin usage in renderer: **0**
- Privileged service-account material in renderer/application bundle: **0**
- Unknown `schemaVersion`: rejected

The existing production screens still contain Supabase calls because Supabase remains the source of truth. They are inventoried rather than hidden.

## Travel Read Parity

- Business: **PASS**, one exact business per preserved Firebase UID
- Trip list: **PASS**, tenant-scoped, cursor pagination, status/date/deleted filters
- Trip details: **PASS**
- Travelers: **PASS**
- Payments and plans: **PASS**
- Installments and due-installment query: **PASS**
- Events: **PASS**, identity/timestamp/order preserved
- Documents: **PASS for the corpus**, zero document records present
- Attachment metadata: **PASS for the corpus**, zero attachment records present
- Analytics: **PASS**, bounded server Function with separate currency totals

Developer-only comparison ran from the read-only PostgreSQL synthetic export to Firestore emulator documents. It checked both tenants, four trips, IDs, relationships, multilingual text, exact financial values, timestamps, event order, and analytics: **63 assertions, 0 failures**.

## Travel Write Parity

- Create trip: **PASS** through authenticated Function and Firestore transaction
- Edit trip: **PASS**; an omitted payment plan preserves confirmed payments and installments
- Traveler changes: **PASS**
- Payment: **PASS**; server derives paid/receivable summaries
- Installment payment: **PASS**, including partial-to-paid transition and linkage
- Archive/unarchive: **PASS**
- Delete/restore: **PASS**
- UI server confirmation: **PASS**
- UI offline financial write: **DENIED**, no optimistic success shown

Playwright also proved login, tenant business loading, list/details, search-capable UI, create/edit, a `1.01` payment, archive filtering, exact analytics display, session persistence after reload, logout/login, and multilingual layout. Emulator mutations were discarded before final reconciliation.

## Critical Transactions

- `save_trip_transaction`: **17/17 tests PASS**
- Record payment/installment/state/analytics: **20/20 tests PASS**
- Idempotency: **PASS**; same request replays, changed payload with the same key is rejected
- Concurrency: **PASS**; five duplicate calls create one outcome and simultaneous distinct payments do not lose an update
- Retry safety: deterministic IDs are allocated outside or derived before retry-sensitive writes; no external calls occur inside transactions
- Authorization: UID comes from the verified callable context; caller ownership/balance fields are rejected
- Audit: append-oriented event, activity, financial audit, and idempotency documents are committed with the business mutation

## Exact Finance

- Authoritative JavaScript floating-point money: **NO**
- Storage representation: canonical `unitsText` plus explicit scale; safe-number convenience fields are validated
- Financial values reconciled: 72
- Financial parity: **exact zero delta**
- Currency parity: **PASS for ILS and EUR**
- Summary parity: sales, costs, paid, margin, receivable, plans, and installments **PASS**
- Unexplained financial delta: **0**

## Security Rules

- Rules suite: **25/25 tests PASS**
- Owner/same tenant: **ALLOWED only on intended paths**
- Cross tenant: **DENIED**
- Anonymous: **DENIED**
- `ownerUid` mutation: **DENIED**
- `businessId` mutation: **DENIED**
- Role self-escalation: **DENIED**
- Self-unsuspend: **DENIED**
- Financial overwrite: **DENIED**
- Audit update/delete: **DENIED**
- Server-only collections: **CLIENT DENIED**
- Adversarial insecure-rule controls caught: 9
- Reconciliation corruption controls caught: **16/16**

## Storage

- Repository abstraction: **PASS**
- Private signature public-URL behavior in application code: **REMOVED**
- Raw public/foreign signature references: **HIDDEN**
- Storage Rules: **5/5 tests PASS** on the real emulator
- Same-business signature and attachment: **ALLOWED**
- Cross-tenant and anonymous access/upload: **DENIED**
- Ownership-changing path/content-type attempt: **DENIED**
- Synthetic byte SHA-256 round trip: **MATCH**
- Broad production storage migration: **NOT STARTED**
- Production objects copied: **0**

The source inventory still contains an already-public legacy signature object. Phase 2 stops the application from producing or rendering a public private-signature URL; moving/removing the legacy object remains a production cutover gate.

## Application Parity

- Arabic: **PASS**, `lang=ar`, RTL
- Hebrew: **PASS**, `lang=he`, RTL
- English: **PASS**, `lang=en`, LTR
- Firebase Auth persistence after renderer reload: **PASS**
- Forced token refresh: **PASS**
- Logout/login: **PASS**
- Business/list/details/Functions: **PASS**
- Network failure handling: **PASS**, financial operation remained unconfirmed and unchanged
- Electron-compatible architecture: **PASS**; browser client SDK only, build succeeds, no Admin SDK or service account in renderer
- Printing/PDF: **PASS**, production build and business-image regression suite pass; private signature resolution is authenticated

## Supabase Runtime Burn-down

The syntax-tolerant inventory currently finds:

| API | Calls |
| --- | ---: |
| `supabase.from` | 185 |
| `supabase.rpc` | 44 |
| `supabase.storage` | 11 |
| `supabase.channel` | 2 |
| `supabase.auth` | 12 |
| **Total** | **254** |

- Migrated travel emulator UI direct calls: **0**
- Adapter-only: 8
- Remaining travel/settings blockers: 72
- Deferred non-travel/Auth/Realtime: 174
- Dead without proof: 0

Five production trip mutation flows now enter through `SupabaseTripRepository`, and private signature upload/download enters through `SupabaseStorageRepository`. The complete production UI still uses Supabase by design in this milestone. See `migration/firestore/SUPABASE_RUNTIME_BURNDOWN.md` and `migration/reports/firestore-runtime-burndown.json`.

## Firestore IAM

- Current real-project Firestore access used by this phase: **NONE**
- Minimum IAM plan: **DOCUMENTED** in `migration/firestore/FIRESTORE_IAM_REQUIREMENTS.md`
- Preferred migration identity: separate Firestore migration service account, not the Firebase Auth migration identity
- Broad IAM granted: **NO**
- Owner/Editor/Firebase Admin granted: **NO**
- Real-project Firestore writes: **0**

App Check is evaluated in `migration/firestore/APP_CHECK_PLAN.md`. Web metrics-first enforcement and a separate Electron attestation proof remain production deployment gates. App Check is not treated as authorization.

## PostgreSQL Oracle

- Status: **PASS**
- Runtime: isolated PostgreSQL 17.10 on loopback; stopped after proof
- Workspace: archived starting HEAD, so the oracle measured the unchanged source migration baseline
- Migrations replayed: 93
- Replay outcome: 26 direct PASS, 60 PASS_WITH_SHIM, 7 SKIP_WITH_JUSTIFICATION, 0 FAIL
- Named security/Auth/Firebase assertion checks: 120 passed, 0 failed
- Live schema: 75 public tables, 75/75 with RLS, 113 policies, 169 functions, 75 SECURITY DEFINER functions
- Historical 148-assertion baseline: not reduced; the full oracle command exited 0

## Secret Finding

- Status: **SECRET REMEDIATION REQUIRED**
- File: `src/commit_log.txt`, line 29
- State: staged-only addition; excluded from every migration commit
- Classification: GitHub access token syntax
- Redacted fingerprint prefix: `39a987553136`
- Confidence: high based on provider-specific syntax; liveness was not tested
- Committed historically in locally reachable refs: **NO**
- Token transmitted, used, rotated, deleted, or history rewritten by this work: **NO**

Revocation/rotation and repository remediation remain mandatory before production cutover. No secret value appears in this report.

## Harness

- Previous Firestore baseline: 16/16 steps, 368 assertion call sites, 0 failures
- Current Firestore application harness: **23/23 steps PASS**
- Current assertion call sites: **435** (+67)
- Application parity assertions: **63 PASS**
- Playwright UI scenarios recorded: **14 PASS**
- Test suites in unified harness: 12
- Failures: **0**
- Documents migrated/reconciled: 130/130
- References: 136, orphans 0
- Events: 108, ordering mismatches 0
- UID/ownership/cross-tenant mismatches: 0/0/0
- TypeScript typecheck: **PASS**
- Production build: **PASS**
- Changed-file ESLint: **PASS**
- Business image/security regression suite: **PASS**

## Production Changes

- Existing customer writes: **0**
- Firestore production customer writes: **0**
- Synthetic source writes during this phase: **0**; existing approved corpus was reused
- Production Supabase backend switch: **NOT STARTED**
- Production Auth cutover: **NOT STARTED**
- Storage migration: **NOT STARTED**
- Supabase deletion: **NOT STARTED**
- Cloud SQL/PostgreSQL runtime introduced: **NO**

The next phase may rehearse the complete data migration into an isolated, explicitly approved Firestore namespace/project using the documented IAM identity and the same reconciliation/negative controls. It must not switch application configuration, migrate production Auth, expose private files, delete Supabase, or cut over production.

## DECISION

READY FOR FIRESTORE FULL-MIGRATION REHEARSAL
