# Rules rollback artifact capture

Phase 4B closed Firestore read access by supplying the quota-project header to the already-authorized human reader. Immutable Firestore source and manifest are now in `../rollback-production`; versioned current captures are in `../current-production`. Their hash is recorded in `production-release-manifest.json`. Storage remains unavailable: no bucket, disabled Firebase Storage API, billing and named-database integration prerequisites unresolved. Its rollback artifact is deliberately still pending. An operator must approve the release manifest before deployment.

Deployment tooling must compare the live current hashes with `expectedCurrentProductionHashes` and refuse on mismatch. Rollback deploys only these captured rulesets, verifies their deployed hashes, and reruns the prior security smoke. `UNREADABLE_403` or `PENDING_READ_ACCESS` is always `NO_GO`.
