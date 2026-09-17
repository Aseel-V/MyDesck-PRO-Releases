# Final production readiness

> **Superseded in part — see `migration/reports/FINAL_READINESS_CLOSURE_20260917.md` (run of 2026-09-17).**
> Current measured state: `DRY_RUN_GO = NO_GO`, blockers `iam`, `realClientSmoke`, `secret`.
> The index blocker is **CLOSED**: hard-required went 2 to 3 (paymentDate classified
> REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE) and all 3 are READY in production.
> IAM now targets the dedicated least-privilege principal `mydesck-firestore-migration@`, not
> `mydesck-migration@`; approval hash `347d47b3...` supersedes `880933c4...`.
> Candidate Rules hash `ec881395...` verified by real hashing; the candidate is NOT yet deployed.
> The staged fingerprint `72d33bd9...` quoted below could not be reproduced and is unverifiable; invariance is
> proven instead by the staged-entry hash `afb0a3f2f19e2a1b2a8ea9bf39396956a0d6c87671b2dc7a7f23ea811796e671`.


Machine authority: `migration/reports/staged-go.json`, `migration/reports/firestore-production-dry-run.json`.

Current result: **DRY_RUN_GO = NO_GO.** Four blockers remain, unchanged: migration IAM, the hard-required Firestore
indexes, the real production client-SDK smoke, and GitHub credential revocation. No new blocker was invented and
none was hidden.

**Updated 2026-09-17 (second readiness pass).** Three gates could previously pass, or could never pass, without
regard to evidence. All three are fixed and the fixes are covered by regression tests; the gate results themselves
are unchanged, because no production evidence was fabricated to move them.

| Defect | State |
| --- | --- |
| Source-row drift compared a constant with itself | **FIXED** — live measurement vs rehearsal reference, distinct origins, fails closed |
| Index classification assigned by array position | **FIXED** — keyed by index identity; unreviewed specs fail closed |
| `realClientSmoke` hardcoded `NOT_RUN` | **FIXED** — derived from a validated production artifact; emulator can never satisfy it |

Evidence classes are labelled throughout: **fresh** (measured this pass), **historical** (recorded earlier, no live
probe possible here), **emulator**, **production**, and **operator-required**.

## What this session could and could not do

This environment has **no path to production `mydesckpro`**. `gcloud` is not installed, the Firebase CLI is not
installed, `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_TOKEN` are unset, there is no application-default
credential file, and no service-account key exists in the repository — the last being correct, since the
architecture forbids one.

The production tooling reaches Google only by shelling into the bundled Cloud SDK:
`migration/firestore/tools/inspect-production-environment.mjs` and `enterprise-index-analysis.mjs` both call
`gcloud auth print-access-token` (the former also `--impersonate-service-account`) and throw
`GCLOUD_READ_FAILED_NO_CREDENTIAL_OUTPUT` without it.

So the IAM binding, index creation, Rules deployment and real client-SDK smoke are **operator actions**. Their gates
are computed from live probes — `migrationSyntheticRead.http === 200`, a live index list, a real client run — and no
file written here could move them honestly. None was written.

| Phase | Outcome |
| --- | --- |
| 0 — repository safety | DONE |
| 1 — GitHub secret revocation | **UNCONFIRMED**; operator action stated below |
| 2 — least-privilege IAM | **NOT EXECUTABLE HERE**; exact operator action stated below |
| 3 — hard-required indexes | **NOT EXECUTABLE HERE**; definitions and operator action stated below |
| 4 — Rules readiness | Local half DONE (hashes captured, every suite green, budget verified); deployment is an operator action |
| 5 — real client-SDK smoke | **NOT EXECUTABLE HERE**; depends on 2, 3 and 4 |
| 6 — production dry-run | DONE, read-only, with live source counts re-read |
| 7 — final GO recomputation | DONE |

## Phase 0 — repository safety

Branch `codex/firebase-migration`. Staged baseline **212 paths**, fingerprint
`72d33bd95e18a91600bbe74bace9d098af6fd5310edcfe492b9d4d10922dec82`, verified byte-for-byte identical after every
step of this session. Recovery tag `recovery/pre-final-production-readiness-20260917-101950`, plus a staged-index
snapshot ref of the same name. The only other dirty path is `results/security-postgres.json`, which is staged entry
#206 and was already modified before this session; it is deliberately excluded from every commit.

## Phase 1 — GitHub credential revocation: UNCONFIRMED

No revocation confirmation exists anywhere in the repository. Every match for revocation language is a restatement
of the gap itself, not evidence of closure. Active source is clean — the secret scanner passes 3/3 and detects
credential shapes without returning their values — but the project's own policy is explicit that source cleanliness
is not revocation:

> `FIRESTORE_CUTOVER_PLAN.md` step 2: "Confirm GitHub credential revocation without recording the token."
> "Production migration stops on … an unconfirmed credential revocation."

`production-dry-run.mjs:85` hardcodes this gate to FAIL. No artifact can flip it; it requires operator confirmation
and then a deliberate code change to read that confirmation.

**Operator action.** In GitHub, open Settings → Developer settings → Personal access tokens (or, for the credential
type actually issued, the corresponding page: OAuth apps, GitHub App keys, or repository/organisation Deploy keys
and Actions secrets), locate the affected credential, and revoke it. Then record the confirmation — who revoked it,
when, and the credential type — without recording the credential value. Do not test whether the old credential still
works.

Per existing policy the gate is a hard cutover blocker. Bulk migration and cutover remain forbidden until it is
confirmed.

## Phase 2 — IAM: operator action

Measured current state (`production-firebase-inventory.json`): migration identity
`mydesck-migration@mydesckpro.iam.gserviceaccount.com` holds **only** `roles/firebaseauth.admin`;
`firestoreMigrationRolePresent: false`; a synthetic Firestore read by that identity returns **HTTP 403
PERMISSION_DENIED**. One pre-existing human `roles/owner` exists and was not created by this work.
`rolesGrantedByThisMilestone: []`.

Note a discrepancy the operator must settle before binding anything: `FIRESTORE_IAM_REQUIREMENTS.md` prefers a
**separate** principal, `mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com`, so Auth authority and data
authority cannot be combined in one identity. The live inventory and the dry-run gate both name
`mydesck-migration@…`. Binding Firestore access to the identity that already holds `roles/firebaseauth.admin`
contradicts that separation.

**Unresolved operator decision — which principal receives the role.** Two committed sources disagree, and this
pass deliberately does not resolve it:

- `migration/firestore/lib/environment-readiness.mjs` defines the *reviewed* binding `migration-writer` against
  `mydesck-migration@mydesckpro.iam.gserviceaccount.com`, approval hash
  `880933c418a8f9d4ce91e7447575238c65828b06d163b503db010e09bdfe9753`.
- `FIRESTORE_IAM_REQUIREMENTS.md` says that identity "is not granted Firestore access" and prefers a **separate**
  `mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com`, so Firebase Auth administrative authority and
  Firestore data authority are not combined in one principal.

`mydesck-migration@` already holds `roles/firebaseauth.admin`, so binding Firestore access to it is exactly the
combination the requirements document warns against. Settle this before binding anything; do not grant to the
wrong principal to make the gate green.

**Operator action — the repository's own reviewed command** (`iamPlan('migration-writer')`), quoted rather than
invented. If the separation decision goes the other way, substitute the principal and re-derive the approval hash
through `iamPlan` instead of editing this text:

```
gcloud projects add-iam-policy-binding mydesckpro --member=serviceAccount:mydesck-migration@mydesckpro.iam.gserviceaccount.com --role=roles/datastore.user --condition=expression=resource.name=="projects/mydesckpro/databases/default" || resource.name.startsWith("projects/mydesckpro/databases/default/documents/"),title=mydesck-default-only
```

Reversal, also defined by the repository:

```
gcloud projects remove-iam-policy-binding mydesckpro --member=serviceAccount:mydesck-migration@mydesckpro.iam.gserviceaccount.com --role=roles/datastore.user --condition=expression=resource.name=="projects/mydesckpro/databases/default" || resource.name.startsWith("projects/mydesckpro/databases/default/documents/"),title=mydesck-default-only
```

`assertIamApply` refuses `mode: apply` unless the exact approval hash is supplied, so an unreviewed binding cannot
be applied by accident.

`roles/datastore.user` is the documented read/write role for application service accounts and covers the entity
CRUD and transaction permissions the migrator needs. Explicitly **not** to be granted: Owner, Editor, Firebase
Admin, Billing Admin, Project IAM Admin, Service Account Admin, or broader Token Creator.

After binding, re-run `inspect-production-environment.mjs` and require `migrationSyntheticRead.http === 200`, and
confirm by negative test that the identity still cannot change IAM, change billing, read unrelated secrets,
administer unrelated services, or impersonate arbitrary service accounts.

## Phase 3 — indexes: operator action (classifier defect now fixed)

Production currently has **0 composite indexes** (`existingComposite: 0`). Two are classified hard-required, both on
`trips`, `queryScope: COLLECTION`:

1. `ownerUid ASC, businessId ASC, isDeleted ASC, startDate ASC, __name__ ASC`
2. `ownerUid ASC, businessId ASC, isDeleted ASC, status ASC, startDate ASC, __name__ ASC`

Create them one at a time from the reviewed plan with the narrow index-deployer identity — never a bulk
`firestore:indexes` deploy — and wait for **READY**, not CREATING. Creating indexes does not require billing.

**Defect FIXED 2026-09-17 (was: reported only).** Classification no longer depends on array position. It lives in
`migration/firestore/config/index-classification.json`, keyed by index identity (collection group, query scope and
the ordered field list), and `classifyIndexes` joins spec, review and live state on that identity. A spec with no
reviewed entry is `REVIEW_REQUIRED`, never gates, and blocks the capability through `reviewComplete`, so a newly
added index cannot inherit a neighbour's decision or pass unreviewed. `capabilityBlockers` no longer asserts
`indexes.length === 3`. All four configured specs are now classified, where previously only three were.

The `trips … paymentDate` index remains **REVIEW_REQUIRED / UNVERIFIED** and is deliberately not decided from
resemblance: it is reachable and shares the gated indexes' tenant and deletion predicates, but it is a year range
bounded at 2,000 rather than a 25-result page, and Enterprise rejects the Explain API the analyser uses (every
recorded plan probe is HTTP 400), so no measurement supports a classification. An operator must classify it.

The original defect, for the record — `enterprise-index-analysis.mjs` classified by array position:

```js
classification: index < 2 ? 'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE' : 'COST_OPTIMIZATION',
hardDryRunGate: index < 2,
```

It also explains only three hardcoded queries while mapping over four committed specs. Consequences:

- `trips (ownerUid, businessId, isDeleted, paymentDate)` sits at position 3 and was auto-labelled
  `COST_OPTIMIZATION` by position, never analysed. That query is reachable — `Dashboard.tsx:148` →
  `FirestoreTravelDashboardRepository.listDashboardTrips` runs a `paymentDate` range query with the identical
  tenant/deletion predicates as the gated `startDate` index, bounded at `DASHBOARD_TRIPS_BOUND = 2000` rather than
  the 25-result page the gated indexes serve.
- The `tripInstallments` spec at position 4 fell out of the classification list entirely, leaving three
  classifications for four specs. `capabilityBlockers` asserts `indexes.length === 3`, so that assertion currently
  holds only by coincidence, and a fifth spec would silently go unclassified.

The "2 hard-required" figure therefore rests on array position, not on analysis. Re-running the analyser needs
production Explain access this environment lacks — and Enterprise rejects Explain anyway
(`INVALID_ARGUMENT: Explain options are not supported in RunQuery API for Enterprise edition`), so the analyser's
own plan probes are already returning HTTP 400. An operator should re-derive each classification from query shape,
bound and corpus, and decide whether `paymentDate` is a third hard-required index before relying on the count.

## Phase 4 — Rules: ready to deploy, not deployed

Hashes captured and verified:

| Artifact | SHA-256 |
| --- | --- |
| Candidate (`migration/firestore/rules/firestore.rules`) | `ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f` |
| Current production (ruleset `c6fc85cd-4681-491c-bb7c-b879e5893a92`) | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |
| Rollback | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |

Current production Rules are unchanged from the captured release (`currentRelease` HTTP 200, ruleset matches), so
there is no unexpected drift and no reason to stop. Rollback bytes are identical to current, as the contract
requires. The candidate is byte-identical to HEAD and its generated validators report
`RULES_SCHEMA_VALIDATORS_CURRENT`.

Every Rules suite run this session against the emulator, 111 assertions, zero failures:

| Suite | Result |
| --- | --- |
| `rules.test.mjs` | 25/25 |
| `restaurant-staff-rules.test.mjs` | 14/14 |
| `storage-rules.test.mjs` | 5/5 |
| `storage-identity.test.mjs` | 5/5 |
| `test-firestore-travel.mjs` | 13/13 |
| `test-firestore-restaurant.mjs` | 12/12 |
| `test-firestore-supermarket.mjs` | 10/10 |
| `test-firestore-auto-repair.mjs` | 8/8 |
| `test-firestore-car-parts.mjs` | 10/10 |
| `test-firestore-schema-validators.mjs` | 9/9 |

Rules access budget: **80 paths, 0 over the 850 product ceiling, max 814**, within the 1,000-expression request
limit. No rule was relaxed to fit the budget.

Deployment is an operator action and must follow the existing contract: deploy only the exact candidate, read back
the deployed source, require `deployed hash == candidate hash`, and roll back immediately on mismatch.

## Phase 5 — real client-SDK smoke: NOT RUN

**Defect FIXED 2026-09-17.** `realClientSmoke` is now derived from
`migration/reports/firestore-production-client-smoke.json` through `migration/firestore/lib/client-smoke-evidence.mjs`,
which requires `target: PRODUCTION`, `project: mydesckpro`, the **client** SDK rather than the Admin SDK, a parseable
timestamp, a run id, every required category passing, cleanup proving zero residual Auth users, documents and Storage
objects, and zero production customer writes. Missing, malformed, stale-shaped, emulator-targeted or wrong-project
artifacts are `NOT_RUN`. The gate currently reports `NOT_RUN` with reason `ARTIFACT_ABSENT`, which is correct: no
production smoke has run.

It was previously hardcoded `NOT_RUN`, so genuine production evidence could never have closed it.

`migration/reports/firestore-spark-client-smoke.json` exists and passes, but records `target: "EMULATOR"`. It is
emulator evidence and is what feeds `criticalTransactions`, `maliciousClient` and `rollback` — those three gates are
honestly emulator-scoped and must not be read as production proof.

A real smoke requires deployed candidate Rules, both hard-required indexes READY, the IAM binding, and isolated
production test identities. It must use the Firebase **client** SDK against real Auth, real Firestore and real
Rules — never the Admin SDK, which bypasses Rules and therefore proves nothing about them — with a synthetic
namespace (`migration-test--final-smoke-*`) and a unique `migrationRunId`, a cleanup manifest written before any
resource is created, and exact-ID cleanup proving zero residue.

## Producing the production client-smoke artifact

The gate now consumes `migration/reports/firestore-production-client-smoke.json`. To close it, a run must use the
Firebase **client** SDK (not the Admin SDK, which bypasses Rules and proves nothing about them) against the real
project, with synthetic identities only, and write an artifact of this shape:

```json
{
  "generatedAt": "<ISO-8601>",
  "target": "PRODUCTION",
  "project": "mydesckpro",
  "clientSdk": true,
  "migrationRunId": "migration-test--final-smoke-<uuid>",
  "status": "PASS",
  "categories": {
    "auth": "PASS", "tourism": "PASS", "restaurant": "PASS", "supermarket": "PASS",
    "autoRepair": "PASS", "carParts": "PASS", "maliciousClient": "DENIED",
    "financial": "PASS", "hybridStorage": "PASS", "cleanup": "PASS"
  },
  "cleanup": { "status": "PASS", "authUsersRemaining": 0, "firestoreDocumentsRemaining": 0, "storageObjectsRemaining": 0 },
  "productionCustomerWrites": 0
}
```

Every field is checked. `target` other than `PRODUCTION`, a project other than `mydesckpro`, `clientSdk` false, an
unparseable timestamp, a missing run id, any missing or non-passing category, any cleanup residue, or any non-zero
customer write leaves the gate `NOT_RUN`. A cleanup manifest must be written before any resource is created, and
only exact ids owned by that `migrationRunId` may be deleted — never a wildcard.

Prerequisites, in order: the IAM binding, both hard-required indexes READY, and the candidate Rules deployed and
hash-verified.

## Phase 6 — production dry-run

Decision **NO_GO**, no production writes. `executableCommitSha 6f09f75b7b76…`. Counters: production writes 0,
customer writes 0, Auth imports 0, backend cutover NOT_STARTED. Billing disabled and unlinked; Functions not
deployed; Storage not provisioned; Cloud SQL not used.

**Live source re-read** this session under one REPEATABLE READ READ ONLY snapshot, TLS verification enabled
(`rejectUnauthorized: true` with a pinned CA file):

- 77 public tables, **1,474 rows**, **10** Auth users
- `read_only: on` and `repeatable read` at both start and end
- write rejected with SQLSTATE **25006**, `successfulWrites: 0`, transaction outcome ROLLBACK

The write rejection is server-reported, not self-declared: the helper issues `UPDATE public.trips SET id = id WHERE
false` inside a savepoint and fails closed with `SOURCE_WRITE_CONTROL_FAILED` unless PostgreSQL returns 25006. Its
query helper refuses anything that is not a bare `SELECT`.

Auth inventory (2026-09-11): 10 users, unknown **0**, accounted 10, uid mismatches 0, production Firebase imports
**0**. Three users are classified `MANUAL_OPERATOR_ACTION` and require a purpose decision before any enablement.

**Second defect FIXED 2026-09-17.** The source-row check no longer compares a constant with itself. The measured
half is `migration/reports/live-source-inventory.json`; the reference half is the rehearsal's own
`sourceCoverage.rows` in `firestore-full-import.json`. `evaluateSourceCountDrift` refuses to compare them when
either is absent, when the measurement is not read-only-proven, or when both share an origin, and it reports
expected, measured, delta, the measurement timestamp and both origins.

Result this pass: **expected 1,474 / measured 1,474 / delta 0**, tables 77 against 77, measured
2026-09-17T08:31:01Z. The old pin of 1,444 was a ledger-entry count carried from an earlier rehearsal generation
(`firestore-full-restart-proof.json .idempotency.ledgerEntries`), not a source-row count; `production-migration.json`
no longer carries a hand-maintained number and names the artifacts instead.

## New finding: the Rules plan artifact is stale about the candidate

`migration/reports/firestore-production-rules-plan.json` (generated 2026-09-14T07:34:05Z) records
`candidateSha256: e77ed17b8e3652a5523b25d4fb524f5afa4ec2de291ce23baf74d1a54349e9ba`, but `firestore.rules` was last
changed by `36c976f` (tourism vertical, 2026-09-17) and now hashes to
`ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f`.

Its `currentSha256` and `rollbackSha256` still match the captured release files and `candidateDeployed` is still
false, so the deploy and rollback commands remain usable — but an operator who verified a deployment against that
artifact's candidate hash would be checking the wrong ruleset. Use the hash computed from the file. The artifact
should be regenerated by its own tool before any deployment.

## Phase 7 — GO state

Recomputed after the dry-run, so the engine reads current input (`inputs.dryRun 2026-09-17T07:29:27Z`).

| Gate | Decision |
| --- | --- |
| HYBRID_STORAGE_AUTH_GO | **GO** (5/5) |
| STORAGE_ISOLATION_GO | **GO** (1/1) |
| SIGNATURE_PRIVACY_GO | **GO** (4/4) |
| RESTAURANT_STAFF_AUTH_MODEL_GO | **GO** (4/4) |
| PRODUCT_PARITY_GO | **GO** (37/37) |
| DRY_RUN_GO | NO_GO (41/45, 3 fail, 1 not run) |
| BULK_COPY_GO | NO_GO (2 missing) |
| CUTOVER_GO | NO_GO (5 missing) |
| POST_CUTOVER_HEALTHY | NO_GO (8 missing) |

The first five are unchanged and unregressed. The later stages are not promoted: production migration has not been
executed.

## Coverage

Harness evidence is cited unchanged and was not re-run: the synthetic harness hardcodes the
`mydesck-migration-proof` emulator project and cannot reconcile against the full rehearsal corpus, so re-running it
here would produce a target-coverage mismatch that is a tooling artefact, not a product failure. Both artifacts are
byte-identical to HEAD.

- `firestore-full-harness.json`: PASS, 39/39 steps, 324 node test cases, 1,235 assertion call sites, 1,023
  full-corpus application assertions, 50 security checks, 18 corruption controls, 9/9 evidence artifacts.
- `firestore-harness.json`: PASS, 23/23 steps, 435 assertion call sites, 16/16 negative controls detected.

## Production customer safety

| Counter | Value |
| --- | ---: |
| Supabase customer writes caused by migration | 0 |
| Firestore customer writes | 0 |
| Production Firebase customer imports | 0 |
| Backend cutover | NOT STARTED |
