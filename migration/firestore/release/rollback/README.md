# Rules rollback artifact capture

The inventory principal received 403 from the Firebase Rules API, so inventing a rollback artifact would be unsafe. Before any deployment, an approved read-only operator must export the exact current Firestore and Storage rulesets, store them here, record their SHA-256 values in `production-release-manifest.json`, and sign the release manifest.

Deployment tooling must compare the live current hashes with `expectedCurrentProductionHashes` and refuse on mismatch. Rollback deploys only these captured rulesets, verifies their deployed hashes, and reruns the prior security smoke. `UNREADABLE_403` or `PENDING_READ_ACCESS` is always `NO_GO`.
