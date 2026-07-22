# Release Rollback & Disaster Recovery Procedure

This document specifies emergency rollback procedures across all release channels.

## 1. Website & PWA Rollback

- **Vercel Alias Reversion**: Vercel keeps all historical deployment immutably. If a frontend issue escapes to production, instantly revert the production domain alias to the last known-good deployment:
  ```bash
  vercel alias set <previous-deployment-url> mydesck-pro.vercel.app
  ```
- **PWA Service Worker Invalidation**: Because `sw.js` and `version.json` specify `Cache-Control: no-cache, no-store, must-revalidate`, client browsers fetch the updated service worker immediately upon reload.

## 2. Database Migration Rollback Strategy

- **Expand-and-Contract Forward Rollbacks**: Production migrations are strictly forward-only. Never run `db reset` or destructive `DROP TABLE` on production.
- **RPC Compatibility Preservation**: When modifying RPC parameters, maintain backward compatibility or deploy forward patch migrations adding optional parameter fallbacks before deprecating old signatures.

## 3. Desktop Updater Recovery

- **GitHub Release Fallback**: Never delete a published GitHub release if clients have downloaded it.
- **latest.yml Metadata Recovery**: If a broken release artifact is pushed:
  1. Restore `latest.yml` on GitHub Releases to point to the previous stable installer version and checksum.
  2. Electron clients checking `latest.yml` will recognize the stable version metadata and refuse to download the broken build.
  3. Client application displays localized fallback message:
     *"The update could not be installed. Your current version is still safe to use. Please try again later."*
