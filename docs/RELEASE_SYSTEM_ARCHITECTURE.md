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

## 4. Promotion Policy: Option A — Exact Fast-Forward Promotion

To guarantee artifact and verification integrity between Staging and Production:
1. **Exact Fast-Forward Promotion**: The production branch (`main`) must be fast-forwarded directly to the exact tested staging candidate commit SHA (`approved_staging_sha == github.sha == main_head_sha`).
2. **Rejection of Merge Commits & Squash Merges**: Merge commits and squash merges create a brand-new commit SHA that has not passed the full 11-stage staging test battery. They are strictly rejected by the production workflow.
3. **Exact Byte Reuse**: Production release publishing reuses the exact pre-verified installer, blockmap, and `latest.yml` artifacts downloaded from the approved staging workflow run. No code is rebuilt after verification.
