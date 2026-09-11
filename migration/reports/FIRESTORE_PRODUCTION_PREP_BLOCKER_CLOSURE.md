# Firestore production-preparation blocker closure

## Recovery

- Starting SHA: `43fe0897d82475172e5714f21d754526f943a5bb`
- Ending SHA: commit containing this report; the exact immutable SHA is reported after commit
- Recovery tag: `recovery/pre-production-prep-blocker-closure-20260911-161337`
- Staged baseline: 213 paths; manifest SHA-256 `6912063bab1918961b2995196017f530ec2e276b607ff6786c745d85b174c201`
- Staged preserved: 212 unrelated paths remain byte-identical. The one authorized exception is `src/commit_log.txt`, where only the exposed credential span was replaced; all other file content is identical to the staged baseline.

## Secret

- Classification: GitHub classic personal access token; high confidence. The value is omitted.
- Active-source presence: 0. Active-index presence: 0. Repository-wide active scanner findings: 0.
- History presence: the original credential was not present in any locally reachable Git ref at discovery. It had existed only in a staged addition. Deleted/unreachable objects and unknown remote-only refs are outside this claim.
- Revocation/rotation: **EXPLICITLY OPERATOR-BLOCKED**. Liveness was not tested and the credential was never used or transmitted. Treat it as compromised.
- Current risk: active source is clean, but the credential owner must confirm deletion before any credential-dependent production step.

Operator sequence: sign in to the owning GitHub account; open **Settings → Developer settings → Personal access tokens → Tokens (classic)**; delete the compromised token; replace only required automation credentials with a least-privilege, expiring secret stored outside the repository; review the security log. GitHub advises revoking or rotating an exposed credential before considering history remediation. [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) and [removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) are the operator references. No history rewrite is warranted by the locally reachable-history evidence; if remote-only exposure is later found, coordinate rotation first, then collaborators, forks, protected branches, open pull requests, and GitHub Support before rewriting.

A permanent scanner now rejects GitHub classic and fine-grained personal access-token shapes without printing their values. Its report contains only redacted fingerprints, and focused regression tests prevent this credential class from returning to active source.

## Search

- Search features: 14
- Firestore-native: 0
- Bounded client filter: 3
- External index required: 10
- Deferred noncritical: 1
- Blocked: 0; unknown: 0
- Arabic, Hebrew, English, mixed/RTL, case variants, exact, prefix, no-result, multi-result, pagination, stable ordering, and tenant isolation: PASS
- Full-corpus search sample: 99 production trip rows, 3 tenants, 12 cases, 0 mismatches, read-only repeatable-read source snapshot, 0 source writes, no PII persisted
- Parity result: every feature has an explicit disposition. The provider-neutral `SearchRepository` supports Firestore exact/prefix search, safe bounded filtering, and a server-side external-index transport for substring/fuzzy semantics. It rejects unbounded client filtering and missing tenant scope. The external service is deliberately not selected or deployed in this milestone; affected routes cannot switch until that production-preparation step is complete.

The command palette has one accepted behavior change: return at most 20 server-indexed, tenant-scoped results instead of loading every trip. No other production-active search behavior is silently downgraded.

## Auth manual review

- Total users: 10
- Transparent: 7
- Reauth: 0
- Reset: 0
- Manual operator action: 3
- Excluded: 0
- Unknown: 0

All ten accounts are conserved and retain identical planned source/Firebase UIDs. The three previous manual-review accounts have one deterministic reason: compatible verified accounts with neither an application profile nor a business linkage. Each must be confirmed as intentional and either linked to the application or explicitly denied application access before enablement. The committed ledger uses UID fingerprints only and contains no email addresses, passwords, or password hashes. No production Firebase account was imported.

## Supabase burn-down

- Previous count: 254 direct runtime calls
- Current count: 254 direct runtime calls
- Production-active: 246
- Legacy/inactive: 0
- Migration-only adapters: 8
- Test-only: 0
- Dead: 0
- Blocked without a path: 0
- Unknown: 0
- Indirect client-import sites: 75

All production-active references have an explicit Firebase destination. Classification is: Firestore 58, Cloud Functions 31, Firebase Auth 11, Firebase Storage 9, Firestore realtime 2, adapter-only 8, and legacy vertical port 135.

The Firestore-native travel runtime has Auth 0, data 0, RPC 0, Storage 0, Realtime 0 direct Supabase dependencies. The presently selected legacy travel production paths still contain 77 explained calls (Auth 1, data 42, RPC 29, Storage 5, Realtime 0); these remain until the controlled selector change and do not represent an unknown dependency. Static enforcement rejects new direct Supabase use in migrated travel and Firestore application areas.

## Regressions

- Firestore migration: RECONCILED; full production-data extraction/import was not repeated because no schema or transform regression occurred
- Finance: 1,447 values; exact unexplained delta 0
- Relationships: 3,047 checked; mismatches 0; migration-created orphans 0
- Events: 953; missing, extra, ordering, and amount mismatches 0
- Rules: 25/25; adversarial controls 9/9; full tenant matrix 50/50
- Transactions: 37/37; concurrency, retry, and idempotency PASS
- Storage: 3/3 objects; 438,670 bytes; missing, unexpected, and SHA-256 mismatches 0; privacy PASS
- Application parity: business, trips, travelers, payments, installments, events, documents, analytics, and pagination remain PASS; full-corpus search strategy is now closed separately
- Harness: 16/16 steps; 164 tests; 480 assertion call sites; 0 failures

## PostgreSQL oracle

Result: PASS on PostgreSQL 17.10; 93 migrations, 120 named checks, 0 failures. The oracle used a local disposable database and did not touch production.

## Production changes

- Supabase customer writes caused by migration tooling: 0
- Firebase customer writes: 0
- Firebase production user imports: 0
- Cutover: NOT STARTED
- Supabase deletion: NOT STARTED
- Cloud SQL: NOT USED

## Decision

**READY FOR CONTROLLED FIRESTORE PRODUCTION MIGRATION PREPARATION**

This authorizes preparation only. Production import, backend switching, user cutover, and Supabase disabling remain outside this milestone. Credential revocation confirmation, the three account actions, deployment of the required external search implementation, and burn-down to zero production-active calls remain mandatory before production cutover.
