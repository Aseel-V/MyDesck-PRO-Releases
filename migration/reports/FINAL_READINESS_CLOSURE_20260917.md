# Final readiness closure run — 2026-09-17

Every number here is a measurement taken during this run. Nothing was carried forward from a previous session's
report without re-measuring it.

## Outcome

`DRY_RUN_GO = NO_GO`. Four blockers were open at the start; **one was closed** (indexes). Three remain, and all
three are blocked on actions this session was not permitted to perform.

| Blocker | Start | Now | Why |
| --- | --- | --- | --- |
| IAM migration writer access | OPEN | **OPEN** | Binding applied; verification needs a grant refused to this session |
| Hard-required indexes not READY | OPEN | **CLOSED** | 3 of 3 created and READY |
| Production client-SDK smoke not run | OPEN | **OPEN** | Depends on deployed Rules; artifact deliberately not fabricated |
| GitHub credential revocation | OPEN | **OPEN** | Requires operator action at GitHub |

## Repository safety

Branch `codex/firebase-migration`. Starting HEAD `57c9de8`. Staged baseline **212 paths**, unchanged throughout;
staged tree object `e9b915a30d3c351d22abe750b061e982ef7cccc3` identical before and after every commit. Recovery tag
`recovery/pre-final-readiness-closure-20260917-140731` plus staged-index snapshot ref
`refs/stagedsnap/pre-final-readiness-closure-20260917-140731`. Every commit used an explicit pathspec; no `git add .`
and no `git commit -a`. `results/security-postgres.json` was not touched — it was already dirty before this session
began and remains as found.

**Correction to the prior report.** The previously recorded staged fingerprint
`72d33bd95e18a91600bbe74bace9d098af6fd5310edcfe492b9d4d10922dec82` could not be reproduced. Thirteen candidate
algorithms were tried (name-only sorted and unsorted, CRLF and backslash variants, name-status, `ls-files -s`,
`write-tree`, raw diff, patch diff, blob-hash concatenations). None produced that value, and no script in the
repository computes it, so the algorithm was never committed and the value is unverifiable. Invariance is instead
proven by the staged tree object above, which anyone can reproduce with `git write-tree`.

## Phase 1 — IAM: applied, unverified

The documented discrepancy was real and is now settled by live evidence rather than by preference.

- `mydesck-firestore-migration@` **did not exist**.
- `mydesck-migration@` held **`roles/firebaseauth.admin` and nothing else** — no Firestore access at all.
- Impersonation of `mydesck-migration@` succeeded, so the 403 on the synthetic read was a true measurement of that
  principal's authority and not an artifact of a missing token.

Granting Firestore authority to `mydesck-migration@` would have created one principal able to both mint or alter
any customer identity (`firebaseauth.users.create`, `.delete`, `.update`, `configs.getHashConfig`,
`configs.getSecret`) and write any tenant's financial data. That is exactly the combination the requirements
forbid, and no documented justification for combining them exists, so it was refused.

Applied to production instead:

1. Created `mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com`.
2. Created custom role `projects/mydesckpro/roles/mydesckFirestoreMigrator` with exactly the eight permissions
   `FIRESTORE_IAM_REQUIREMENTS.md` specifies — narrower than `roles/datastore.user`, which additionally carries
   `allocateIds`, `namespaces.*` and `statistics.*` that the migrator does not need.
3. Bound that role to that principal, **conditioned** to `projects/mydesckpro/databases/default`. The condition is
   present in the live policy.

Excluded: Owner, Editor, Firebase Admin, Project IAM Admin, Billing Admin, Service Account Admin, index
administration, import/export, and every Firebase Auth permission. Index and Rules release authority stay with the
operator identity, so no principal holds both identity-minting and tenant-data-writing authority.

New reviewed-binding approval hash: `347d47b3f694571a4cfd5514bdd457bc1d8dfe86522d49e38d486c5bc5e54c76`. This
**supersedes** `880933c418a8f9d4ce91e7447575238c65828b06d163b503db010e09bdfe9753`, which approved a binding to the
wrong principal and must not be applied.

**Still FAIL.** Verifying the gate requires impersonating the new principal, which needs
`roles/iam.serviceAccountTokenCreator` on that service account. `mydesck-migration@` has exactly that binding for
the operator; the new account's IAM policy is empty. That grant was refused to this session, and Policy
Troubleshooter — the only way to evaluate the binding without impersonation — is disabled on the project. So
`migrationSyntheticRead` is recorded `NOT_RUN` rather than claimed as 200.

## Phase 2 — indexes: CLOSED

`trips(ownerUid,businessId,isDeleted,paymentDate)` is classified **REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE**,
`hardDryRunGate: true`, evidence state `REASONED_FROM_CORPUS`.

Resolved from the real code path. `Dashboard.tsx:148` → `tripQueries.ts:82` → `listDashboardTrips`, and also
`FirestoreTravelRepository.ts:473`. `listDashboardTrips` issues **two parallel range queries** (lines 73–74), one on
`startDate` and one on `paymentDate`, sharing the same tenant and deletion equalities, each bound at
`DASHBOARD_TRIPS_BOUND = 2000`, with no explicit `orderBy` — so the implicit order is the range field then
`__name__`, matching this index exactly. The `startDate` half is already gated; without this spec the `paymentDate`
half is the only unserved one, and its cost scales with the tenant's entire live collection rather than the
requested year.

Not `REQUIRED_FOR_CORRECTNESS` (Enterprise executes it unindexed), not `LEGACY_UNREACHABLE` or `NOT_REQUIRED`
(reachability is proven above), and gated rather than `COST_OPTIMIZATION` because the database is `freeTier: true`
with billing disabled, this is the landing screen's query, and its 2000-document bound is strictly larger than the
25-result page that justified gating its two siblings. Enterprise rejects the Explain API, and a production
cardinality measurement is meaningless while no customer data has been migrated, so the evidence state is honest
about being reasoned rather than measured.

Hard-required went 2 → **3**. All three created one at a time, each polled to READY before the next was created:

| Index | Resource | Created | READY |
| --- | --- | --- | --- |
| `trips(ownerUid,businessId,isDeleted,startDate,__name__)` | `…/trips/indexes/CICAgOjXh4EK` | 11:19:38Z | 11:20:23Z |
| `trips(ownerUid,businessId,isDeleted,status,startDate,__name__)` | `…/trips/indexes/CICAgJiUpoMK` | 11:20:23Z | 11:21:07Z |
| `trips(ownerUid,businessId,isDeleted,paymentDate,__name__)` | `…/trips/indexes/CICAgJiUsZIK` | 11:21:07Z | 11:21:50Z |

`tripInstallments(ownerUid,businessId,status,dueDate)` remains `COST_OPTIMIZATION` and was deliberately **not**
created. Billing stayed disabled throughout.

**Two gate defects were fixed to make this measurable.** `indexShape` compared the configured trailing ascending
`__name__` against the Firestore Admin API listing, which omits it. Every READY index therefore read as `MISSING`,
so the hard-required index gate could never have passed regardless of what production actually held. Normalisation
now drops a trailing ascending `__name__` from both sides only; a descending or non-final `__name__` is a genuinely
different index shape and is preserved. Separately, the plan tool reads live state from the inventory artifact, so a
stale inventory silently reported MISSING; the tool now states that dependency in its own note.

## Phase 3 — Rules: verified, NOT deployed

Plan regenerated from the candidate file by actual hashing.

| | |
| --- | --- |
| Candidate SHA-256 | `ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f` |
| Matches expected candidate | yes — the stale `e77ed17b…` value was not used |
| Currently deployed | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |
| Rollback source | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb`, captured |
| `candidateDeployed` | **false** |

Rules and security regression re-run against the emulator this session — **111 assertions, 0 failures**, baseline
unchanged:

| Suite | Result |
| --- | --- |
| `rules.test.mjs`, `restaurant-staff-rules`, `storage-rules`, `storage-identity` (combined run) | 49/49 |
| `test-firestore-travel` | 13/13 |
| `test-firestore-restaurant` | 12/12 |
| `test-firestore-supermarket` | 10/10 |
| `test-firestore-auto-repair` | 8/8 |
| `test-firestore-car-parts` | 10/10 |
| `test-firestore-schema-validators` | 9/9 |

`environment-readiness.test.mjs` — the suite covering the library changed this run — passes 14/14, including
"IAM writer and deployment identities remain separate" and "index readiness matches exact fields and scope, not the
number of indexes". The dry-run's `ruleAccessBudget` gate is **PASS**, with every workflow inside its per-write and
atomic limits.

**Deployment was refused to this session by the permission classifier.** It is therefore an operator action. No
partial, alternative or worked-around deployment was attempted.

## Phase 4 — production client-SDK smoke: NOT RUN

`migration/reports/firestore-production-client-smoke.json` does not exist and **was deliberately not written**. Its
validator requires `target: PRODUCTION`, the client SDK rather than the Admin SDK, a run id, and all ten categories
passing. Writing that file without genuinely running it would be fabricated security evidence.

It is also correctly ordered behind Phase 3: the smoke must exercise the *deployed candidate* Rules, and the
candidate is not deployed. Running it now would test the superseded ruleset and prove nothing about the one
intended to ship. The gate reads `NOT_RUN` with reason `ARTIFACT_ABSENT`, which is the honest value.

## Phase 5 — GitHub credential: type determined, revocation NOT confirmed

Determined from repository evidence without exposing any value:

- **Credential type: GitHub classic personal access token.** The recorded classification is "GitHub classic personal
  access token syntax", high confidence from provider-specific syntax; liveness was deliberately never tested.
- Location: `src/commit_log.txt` line 29. Redacted SHA-256 prefix `39a987553136`.
- **Active source is clean.** That line now contains a `[REDACTED-COMPROMISED-GITHUB-TOKEN]` placeholder.
- A scan of reachable history for live classic and fine-grained token shapes returned **no matches**.

Source cleanliness is not revocation. The project's own policy is explicit that production migration stops on an
unconfirmed credential revocation, and no confirmation exists anywhere in the repository. This cannot be inferred
from code, and no attempt was made to authenticate with the credential in order to test it.

## Phase 6 — production dry-run

Re-run this session. `decision: NO_GO`, 27 pass / 2 fail / 1 not-run,
`blockers: ["iam","realClientSmoke","secret"]` — `indexes` is no longer among them.

Source proof, compared across two distinct origins (`live-source-inventory.json` measured against
`firestore-full-import.json` reference) rather than against hard-coded constants:

| | Expected | Measured | Delta |
| --- | --- | --- | --- |
| Tables | 77 | 77 | 0 |
| Rows | 1474 | 1474 | 0 |
| Auth users | 10 | 10 | 0 |
| Unknown mappings | — | 0 | — |

`productionWrites: 0`, `productionCustomerWrites: 0`, `productionUserImports: 0`, `backendCutover: NOT_STARTED`,
`billingEnabled: false`, `functionsDeployed: false`, `storageProvisioned: false`.

## Phase 7 — staged GO

All five application gates re-verified GO. Later phases correctly remain NO_GO because no production migration ran.

| Gate | Value |
| --- | --- |
| `HYBRID_STORAGE_AUTH_GO` | GO (5/5) |
| `STORAGE_ISOLATION_GO` | GO (1/1) |
| `SIGNATURE_PRIVACY_GO` | GO (4/4) |
| `RESTAURANT_STAFF_AUTH_MODEL_GO` | GO (4/4) |
| `PRODUCT_PARITY_GO` | GO (37/37) |
| `DRY_RUN_GO` | NO_GO (42/45, 2 fail, 1 not-run) |
| `BULK_COPY_GO` | NO_GO |
| `CUTOVER_GO` | NO_GO |
| `POST_CUTOVER_HEALTHY` | NO_GO |

## Operator actions required

1. **Grant impersonation on the new principal**, then re-run the inspector and require
   `migrationSyntheticRead.http === 200`:

   `gcloud iam service-accounts add-iam-policy-binding mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com --project=mydesckpro --member=user:<operator> --role=roles/iam.serviceAccountTokenCreator`

2. **Deploy the candidate Rules**, then read the source back and require deployed hash == `ec881395…`; on mismatch
   restore `ecf30f94…` immediately and stop:

   `firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.production.json`

3. **Run the production client-SDK smoke** only after 1 and 2, writing the cleanup manifest before creating any
   synthetic resource.

4. **Revoke the GitHub classic PAT** at GitHub → Settings → Developer settings → Personal access tokens → Tokens
   (classic). Record who revoked it and when. Never record the value.
