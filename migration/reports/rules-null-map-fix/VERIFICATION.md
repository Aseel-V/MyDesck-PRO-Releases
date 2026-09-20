# Rules null/map fix — independent verification

Verified 2026-09-17. Every number below was re-measured in this session, not copied from an earlier artifact.

## Verdict

**The candidate is safe to publish.**

> **Superseded by the unused-function pruning pass — see "Iteration 2" at the end of this file.**
> The current candidate is `2f395787ccaa0ba5aecd5f7bf44e40828dcf15cff805d648556ffdbc57f0b70f`,
> which compiles with **0 errors and 0 warnings**. The 11 unused-function warnings described in
> section 5 below are gone, and section 5's "deliberately not removed" reasoning no longer applies:
> the Firebase Console does refuse to publish while they stand, so the generator was fixed.

| | |
| --- | --- |
| Candidate SHA-256 (iteration 1) | `c868d10e0cff341f8d109b9b1758930735174202c587bbbba932636b470b90f0` |
| Previous candidate | `ec88139550b4be4a149b475ed20330702c33a586d8074447c3d569d33307f98f` |
| Currently deployed / rollback | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |
| Compilation | HTTP 200, **0 errors**, 11 warnings |
| Regression | 15 suites, **172/172**, 0 failures (Rules/security subset **112**, baseline 111) |
| Expression budget | **PASS** — 80 paths, **0 over 850**, max **847** |
| Document-access budget | **PASS** — worst perWrite 10/10, worst atomic 12/20, none over |
| Differential semantics | 35 cases both versions, **exactly 1 difference**, a tightening |
| Deployed by this session | **No** |

## 1. What the four critical diagnostics actually were

They were reported against the **previous** candidate `ec881395…`, at lines 1875–1876 and 2032–2033:

```
1875  let part      = d.partId == null ? null : get(scopedPath('parts', d.partId)).data;
1876  let partAfter = d.partId == null ? null : getAfter(scopedPath('parts', d.partId)).data;
2032  let lineBefore = exists(itemPath)      ? get(itemPath).data      : null;
2033  let lineAfter  = existsAfter(itemPath) ? getAfter(itemPath).data : null;
```

The cause is not `get()` returning null implicitly. It is the **explicit `: null` branch of a ternary** being
bound to a name that is later used where a map is required — `part.quantity`, `lineBefore.orderId`,
`lineUnitsAt(lineAfter, …)`. The Rules type checker unions the branch types to `map|null` and rejects the
map-typed use. That is why the message is "Received one of [null]. Expected one of [map]".

Worth recording precisely, because the real compiler classifies all four as **severity WARNING**, not ERROR, and
both candidates compile HTTP 200 with **zero errors**. The Console surfaces them as critical; the API does not.

## 2. How the fix closes it, fail-closed

**Auto repair — `validServicePart` / `validConsumedPart`.** The null-producing bindings are gone. The part branch
now demands the document exists on both sides before anything reads it:

```
d.partId is string && exists(...) && existsAfter(...) && validConsumedPart(serviceId, d)
```

and `validConsumedPart` additionally re-checks `part is map && partAfter is map`. A missing, null or wrong-typed
part now **denies explicitly**, where previously it denied only incidentally by dereferencing null at runtime.
The labor-only branch (`d.partId == null`) is byte-for-byte unchanged.

**Restaurant — `ledgerMoved`.** `null` placeholders became `{}` placeholders with explicit existence flags
(`hadLine`, `hasLine`) gating every access and every contribution to the total.

## 3. Security-relevant differences (complete)

The full textual diff is confined to those two functions; nothing else in 2,876 lines changed. The differential
harness ran 35 cases against **both** rulesets and found **exactly one** behavioural difference:

| Case | previous | candidate |
| --- | --- | --- |
| non-string `partId` with matching document name | **ALLOW (200)** | **DENY (403)** |

That is a hole being closed: a non-string `partId` whose coerced form happened to match a document name
previously passed validation. Nothing moved from DENY to ALLOW. All 35 candidate cases match expectation.

**Financial arithmetic is provably unchanged.** `activeLine(m)` begins `m != null && …`, so `lineUnitsAt(null, ·)`
already returned `0`. The new `(hasLine ? lineUnitsAt(lineAfter, scale) : 0)` computes the identical value; it
states explicitly what the old code obtained via the null guard inside `activeLine`.

**Latent hazard, documented not fixed.** `activeLine({})` is `true`, so the `{}` placeholder is safe *only*
because every use is existence-gated. If a future edit drops a `hadLine`/`hasLine` guard, `lineUnitsAt({}, ·)`
would dereference a missing `priceAtTime` — an evaluation error, which denies, so it fails closed, but it would
present as a confusing denial rather than a clean one. The in-file comment at the binding records this.

## 4. Budget impact — thin margin on one path

Four of 80 paths changed cost. All stay under the 850 product ceiling.

| Path | before | after | Δ | headroom |
| --- | --- | --- | --- | --- |
| auto repair: add a part and labor (service record) — `/repairServices/{serviceId}` create | 814 | **847** | **+33** | **3** |
| restaurant: analytics edit of a closed order (totals) | 781 | 784 | +3 | 66 |
| restaurant: save an open order total (order modal) | 412 | 418 | +6 | 432 |
| restaurant: add an order line (order ledger) | 331 | 328 | −3 | 522 |

The most expensive rule in the entire ruleset is the one this fix modifies, and it now sits **3 expression units**
below the product ceiling (847 of 850; Firestore's hard limit is 1000). It passes, but it has effectively no
margin: adding even one more comparison to the `/repairServices` create path will breach the ceiling. Treat that
path as frozen until it is restructured.

These figures were produced **twice, by two independent full runs** of
`scripts/test-firestore-rules-budget.mjs` against isolated emulator projects, which agree exactly: `decision: PASS`,
80 paths, max 847, 0 over 850, `/repairServices` create 847. The second run reported 10/10 scenarios with 0
failures over 66 minutes. The measurement is empirical (binary search on expression padding against the emulator),
so agreement between independent runs is the available form of corroboration.

## 5. Unused functions — analysed, deliberately not removed

All 11 are genuinely unreachable: each has exactly one mention in the file, its own definition, and Rules has no
dynamic dispatch. They are **warnings only** and do not block publication — compilation returns 0 errors.

They were **not** removed, for three reasons:

1. **They are generated.** `generate-rules-schema.mjs:206` emits `svu_<table>` for every table and `sfInts` inside
   its `HELPERS` block, replacing everything between `SCHEMA-VALIDATORS:BEGIN` and `SCHEMA-VALIDATORS:END`. A hand
   deletion is silently undone by the next regeneration. The durable fix belongs in the generator.
2. **Removing `svu_trips` would create a new warning.** `sv_trips` is referenced exactly once in the whole file —
   from inside `svu_trips` (line 1027). Delete `svu_trips` and `sv_trips` is orphaned in turn.
3. **Removing them would erase the marker on a real gap** (below).

Removing them would also change the candidate hash and invalidate every measurement above, for zero functional
gain, in a hotfix whose purpose is to unblock publication.

## 6. Finding: `trips` has no key-allowlist validation

Surfaced while checking point 5, pre-existing and unrelated to the null/map fix.

`match /trips/{tripId}` (line 2440) enforces ownership, id/userId/ownerUid/businessId pinning, `revision`
monotonicity, soft-delete consistency, operation binding via `tripOperation`, and money via `validTripMoney` — but
it never calls `sv_trips` or `svu_trips`. Compare `packingLists` at line 2479, which does call
`sv_trip_packing_lists(request.resource.data)`.

Consequence: a trip document accepts **arbitrary additional keys**. Tenant isolation, ownership and financial
integrity are not affected. Schema shape on the product's core financial entity is unenforced.

This is why the generated validators should stay: they are the intended enforcement for a gap that should be
closed deliberately, with its own regression run, not deleted to silence a warning. Wiring `svu_trips` in is a
**strengthening** change and must not be bundled into this hotfix — it could reject writes the migration itself
performs, and that needs its own verification pass.

## 7. Evidence

- `compilation.json` — both candidates via `projects.test`, source compilation only, release unchanged
- `regression.json` — 15 suites, 172/172
- `semantic-cases.json` — 35 differential cases per version, `differences` array
- `migration/reports/firestore-rules-budget.json` — 80 paths, max 847
- `migration/reports/firestore-production-rules-plan.json` — regenerated against `c868d10e…`
- `previous-candidate.rules` — `ec881395…`, retained for the differential run

No ruleset was created, no release was updated, and no production data was written.

---

# Iteration 2 — unused-function pruning at the generator

The Firebase Console refuses to publish while `Unused function` warnings stand, so the 11 dead
functions had to go. They are generated, so the fix is in the generator, not in the Rules file.

| | |
| --- | --- |
| **Candidate SHA-256** | `2f395787ccaa0ba5aecd5f7bf44e40828dcf15cff805d648556ffdbc57f0b70f` |
| Supersedes | `c868d10e0cff341f8d109b9b1758930735174202c587bbbba932636b470b90f0` |
| Currently deployed / rollback | `ecf30f940747dcc3c5ba4993093e9a11ac9fc5df7e14b2a1512d2446923d84eb` |
| Compilation | HTTP 200, **0 errors, 0 warnings** |
| Regression | 15 suites, **172/172**, 0 failures; Rules/security subset **112** |
| Budget | **PASS** — 80 paths, **0 over 850**, max **847** (unchanged) |
| Differential vs `c868d10e` | 70 cases, **0 differences** |
| Deployed | **No** |

## The generator change

`generateBlock(schema, outside)` now emits only functions the hand-written Rules can actually reach.
`outside` is the Rules source with the generated block removed and is the only root set; reachability
is transitive and iterated to a fixed point, so an `sv_` kept alive solely by an unreachable `svu_`
is dropped with it, while any validator with a real call site is always kept. `outside` is required,
not defaulted, because defaulting to `''` would silently emit nothing.

Parsing is done on a masked copy of the source with comments and string contents blanked, so a brace
inside a regex literal (`sfDecimal` matches `'-?[0-9]{1,40}'`) cannot break brace counting and a name
mentioned in a comment cannot count as a call site. `--check` reports `RULES_SCHEMA_VALIDATORS_CURRENT`,
so the two harnesses that gate on it still pass, and generation is idempotent.

## Removed from generated output — 12 functions

Wrappers with zero call sites (10):

`svu_repair_order_items`, `svu_restaurant_void_logs`, `svu_restaurant_audit_logs`, `svu_trips`,
`svu_trip_activity_log`, `svu_trip_financial_audit`, `svu_trip_payment_events`,
`svu_trip_installment_events`, `svu_trip_write_requests`, `svu_trip_notification_settings`

Underlying validator removed transitively (1):

`sv_trips` — referenced exactly once in the whole file, from inside `svu_trips`. With the wrapper
gone nothing reached it, so both went. **No other `sv_` was removed**: every other underlying
validator has a real call site in the hand-written Rules. `sv_` went 35 to 34, `svu_` 35 to 25.

Helper with zero call sites (1):

`sfInts` — no table currently has enough integer columns to cross `GROUP_MIN.ints`, so nothing called
it. It is still defined in the generator and returns automatically the moment a validator calls it.

The diff against `c868d10e` is **pure deletion: 0 lines added**, and every deleted range lies inside
the generated block, so the iteration-1 null/map fix (`validServicePart` / `validConsumedPart` and
`ledgerMoved`, all hand-written and outside the block) is untouched and verified present.

## `svu_trips` was not wired into `/trips`

Deliberately out of scope. The missing trips key-allowlist described in section 6 above is a
**strengthening** change that could reject writes the migration itself performs, and it needs its own
verification pass. Removing the dead validators does not create that gap and does not widen it: the
`/trips` rules never called them, so behaviour is identical. The gap remains recorded in section 6.

## Test changes required by the pruning

Two suites asserted on artefacts that pruning legitimately removes, and both were made to key off
reality rather than a hardcoded expectation:

- `scripts/test-firestore-schema-validators.mjs` required `sfInts` to be present in the committed
  block and probed its behaviour from there. It now builds its probe ruleset from the committed block
  **plus the generator's definition of any helper the block does not carry**, so `sfInts` semantics
  stay covered (9/9, coverage not reduced), and it additionally asserts that every *emitted* helper is
  actually called — counted over the whole file, because the reachability roots are the hand-written
  Rules and a helper such as `sfDecimalValue` is called only from there.
- `migration/firestore/tests/rules-null-map.test.mjs` gained `RULES_DIFF_BASELINE`, so the
  differential can be run against any superseded candidate rather than only the original. Its
  per-case `previousAllow` overrides describe the original pre-fix ruleset, so they apply only to the
  default baseline. It also now decides whether a probe needs `validConsumedPart` by inspecting the
  source rather than the slot index, which is what let the `c868d10e` baseline compile at all.

## Differential result

Run with `RULES_DIFF_BASELINE=migration/reports/rules-null-map-fix/baseline-c868d10e.rules`:
70 cases, 35 per version, **`differences: []`**. No DENY to ALLOW, and no change in either direction.
That is the expected result for deleting functions nothing calls, and it is now measured rather than
argued. Saved as `semantic-cases-vs-c868d10e.json`; `semantic-cases.json` still holds the run against
the original `ec881395` candidate, which continues to show its single intended tightening.

## Budget

Identical to iteration 1 — 80 paths, 0 over 850, max **847**, `/repairServices/{serviceId}` create
**847** with **3** units of headroom. Removing uncalled functions costs nothing at evaluation time, so
this is the expected outcome and confirms the pruning changed no evaluated path. That path remains
effectively frozen.

## One caveat on the local emulator

An intermediate regression showed 168/172 with two restaurant failures, which were **emulator
contention** from a budget run executing concurrently: re-running the restaurant suite alone gave
12/12, and the final clean run gave 172/172. Recorded because the transient failure mode looks
alarming and is not a Rules defect. Separately, the local emulator starts in **standard** edition
while production `mydesckpro` is **ENTERPRISE**; that is pre-existing and applies to every local run
in this project, not something this change introduced.
