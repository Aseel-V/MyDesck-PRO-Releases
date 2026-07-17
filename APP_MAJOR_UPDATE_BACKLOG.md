# Major update backlog

This file records only work validated or completed in the Phase 1 safe implementation batch. Broader redesign, localization, RTL, accessibility, routing, and architecture work remains out of scope.

| Task | Status | Scope note |
| --- | --- | --- |
| Shared Skeleton light-mode styling | Completed | Updated only `src/components/ui/Skeleton.tsx`. |
| Footer light-mode styling | Completed | Updated only presentational theme classes in `src/components/Footer.tsx`. |
| Duplicate Sonner provider cleanup | Completed | Retained the global provider in `src/App.tsx`; removed redundant subtree providers. |
| Localized accessible labels for icon-only controls | Not started | Requires translation-key and Arabic/Hebrew wording review first. |
| Travel Trips visual foundations and Trips redesign batch | Completed | Travel-only Button, Surface, and StatusBadge foundations migrated into Trips, filters, cards, and trip details without behavior changes. |
| Travel Trips Page V2 refinement | Completed | Preserved the approved Trip cards while compacting the page header and operational summary strip. |
| Travel New/Edit Trip visual refinement | Completed | Form shell, step navigation, details/rooms surfaces, field height, and actions aligned with Travel UI foundations. |
| Travel smart New/Edit Trip workflow | Completed | Service-aware hotel visibility, hotel-name persistence, validation, and ILS-first new-trip UI completed. |
| Travel status, attachments, and payment simplification | Completed | Removed manual status and attachment controls from New/Edit Trip, added safe date-derived normal lifecycle status, and removed visible payment currency switching. |
| Travel Dashboard visual redesign | Completed | Rebuilt the rendered Travel dashboard around attention, upcoming departures, financial position, a secondary trend, recent trips, and compact actions while preserving existing behavior. |
| Travel ILS default and authenticated exchange-rate strip | Completed | New Travel records default to ILS; header rates reuse cached Frankfurter data without changing historical records or calculations. |
| Travel PDF V2 document redesign | Completed | Reworked the generated Travel booking document with service-aware sections, payment detail, localized RTL layout, and multi-page raster flow. |
| Travel Analytics visual refinement | Completed | Tourism Analytics shell aligned to the established Travel hierarchy without altering filters, calculations, charts, or non-Travel branches. |
