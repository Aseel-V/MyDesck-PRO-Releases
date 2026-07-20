# Travel Dashboard V2 Baseline

- Scope: presentation-only redesign of `src/components/dashboards/TourismDashboard.tsx`.
- Build: passed, with existing Rollup circular-dependency and chunk-size warnings.
- Typecheck: passed.
- i18n check: passed.
- Lint: existing failure — 37 errors and 3 warnings. `TourismDashboard.tsx:268` has the existing explicit-`any` error; it is out of scope.
- Existing rejected composition: alert banners, then header, a large chart beside isolated KPI cards, then recent activity and shortcut cards.
