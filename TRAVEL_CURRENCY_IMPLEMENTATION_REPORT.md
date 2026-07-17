# Travel Currency Implementation Report

## Safe behavior

Travel now uses ILS as its display target and new-trip default. Existing trip `currency`, source amounts, optional original amounts, and conversion logic are unchanged; legacy USD/EUR/ILS records continue to show their stored currency in trip cards and details.

## Header rates

The Travel-only authenticated header shows USD, EUR, and JOD values per ILS using the existing USD-base Frankfurter response. EUR→ILS and JOD→ILS are derived from the same response; unavailable values show an em dash. The existing context fetches once on initialization, honors its 24-hour local-storage cache, and uses stale cache if offline/API fetch fails. No rate is hardcoded or written to Supabase.

## Files

- `CurrencyContext.tsx`, `schemas.ts`, and `NewTripForm.tsx`: ILS default for Travel/new trip creation.
- `ExchangeRateStrip.tsx` and `Navbar.tsx`: responsive Travel-only informational rates.
- Currency baseline, this report, and backlog.

## Verification and rollback

`git diff --check`, focused ESLint, build, and typecheck passed. Full lint remains at the unchanged baseline of 37 errors and 3 warnings. Code-level RTL uses a local LTR numeric strip; mobile renders it as a separate scrollable secondary row. Roll back the five source files and the currency backlog entry; no stored values or schema changed.
