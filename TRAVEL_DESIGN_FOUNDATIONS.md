# Travel design foundations

An evolution of the present slate/sky MyDesck PRO identity: calm operational workspace, restrained glass, clear data hierarchy. These are proposed rules, not implemented tokens.

| Foundation | Direction |
| --- | --- |
| Color and background roles | Canvas: `slate-50` / `slate-950`; subtle section: `slate-100` / `slate-900`; raised surface: white / `slate-950`; inset: `slate-50` / `slate-900`. Sky is primary action/focus; amber indicates attention; emerald indicates success/paid; rose indicates destructive/error. Never use color as the only status cue. |
| Surface and glass | Use solid surfaces for forms, tables, modal bodies, and reading-heavy data. Allow translucent blur only for floating navigation, limited dashboard highlights, and overlays. One border tone per surface level. |
| Typography | 12px metadata, 14px controls/body, 16px section lead, 20px section title, 24–30px page title. Prefer semibold for labels/actions and bold for values; avoid all-caps where translated text is used. |
| Arabic / Hebrew | Retain configured Arabic family; choose a tested Hebrew fallback before changing fonts. Use `dir` at screen/modal roots, logical Tailwind where safe, natural label wrapping, and tabular numerals for dates/currency. Never introduce unreviewed translations. |
| Spacing, radius, shadow | 4px base: 8/12/16/24/32 page rhythm. Radius: 8 inputs, 12 buttons/compact cards, 16 raised cards/modals; reserve 24+ for hero/floating navigation only. Shadows: none/inset for fields, small for raised card, large only for modal. |
| Cards and page header | Header = eyebrow optional, title, short supporting text, action slot; no duplicate container when content begins with a card. Cards expose one title/value/action hierarchy; stats use compact icon, label, value, comparator. |
| Buttons and fields | Primary sky filled; secondary neutral outlined; tertiary text; destructive rose outlined/filled only in confirm state. 40px minimum control height, clear focus ring, disabled contrast. Inputs share label, helper/error space, neutral surface, and valid/error border. |
| Tables, badges, modal | Tables have calm headers, row hover, numeric alignment, and responsive data-card fallback. Badges pair text/icon when practical and use a consistent status map. Modals have standard overlay, header, scroll body, and sticky action footer. |
| Empty/loading/error | Empty = contextual icon, title, explanation, one relevant action. Loading = layout-matched skeleton, not a generic spinner. Error = concise recovery text and retry when possible; success = existing global toast plus optional inline confirmation for persistent saves. |
| Responsive / RTL | Design at 375, 768, 1024, 1440. Collapse action rows before text truncates; avoid horizontal scrolling except data tables/year choices with a clear affordance. Test logical ordering, icon direction, timelines, and controls with long Arabic/Hebrew strings. |
| Motion | Keep existing short transitions for feedback; no decorative motion required. Respect existing `prefers-reduced-motion` stylesheet and avoid adding looping animation beyond loading states. |
