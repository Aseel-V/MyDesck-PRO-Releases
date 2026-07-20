# Ticket Localization Review

- Files changed: ticket locale values in English, Arabic, and Hebrew.
- Reviewed ticket journey, carrier, airports, flight references, travel class, cost, and notes keys.
- English: clarified the helper copy and corrected “Business” to “Business class”.
- Arabic: corrected all travel-class labels to complete professional terms.
- Hebrew: corrected travel-class labels to natural full forms.
- No ticket-specific hardcoded visible labels remain in `NewTripForm.tsx`; visible ticket labels use `t()`.
- Native-speaker follow-up: optional product terminology review for the wider pre-existing Travel locale set.
