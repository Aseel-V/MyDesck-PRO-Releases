# Compact Exchange Widget and JOD Fix

- Files changed: Dashboard, ExchangeRateStrip, CurrencyService, and this report.
- Rejected full-width strip: removed; the widget is a compact left-corner utility surface.
- JOD finding: the display uses USD-base cross-rates and needs the provider response to include `JOD` explicitly.
- Request and cache: the USD request now asks for `ILS,EUR,JOD`; cache entries missing any displayed rate are incomplete and trigger a fresh fetch rather than suppressing JOD indefinitely.
- Formula: `ILS per JOD = USD→ILS / USD→JOD`, with finite-positive guards.
- Fallback: existing stale cache is retained only when complete and valid; no rate is fabricated.
- Visibility: Tourism operational pages only; Settings and unauthenticated screens are excluded.
- Verification: `git diff --check`, `npm run i18n:check`, typecheck, build, and changed-file ESLint were run successfully before this focused layout/cache correction; re-run before release if additional changes follow.
