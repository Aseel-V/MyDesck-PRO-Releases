# Business Areas Upgrade Map

## App overview

MyDesck PRO is a multi-business Electron desktop app with a shared React dashboard shell and business-specific modules selected by `business_type`. The codebase currently mixes:

- Production-like modules with real data flows and user actions.
- Mid-maturity modules that are functional but still inconsistent.
- Placeholder modules that are present in navigation but not yet true products.

Core technical patterns seen across the app:

- Desktop shell: Electron + Vite.
- Frontend: React, Tailwind CSS, Framer Motion.
- Data/state: Supabase, React Query, local component state.
- Forms: React Hook Form + Zod in some modules.
- Storage: Supabase tables, Supabase storage, and local browser persistence for a few UX helpers.
- Navigation: dashboard page state and modal-driven flows more than route-per-screen navigation.

## Business areas and priority view

| Area | Current state | Priority | Why |
| --- | --- | --- | --- |
| Trips / tourism | Mature core module | High | Real workflow, real data, already actively used |
| Dashboard / home summaries | Functional shared shell | High | First impression and cross-module orientation |
| Settings / profile / branding | Functional cross-app module | High | Controls identity, language, currency, and account safety |
| Analytics | Functional but uneven by business type | Medium | Useful, but trust depends on data clarity |
| Auto repair jobs | Working module | Medium | Real CRUD workflow with repair orders |
| Auto parts inventory | Working but rough module | Medium | Real inventory value, but UX consistency is weaker |
| Restaurant operations | Large advanced module | High if this business type is active | High complexity and many operational touchpoints |
| Market / supermarket POS | Working advanced workflow | High if in active use | Speed-sensitive and operationally critical |
| Admin | Functional internal module | Medium | Important for platform control, less urgent than user-facing flows |
| Phone shop / car parts dashboard / clothes shop / furniture store | Placeholder modules | Low for polish, strategic for roadmap | Not ready for broad UX investment yet |

## 1. Trips / tourism

### How it works

The trip area is the most mature customer workflow. It lives mainly inside:

- `src/components/trips/Trips.tsx`
- `src/components/trips/NewTripForm.tsx`
- `src/components/trips/ViewTripModal.tsx`
- `src/components/trips/TripCard.tsx`
- `src/components/trips/TripFilters.tsx`
- `src/hooks/useTripMutations.ts`
- `src/lib/tripStatus.ts`

Users create, search, filter, view, edit, archive, export, and delete trips. Trip records depend on Supabase trip data, optional attachments, traveler details, payment fields, and local draft/preset persistence.

### User actions

- Create a trip
- Edit trip details
- View trip details
- Upload and open attachments
- Filter and search trips
- Archive, export, and delete trips

### Strengths

- Clear main workflow
- Strong enough data model for operational use
- Good modal-driven speed for experienced users
- Export and attachment support already exist

### Weaknesses and risks

- Translation coverage is incomplete for newer UX copy
- Search is client-side over the currently fetched year, so it is not a full cross-history search
- Modal focus and compact-height behavior still need live desktop QA
- Detail sections still depend on uneven data completeness

### Suggested future upgrades

- Trip templates / duplicate trip
- Lightweight readiness checklist
- Better per-trip history or last-updated summary
- Better attachment organization and labels

### Priority

Upgrade soon. This is already a real product surface with visible user value.

## 2. Dashboard / shared home summaries

### How it works

The shared shell is centered in `src/components/Dashboard.tsx`. It decides which business module to load, owns shared modals in the trip flow, and provides quick stats, shortcuts, alerts, and recent activity for some business types.

### Data dependencies

- `user_profiles`
- `business_profiles`
- `trips`
- business-type-specific module hooks and queries

### User actions

- Navigate between main pages
- Open trips, analytics, settings, admin
- Review top-level stats and alerts

### Strengths

- One shell for multiple business types
- Lazy loading helps performance
- Shared quick-action pattern is useful

### Weaknesses and risks

- Shared shell quality is uneven across business types
- Home experience is strong for tourism, but much thinner for placeholder modules
- Some recent-trip/status UI in the shell still uses raw status text rather than full display mapping

### Suggested future upgrades

- Stronger per-business home summaries
- Better consistency in quick actions and empty states across business types
- Safer deep-link or state-restoration behavior after app restart

### Priority

Upgrade soon, but keep changes incremental. The shell should support modules better, not absorb all module logic.

## 3. Settings / profile / branding / security

### How it works

`src/components/Settings.tsx` handles:

- User profile fields
- Business profile fields
- Branding assets such as logo/signature
- Theme, language, currency
- Password change
- Rate refresh
- Data import/export tabs
- Restaurant-specific settings entry

### Data dependencies

- `user_profiles`
- `business_profiles`
- Supabase auth
- uploaded branding assets
- currency service cache

### User actions

- Update profile
- Update business identity
- Upload branding assets
- Change password
- Refresh profile and exchange rates

### Strengths

- Centralized settings surface
- Real account/business value
- Important app identity controls already exist

### Weaknesses and risks

- UX density is high
- Several destructive or sensitive settings still rely on browser-native confirmation
- Mixed inline messages and notices reduce consistency
- Data import/export safety should be reviewed carefully before more power is added

### Suggested future upgrades

- Cleaner tab explanations and helper text
- Stronger confirmation patterns for destructive/reset actions
- Better import/export guardrails and restore warnings
- Explicit sync state for uploaded branding assets

### Priority

Upgrade soon. This area affects trust, account safety, and business identity.

## 4. Analytics

### How it works

The main analytics surface is `src/components/analytics/Analytics.tsx`, with specialized pieces such as restaurant analytics and market sales analytics. The module computes reporting from trips and admin/business profile data and changes behavior by user role and business type.

### Data dependencies

- `trips`
- `user_profiles`
- `business_profiles`
- restaurant and market-specific operational tables through their own modules
- currency conversion service

### User actions

- Review revenue, profit, traveler, and destination trends
- Filter by year
- Jump from analytics back into trips with prefilled filters

### Strengths

- Real business value
- Good visual density for power users
- Cross-link back into the trip workflow is useful

### Weaknesses and risks

- Financial trust depends on currency/date assumptions that are not always obvious to users
- Build warnings show chunk/circular-dependency pressure around charting
- Analytics UX differs by business type and may not feel like one coherent product

### Suggested future upgrades

- Clearer chart subtitles explaining calculation basis
- Better empty/error states for analytics with no data
- Module-level performance pass on chart imports and chunking

### Priority

Medium. Improve clarity and trust first, then add more metrics.

## 5. Auto repair jobs

### How it works

The auto repair workflow centers on:

- `src/components/cars/Cars.tsx`
- `src/components/cars/CarCard.tsx`
- `src/components/cars/NewCarForm.tsx`
- `src/components/cars/CarDetailsModal.tsx`

It uses repair orders with related vehicles and repair items. The user can browse jobs, search by plate/model/customer, create a new repair job, inspect details, and delete/update records.

### Data dependencies

- `repair_orders`
- `customer_vehicles`
- `repair_order_items`

### User actions

- Create repair orders
- Search and review jobs
- Open and update order details
- Delete orders

### Strengths

- Real working CRUD flow
- Understandable list/grid presentation
- Good fit for a desktop business workflow

### Weaknesses and risks

- Empty states and search guidance are much weaker than the trip module
- Some update flows close modals instead of reassuring the user with clear success state
- The module contributes to repo-wide lint debt

### Suggested future upgrades

- Better repair status explanations
- Stronger empty/error/success states
- Safer delete confirmation and unsaved-change protection if not already complete in all forms

### Priority

Medium-high if auto repair is an active customer segment.

## 6. Auto parts inventory

### How it works

`src/components/parts/CarPartsInventory.tsx` manages parts inventory, stock filters, pricing, and add/edit/delete flows through a dedicated modal.

### Data dependencies

- `car_parts`
- business profile id

### User actions

- Add a part
- Edit a part
- Delete a part
- Search by part metadata
- Filter by stock level

### Strengths

- Practical inventory summary
- Useful filter categories
- Clear value metrics for small inventories

### Weaknesses and risks

- Current code still contains temporary typing workarounds
- Some UI strings and empty-state logic are rough
- Dynamic Tailwind class construction may be fragile for styling consistency

### Suggested future upgrades

- Better typed data layer
- More precise empty-state messaging
- Stronger low-stock workflows and warnings

### Priority

Medium. Stabilize the code quality before expanding features.

## 7. Restaurant operations

### How it works

Restaurant behavior is split across several advanced components:

- `src/components/dashboards/RestaurantDashboard.tsx`
- `src/components/restaurant/RestaurantModeRouter.tsx`
- `src/components/restaurant/RestaurantDashboardV2.tsx`
- `src/components/restaurant/KitchenDisplaySystem.tsx`
- `src/components/restaurant/ReservationsBoard.tsx`
- `src/components/restaurant/FloorPlanEditor.tsx`
- `src/components/restaurant/OrderModal.tsx`
- `src/components/restaurant/StaffShiftScreen.tsx`

The app supports role-based routing, manager PIN authorization, table/floor-plan operations, kitchen display, reservations, and staff-oriented workflows.

### Data dependencies

- restaurant staff tables
- table/floor-plan data
- orders
- kitchen tickets
- reservations
- business settings

### User actions

- Staff login / shift handling
- Open dashboard by role
- Manage table orders
- Use kitchen display
- Work with reservations
- Edit floor plan
- Approve protected actions with manager PIN

### Strengths

- Most sophisticated operational module in the app
- Real role-based thinking
- Good separation between front-of-house and kitchen flows

### Weaknesses and risks

- Complexity is high, so UX inconsistency can multiply quickly
- PIN-based privileged actions need careful audit and QA
- There are likely multiple overlapping UI patterns from different development phases

### Suggested future upgrades

- Unify confirmation, error, and success patterns
- Review role transitions and session visibility carefully
- Improve staff-focused empty states and recovery flows

### Priority

High if restaurant customers are active. This module deserves focused QA rather than random polish.

## 8. Market / supermarket POS

### How it works

The retail/POS path appears in:

- `src/components/dashboards/SupermarketDashboard.tsx`
- `src/modules/market/MarketPOS.tsx`
- `src/components/market/*`
- shared fiscal, scanner, sound, and payment hooks

This is a speed-oriented checkout workflow with barcode scanning, weighed items, payment methods, receipts, and fiscal/payment service integrations.

### Data dependencies

- product/catalog data
- transaction data
- business settings
- scanner/fiscal/payment integrations

### User actions

- Scan/add items
- Manage cart lines
- Take cash/card/digital payment
- Print or show receipts
- Operate through keyboard shortcuts

### Strengths

- Purpose-built for high-velocity desktop use
- Strong keyboard-centric design
- Real operational depth

### Weaknesses and risks

- Operational modules have low tolerance for ambiguous states
- Build warnings and chunk size indicate this area contributes to technical weight
- Hardware and fiscal integrations increase QA burden sharply

### Suggested future upgrades

- Better cashier-facing recovery states
- Stronger offline/failure messaging for payment/fiscal interruptions
- Focused performance and code-splitting review

### Priority

High if deployed, but only with careful operational QA.

## 9. Admin

### How it works

`src/components/admin/AdminDashboard.tsx` supports user/business oversight, search, creation, editing, and platform-level summary stats.

### Data dependencies

- `user_profiles`
- `business_profiles`

### User actions

- Search platform users
- Create and edit users
- Review top-level platform stats

### Strengths

- Useful internal control surface
- Data merge approach is understandable

### Weaknesses and risks

- Typing is weak and lint debt is visible
- Financial/subscription insight is partial
- Internal tooling polish is lower than the trip module

### Suggested future upgrades

- Replace loose typing in admin data flows
- Improve search/result explanations
- Add safer admin action confirmations and clearer audit feedback

### Priority

Medium. Important internally, but not the best first UX investment unless admin pain is active.

## 10. Placeholder modules

### Included areas

- Phone shop
- Car parts dashboard landing
- Clothes shop
- Furniture store

### How they work

These dashboards currently act as branded placeholders that announce future intent more than real workflows.

### Strengths

- Clear product ambition
- Distinct business identities are already represented

### Weaknesses and risks

- They can create false expectations if surfaced too prominently
- UX polishing them now would be low-value compared with working modules

### Suggested future upgrades

- Decide which one is strategically next
- Build one real workflow end-to-end before polishing the others

### Priority

Wait. Do not spread product effort thinly across all placeholder business types.

## Safe first improvements across the app

- Standardize destructive confirmations across non-trip modules.
- Improve empty states in auto repair, parts inventory, and analytics.
- Add clearer helper text and plain-language labels in settings and admin.
- Reduce module-specific toast-only feedback where a persistent success/error state would be safer.
- Tighten localization coverage for user-facing strings added in newer work.

## Risky upgrades to avoid for now

- Full navigation rewrite across every business type.
- Large shared component refactor before module behavior is stabilized.
- Offline sync promises without real conflict and recovery design.
- Heavy AI features in operational workflows.
- Cross-module data model unification done purely for engineering neatness.

## Recommended upgrade order

1. Consolidate the trip improvements already started and close translation/manual-QA gaps.
2. Stabilize settings and dashboard shell safety/clarity.
3. Improve auto repair and parts inventory UX consistency.
4. Run a focused QA and product pass on restaurant or market, depending on which business is actively deployed.
5. Delay placeholder business types until a real workflow is chosen for each.

## Final product recommendation

The app already has one strong, user-proven module in trips and several promising operational modules. The right strategy is not to make everything equally polished at once. The right strategy is to:

- Keep strengthening the modules that already have real workflow depth.
- Treat restaurant and market as high-value but high-risk operational systems that need focused audits.
- Stop spending polish effort on placeholder dashboards until there is a committed product plan behind them.
