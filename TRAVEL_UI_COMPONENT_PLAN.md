# Travel UI component plan

All proposed foundations are visual wrappers over existing behavior; no new dependency is needed.

| Component/API | Variants and accessibility | Theme / RTL | Initial Travel replacements |
| --- | --- | --- | --- |
| `TravelPage({title, description, actions, children})` | Header landmarks; actions remain native buttons/links | Container uses max width and logical padding; title wraps | Dashboard, Trips, Analytics, Settings |
| `Button({variant, size, loading, iconStart, iconEnd})` | primary/secondary/ghost/destructive; sm/md; disables during loading; visible focus | Semantic colors, icon order follows `dir` | Trips header, form/footer buttons, settings actions |
| `IconButton({label, variant, pressed})` | Required accessible label; 40px target; `aria-pressed` when toggle | Mirrored directional glyphs only where meaning changes | Navbar, card/modals, grid/list controls |
| `Field({label, hint, error, required, children})` | Associates label/help/error IDs; preserves existing inputs | Logical alignment and room for long labels | New Trip fields, PDF export, payment form, Login |
| `Input`, `Select`, `Textarea`, `CurrencyInput`, `SearchField` | Default/error/disabled/read-only; 40px minimum | Paired light/dark surface and direction-aware padding | New Trip, filters, payment, export, settings |
| `Surface({level, padding})`, `StatCard`, `SectionHeader` | base/raised/inset; card heading hierarchy | Solid default; limited glass modifier | Dashboard, trip details, settings panels |
| `StatusBadge({status, icon})` | paid/pending/overdue/archived/etc.; text remains visible | Color roles work in both themes | TripCard, Trips table, dashboard alerts, payment form |
| `TravelTable({columns, rows, mobileCard})` | Native table semantics; responsive card fallback; sortable only if existing behavior supports it | Numeric columns logical/end aligned, `dir` at root | Trips table, ViewTripModal item/payment tables |
| `Modal({title, description, footer, children})`, `ConfirmDialog` | Dialog labels, focus/escape/overlay behavior validated | Standard surface/overlay; root `dir` | New/View Trip, PDF, payment, confirmation, status help |
| `StatePanel({kind, title, description, action})`, `Skeleton` | loading/empty/error/success semantics; retry action native | Matching light/dark visual language | Trips error/empty, dashboard loading, command palette |
| `Toast` | No new wrapper required initially; use existing App-level Sonner provider | Configure only after a theme-behavior decision | Preserve current toast calls |

Postpone global component migration, new Tooltip/Drawer primitives, and redesigning shared components that affect non-Travel modules until each need is proven.
