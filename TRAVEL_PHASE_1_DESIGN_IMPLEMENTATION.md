# Travel Phase 1 design implementation proposal

## Goal

Ship a small, revertible visual foundation for the Travel module: page container/header, surface/card, button, field wrapper, and status badge. No database, Supabase, routes, calculations, translations, PDF generation, or non-Travel modules change.

## Exact planned files

Add, subject to a final API review:

- `src/components/travel-ui/TravelPage.tsx`
- `src/components/travel-ui/Button.tsx`
- `src/components/travel-ui/Field.tsx`
- `src/components/travel-ui/Surface.tsx`
- `src/components/travel-ui/StatusBadge.tsx`

Modify only:

- `src/components/trips/Trips.tsx` — migrate page header, primary/secondary actions, error/empty surface, and existing status display.
- `src/components/trips/TripFilters.tsx` — migrate existing controls to the field/button/surface visual APIs.
- `src/components/trips/TripCard.tsx` — migrate card/action/status visual treatment only.
- `src/components/trips/ViewTripModal.tsx` — use surface/status styles and add the verified direction boundary.

Postpone `NewTripForm`, `TourismDashboard`, `Analytics`, `Settings`, `Login`, `PDFExportModal`, `UpdatePaymentForm`, Navbar, and all non-Travel files. This keeps the first batch away from the most behavior-sensitive form and shared analytics branches.

## Migration and test plan

1. Implement static Tailwind-class components with native HTML props; no dependencies.
2. Migrate one screen at a time, preserving callback wiring, queries, text, and DOM form names.
3. Run existing build/typecheck/lint and clearly report the known baseline failures.
4. Add no test framework. If current infrastructure permits, exercise trips filtering, grid/list, create button, view/edit/delete, error retry, archive confirmation, and export entry point manually.
5. Capture the Trips subset from the visual matrix in English/Arabic/Hebrew, light/dark, and 375/768/1024/1440. Screenshot grid, list/table, empty, error, details, and confirmation.

## Rollback and risks

One revert removes the five Travel-only components and four Trips-focused migrations. Main risks are Tailwind class precedence, RTL label wrapping, and accidental interactive-semantic changes. Mitigate by retaining native elements and props, using snapshots/screenshots, and keeping all business hooks untouched.
