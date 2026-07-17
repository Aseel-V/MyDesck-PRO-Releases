# Travel PDF V2 implementation

- Files changed: `src/lib/pdfGenerator.ts` and the three Travel locale files.
- Previous structure: generic metric-card invoice rendered as a single raster image.
- New hierarchy: compact branded header, booking overview, conditional travel and hotel sections, financial summary, notes, and agency footer.
- Ticket-only: omits accommodation content. Hotel-only: omits travel content. Both: renders separate travel and hotel sections.
- Financials: preserves stored currency, total, paid, remaining, status, and payment-method breakdown.
- Pagination: invoice raster output now flows onto additional A4 pages rather than shrinking the complete document.
- RTL: browser HTML rendering uses `dir` and RTL-aligned layout for Arabic and Hebrew.
- Performance: one existing PDF pipeline, one raster generation, cached browser module loading; no new PDF library or remote asset was added.
- Remaining risk: long raster documents cannot repeat semantic headers on split pages; native-speaker visual PDF checks remain advisable.
- Rollback: revert the PDF-generator and locale changes from this implementation.
