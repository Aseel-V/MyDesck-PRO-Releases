# Travel Form Status, Attachments, and Payment Redesign

## Files changed

- `src/components/trips/NewTripForm.tsx`
- `src/lib/tripStatus.ts`
- `src/lib/schemas.ts`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ar.json`
- `src/i18n/locales/he.json`
- `APP_MAJOR_UPDATE_BACKLOG.md`

## Status and attachments

The manual status select, helper text, review row, and completion dependency were removed. `deriveTripStatus` is a pure shared helper: normal records are `active` before and during the selected date range and `completed` after it. The persisted enum has no `upcoming` value, so `active` is the compatible stored representation. `cancelled` and `archived` are preserved.

The attachment list, empty state, file picker, upload helper, upload/removal handlers, and attachment interaction were removed from this form. Existing attachment data is passed through on edit; no stored files, database columns, or shared attachment infrastructure were removed.

## Payments and currency

Visible currency switching and conversion are removed from New/Edit Trip. New records save ILS with exchange rate `1` and ILS original-amount metadata. Amounts use a local LTR ILS display and the financial step groups the total, paid, remaining, and payment status.

For a legacy non-ILS record, financial inputs are read-only and a localized notice explains that the historical currency is preserved. Saving unrelated changes restores the stored currency, amounts, payment data, and original-currency metadata, preventing conversion or relabelling.

## Localization, RTL, and accessibility

English, Arabic, and Hebrew include the payment-progress, ILS, total-cost, and legacy-currency notice keys. Monetary values use local `dir="ltr"` where present. Removed controls leave no keyboard-reachable upload or currency switching UI.

## Verification

- `git diff --check`: passed
- `npm run i18n:check`: passed
- `npm run typecheck`: passed
- `npm run build`: passed (existing Rollup circular-chunk and chunk-size warnings only)
- Changed-file ESLint: passed

## Rollback

Revert the listed form, schema, status helper, locale, and backlog changes together. No migration or destructive data action was performed.
