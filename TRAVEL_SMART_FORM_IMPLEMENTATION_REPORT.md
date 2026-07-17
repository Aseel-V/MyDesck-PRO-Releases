# Smart Trip Form Implementation Report

- Service type drives accommodation visibility: ticket hides the hotel/rooms step; hotel and both show it. Hidden values remain in form state and payloads.
- Hotel name is initialized, draft-backed through the existing watched form state, persisted through the typed payload, and required outside ticket-only mode.
- New records default to ILS. The visible main-currency control is an ILS display; legacy edit values remain untouched in form state.
- The existing review step and localized step navigation remain the guided completion surface.
- Validation, build, typecheck, and i18n results are recorded from the final command run.
- Roll back the form, schema/types, locale resources, and additive migration to reverse this batch.
