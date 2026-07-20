# Travel visual test matrix

No state in this matrix has been verified. Capture each core screen in English, Arabic, and Hebrew; light and dark; at 375px, 768px, 1024px, and 1440px.

| Screen/state | Required assertions |
| --- | --- |
| Login | Form contrast, error/loading, password visibility, language/theme controls, RTL reading/control order |
| Dashboard | KPI hierarchy, chart labels/tooltips, alert/recent-trip layout, year select, skeleton |
| Trips list and empty | Filters, grid/list, table/mobile card, empty variants, error/retry, export actions |
| New and edit trip | All steps, required/error fields, payment status, attachments, review, unsaved confirmation |
| Trip details | Long names/destinations, tables, timeline, attachment/notes empty states, archive confirmation |
| Cars | Excluded from Travel until product scope confirms it is a Travel feature |
| Analytics | Filters, charts, long labels, attention table, currency/rate states |
| Settings | All Travel tabs, notices, loading/save/error, branding upload controls |
| Shared | PDF export, payment update, status-help, confirmation modal, command palette, footer, toast |

For every capture: check keyboard focus order, 200% browser zoom, color contrast, reduced motion, no clipping/overlap, and logical RTL icon placement. Run web and Electron captures separately; record environment, authenticated test data, viewport, language, theme, and actual pass/fail evidence.
