# Firestore full migration rehearsal

Generated: 2026-09-11. This was a read-only production-source extraction into the isolated Firebase Emulator Suite. It was not a production cutover.

## Recovery

- Starting SHA: `7fc7f9969487349ee84d0ea1c68e70ab9edf56ea`
- Ending SHA: the migration-only commit containing this report; exact SHA is reported after commit.
- Recovery tag: `recovery/pre-full-firestore-rehearsal-20260911-133801`
- Staged baseline: 213 unrelated paths; manifest SHA-256 `6912063bab1918961b2995196017f530ec2e276b607ff6786c745d85b174c201`
- Preserved: **YES**, path, index blob, mode and working bytes verified before commit.

## Source snapshot

- Read-only: **YES**
- Isolation level: `REPEATABLE READ READ ONLY`
- Snapshot consistency: one transaction, deterministic PK order, rolled back after extraction
- Negative write test: rejected with SQLSTATE `25006`
- Source writes caused: **0**

## Source coverage

- Base tables: **77**
- Source rows: **1,444**
- Migrated: **1,436**
- Explicitly excluded: **8** `trip_pdf_rate_limits` rows, classified as derived operational state rebuilt by the target
- Unknown: **0**
- Conservation: **1,436 + 8 = 1,444**
- Live constraints inventoried: 152 FKs, 77 auth FKs, 127 policies, 1,089 columns
- Application view disposition: `view_daily_profit_summary` is derived analytics, is not app-referenced, and is not copied as a document.

Credential fields in `restaurant_staff` (`pin_code`, `pin_hash`, `password`) and the empty `restaurant_whatsapp_settings` credential shape are explicitly excluded and require secure reprovisioning. No row was silently removed. The current traveler corpus exposed no passport/ciphertext field; future passport data remains gated on an approved encryption design and is never converted to plaintext.

## Auth inventory

- Users: **10**
- Transparent: **7**
- Reauth: **0**
- Reset required: **0**
- Manual review: **3**
- Unknown: **0**
- Account conservation: **10/10**
- Production Firebase imports: **0**

The readiness inventory preserves source UID, planned Firebase UID and user-document ID without printing hashes or PII. OAuth/phone/MFA, duplicate and orphan characteristics are represented in the private ephemeral inventory and reduced to the counts above in committed evidence.

## Firestore target

- Emulator: **YES**, project `mydesck-migration-proof`
- Documents: **1,439**
- Collection groups represented: **26**
- Schema version: **1**
- Transform version: **1.full.1**
- Real Firestore rehearsal: **NOT RUN**; no customer corpus was written to the real database.
- Streaming: batches of 100 with bounded memory
- Restart/idempotency: interrupted after 200 entities; 199 verified documents reused, one injected failure retried, 0 duplicate paths, 0 failed ledger entries

## Size and index limits

- Largest document: redacted trip path, **4,835 bytes**, `SAFE`
- Near limit: **0**
- Too large: **0**
- Pathological index estimates: **0**
- Maximum estimated index entries: **109**
- Index risks: large arrays, text, JSON and response payloads receive explicit exemptions; final index build remains a deployment gate.

## IDs

- UID mismatches: **0**
- PK/document ID mismatches: **0**
- Undocumented ID regeneration: **0**

## Reconciliation

- Expected / actual documents: **1,439 / 1,439**
- Missing documents: **0**
- Unexpected documents: **0**
- Canonical mismatches: **0**
- Raw target mismatches: **0**
- Relationships checked: **3,047**
- Relationship mismatches: **0**
- Cross-tenant references: **0**
- Migration-created orphans: **0**
- Ledger entries/mismatches: **1,444 / 0**
- Final state: **RECONCILED**

## Financial

- Currencies: EUR, ILS, USD, and explicitly classified `UNSPECIFIED`
- Exact values checked: **1,447**
- Source totals: retained as canonical per-currency digests to avoid putting customer financial totals in Git
- Target totals: exact canonical digests match the source for every currency
- Derived summaries checked/mismatches: **198 / 0**
- Unexplained delta: **EXACTLY 0**
- JavaScript floating point used as authority: **NO**

## Events

- Events/audit records checked: **953**
- Missing: **0**
- Extra: **0**
- Ordering mismatches: **0**
- Amount mismatches: **0**

## Timestamps, JSON and text

- Timestamps compared: **1,784**
- Precision-loss cases: **0**
- Unexplained timestamp mismatches: **0**
- JSON values compared: **2,025**
- SQL NULL / JSON null: **PRESERVED**
- JSON numeric literal: **PRESERVED OR EXACT TEXT-ENCODED**
- JSON mismatches: **0**
- Arabic, Hebrew, English, emoji and existing code points: preserved without normalization.

## Negative full-corpus controls

All **18/18** were caught and the clean target was restored: missing document, extra document, wrong UID, wrong business, broken parent, cross-tenant reference, financial unit +1, wrong scale, large overflow, currency change, missing event, reordered event, timestamp change, SQL NULL/JSON null swap, JSON numeric literal change, derived summary change, audit change, and ledger corruption.

## Security

- Firestore Rules: **25/25 PASS**
- Adversarial Rules controls: **9/9 CAUGHT**
- Full tenant matrix: **50/50 PASS** across 6 businesses and 6 representative users
- Own-tenant access, cross-tenant denial and anonymous denial: **PASS**
- Ownership/business mutation, role escalation, self-unsuspend, financial summary overwrite, audit mutation and server-only access denial: **PASS**
- Rules-as-filters negative query: global query denied; tenant-constrained queries pass
- Server authorization: **PASS for implemented travel operations**; caller, membership, business ownership and input are checked and protected fields are server-derived

## Transactions

- Save-trip transaction tests: **17/17 PASS**
- Payment/installment/state/analytics tests: **20/20 PASS**
- Concurrency: **PASS**
- Retry after `ABORTED`: **PASS**, bounded to five idempotent command attempts
- Repeated idempotency keys: **PASS**
- Duplicate financial events/trips, lost update or incorrect summary: **0**

## Application parity

- Business: **PASS**
- Trips: **PASS**
- Travelers: **PASS**
- Payments: **PASS**
- Installments: **PASS**
- Events: **PASS**
- Documents: **PASS**
- Analytics: **PASS**
- Pagination: **PASS**, 13 pages with stable `__name__` tie-breaker
- Search: **BLOCKED**. The current Firebase workspace filters only a bounded loaded page and cannot reproduce source-wide SQL/tsvector search. A production search model is required.
- Full-corpus application assertions: **1,023**, failures **0** outside the declared search blocker.

## Performance

The 1,439-document emulator corpus produced regression timings of 116.207 ms for a trip page, 23.890 ms for detail plus related data, 98.770 ms for analytics, 118.577 ms for a payment, and 71.368 ms for an installment. Detail uses seven fixed queries with no variable N+1 loop; no unbounded collection scan was observed. The trip summary document is a possible concurrent financial-write hotspot and requires production load validation.

## Storage

- Source objects: **3**
- Manifested/copied: **3 / 3**
- Bytes rehearsed: **438,670**
- Missing/unexpected/SHA-256 mismatch: **0 / 0 / 0**
- Signature privacy: anonymous denied, other tenant denied, same tenant allowed
- Existing source orphan objects: **1**, separately classified and copied under a default-deny archive path
- Migration-created Storage orphans: **0**

## Supabase burn-down

- Runtime references: **254**
- Migrated: **0** indexed direct calls
- Adapter-only: **8**
- Deferred: **174**
- Blocked: **72**
- Dead: **0**

The path to zero is documented in `migration/firestore/SUPABASE_RUNTIME_BURNDOWN.md`. Production still selects Supabase; no dual-write or backend switch was introduced.

## Cutover design

- Delta method: full frozen-snapshot PK/hash comparison, append-only event IDs, and complete re-scan for tables without trustworthy change tracking
- Write freeze: maintenance mode, paused jobs/webhooks/uploads/payment writes, drained queues, database write guard
- Auth sequencing: classified UID-preserving batches before data exposure
- Data sequencing: reference/tenant roots, user/domain documents, events, then rebuilt summaries
- Storage sequencing: complete path/size/SHA manifest and final frozen delta
- Rollback: return configuration to intact Supabase only after accounting for acknowledged Firebase writes; preserve Supabase read-only afterward
- IAM: separate time-bound least-privilege migration, Functions and deployment identities; no Owner, Editor or broad Firebase Admin grants

## Secret

- Status: **SECRET REMEDIATION REQUIRED**
- Suspected file: `src/commit_log.txt`, line 29
- Classification: staged-only GitHub access token, high confidence, not found in reachable local commit history
- Value: **NOT DISPLAYED, NOT USED, NOT TRANSMITTED**
- Required action: owner review, removal/redaction from the staged artifact, and revocation assessment. No history rewrite or credential rotation was performed automatically.

## PostgreSQL oracle

- Result: **PASS** on disposable PostgreSQL 17.10
- Harness: **10/10** steps
- Migrations: **93 attempted, 0 failed**
- Named checks: **120 passed, 0 failed**
- Production source used by oracle: **NO**

## Harness

- Steps: **14/14 PASS**
- Node test cases: **161 PASS**
- Assertion call sites: **455**
- Full-corpus application assertions: **1,023**
- Full-corpus security checks: **50**
- Negative corruptions caught: **18/18**
- Failures: **0**

## Production changes

- Supabase customer writes caused: **0**
- Firebase customer writes: **0**
- Firebase real-customer Auth imports: **0**
- Backend cutover: **NOT STARTED**
- Supabase deletion: **NOT STARTED**
- Cloud SQL: **NOT USED**

## Blocking findings

Production migration preparation remains blocked by unresolved secret remediation, incomplete full-corpus search parity, three auth accounts requiring manual review, secure reprovisioning of excluded restaurant credential fields, and the remaining 254 Supabase runtime references. The existing Storage orphan is explicitly baselined and preserved; it is not migration-created.

BLOCKED — FIX BEFORE PRODUCTION MIGRATION PREPARATION
