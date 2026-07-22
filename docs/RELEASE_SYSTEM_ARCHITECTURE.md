# MyDesck PRO Release Platform Architecture

## 1. Root Cause Summary

Historical release failures occurred due to:
1. **Frontend-Database Desynchronization**: Frontend code attempting to write into database-generated columns (`profit`, `amount_due`, `search_document`), or calling RPCs with mismatched argument signatures.
2. **Updater Drift**: Building installers without matching `latest.yml`, SHA512 blockmaps, or GitHub release tags.
3. **PWA Stale Cache**: Inappropriate caching of `version.json` and `sw.js` causing web users to remain on stale versions.
4. **Speculative Commits & Auto-Publishing**: Workflows committing and publishing tags before end-to-end verification.

## 2. New Release Architecture & 12-Stage Pipeline

```
1. Code validation
2. Database contract validation
3. Local integration tests
4. Staging deployment
5. Staging smoke tests
6. Manual approval (STOP)
7. Production database migration
8. Production website deployment
9. GitHub desktop release
10. Production smoke tests
11. Upgrade verification
12. Release completion
```

## 3. Status Reporting Model

The release state machine logs statuses accurately:
- `NOT RUN`
- `LOCAL PASS`
- `STAGING PASS`
- `PRODUCTION PASS`
- `USER VERIFIED`
- `FAIL`
- `BLOCKED`

Production PASS requires real production verification. User Verified requires explicit confirmation.
