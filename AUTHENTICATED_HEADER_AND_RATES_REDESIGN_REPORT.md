# Authenticated Header and Rates Redesign

## Files changed

- `src/components/Navbar.tsx`
- `src/components/Dashboard.tsx`
- `src/components/travel-ui/ExchangeRateStrip.tsx`

## Structure and visibility

Rates were removed from both desktop and mobile navigation. The Dashboard now renders one informational strip below the header for Tourism operational pages, using the existing internal `currentPage` state; it is hidden on Settings. Login, registration, reset-password, and other unauthenticated screens do not mount Dashboard and therefore do not render the strip.

## Rates and fallback

The existing USD-base cross-rate calculation is retained: `ILS per JOD = USD→ILS / USD→JOD`, after finite positive guards. The shared CurrencyService cache supplies fresh or stale cached rates. The strip displays an unavailable mark only when neither valid live nor cached data exists.

## Presentation and verification

The strip is a compact, responsive, horizontally scrollable informational row with tabular LTR values, updated time, and a subtle stale indicator. It is non-interactive and localized through existing strings.

- `git diff --check`: passed
- `npm run i18n:check`: passed
- `npm run typecheck`: passed
- `npm run build`: passed (existing Rollup warnings only)
- Changed-file ESLint: passed

## Rollback

Revert the three component changes and remove this report. No provider, cache, database, routing, or authentication behavior was changed.
