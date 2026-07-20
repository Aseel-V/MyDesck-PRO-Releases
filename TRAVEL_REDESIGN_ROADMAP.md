# Travel redesign roadmap

| Step | Files / dependencies | Impact and risk | Validation / independent shipment |
| --- | --- | --- | --- |
| 1. Travel layout | Add Travel-only foundation styles/components; `Dashboard`, `Footer` | Shared page rhythm; medium visual risk | Light/dark shell screenshots; yes |
| 2. Navigation | `Navbar`, `CommandPalette` | All Travel navigation; medium interaction/RTL risk | keyboard, mobile drawer, RTL screenshots; yes |
| 3. Page headers | Dashboard, Trips, Analytics, Settings | Better hierarchy; low | 4 viewport screenshots; yes |
| 4. Controls/surfaces | New Travel UI foundations; first consumers Trips and modals | Cross-screen consistency; medium | focus, disabled, long-text, theme tests; yes |
| 5. Dashboard | `TourismDashboard` only | High-traffic overview; medium | loading/data/empty/error if available; yes |
| 6. Trips list | `Trips`, `TripFilters`, `TripCard` | Core operations; medium | filters, grid/list, table/mobile-card, export smoke; yes |
| 7. New/edit form | `NewTripForm`, `FileUpload` visual use | Highest regression sensitivity; high | validation, draft, attachment, create/edit smoke; yes, incremental |
| 8. Trip details | `ViewTripModal`, confirmation | Detail readability; medium | archive/attachment/RTL table smoke; yes |
| 9. Cars | No Travel implementation currently | Out of Travel scope; requires product decision | N/A | no |
| 10. Analytics | Travel rendering path and analytics child components | Dense charts/data; high shared-component risk | filter/currency/chart/RTL screenshots; yes after branch isolation |
| 11. Settings | `Settings` Travel tabs only | Persistent data entry; high | save/error/upload smoke; yes, tab-by-tab |
| 12. Login | `Login`, `ForgotPassword` | Entry experience; medium auth risk | sign-in error/loading/reset and RTL screenshots; yes |
| 13. Final polish | Components changed above | Visual consistency; medium | full matrix and Electron smoke; no separate feature |
