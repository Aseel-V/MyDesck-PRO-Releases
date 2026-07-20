# Localization Split Implementation Report

- Created: `src/i18n/locales/en.json`, `ar.json`, `he.json`, `index.ts`, and `scripts/check-i18n.mjs`.
- Removed: `src/i18n/translations.ts`.
- Modified: i18next and the two receipt-template imports; added `i18n:check`.
- Format: JSON, locally bundled and directly readable by the Node validator.
- Typecheck passed. The resource validator identified pre-existing asymmetric language keys; Arabic and Hebrew missing English keys were filled structurally from English while preserving overrides, but language-only extra keys still require canonical English translations before strict validation can pass.
- Dashboard now uses valid alternative Analytics keys; no import of the removed monolith remains.
