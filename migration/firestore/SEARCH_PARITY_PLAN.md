# Search parity plan

All 14 discovered user-visible search features have a disposition in `migration/reports/firestore-search-inventory.json`; unknown count is zero. Arabic, Hebrew, English and mixed-direction fixtures are permanent tests.

`SearchRepository` is the UI boundary. `FirestoreNativeSearchRepository` accepts only indexed exact or prefix requests. `BoundedClientSearchRepository` refuses an incomplete set or a set above its declared maximum. `ExternalSearchRepository` carries the existing substring/fuzzy semantics through an authenticated server transport without choosing a vendor in this milestone.

The external adapter contract requires tenant or authorized-admin scope, a maximum page size of 50, stable `orderKey + id` cursors, and server-side authorization before querying. The index stores only fields approved for each feature; passport content, credentials, financial payloads and arbitrary document JSON are excluded. Index updates are emitted by server-authoritative Functions after the Firestore transaction commits, use the entity version as an idempotency key, and are reconciled by document ID/version before cutover.

Current SQL `ILIKE '%term%'` features retain exact substring behavior through the external adapter. The command palette changes from downloading every tenant trip to returning at most 20 ranked indexed results; this is an accepted safety change because it removes an unbounded client scan. The government vehicle lookup remains an independent public-data integration.

No external search service is deployed or granted production data access here. Vendor selection must evaluate regional residency, encryption, deletion propagation, tenant filters, Arabic/Hebrew tokenization, IAM, cost and export/rollback. The production switch cannot enable a search feature until its adapter passes the same corpus contract against the selected backend.
