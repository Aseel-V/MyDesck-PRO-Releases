# Website Latest Version and Download Audit

## Website files inspected

- `src/pages/LandingPage.tsx`
- `src/pages/solutions/SolutionPage.tsx`
- `src/components/DownloadModal.tsx`
- `src/hooks/useGitHubRelease.ts`
- `src/i18n/locales/en.json`, `ar.json`, and `he.json`
- `vite.config.ts`, `vercel.json`, `package.json`, and `.github/workflows`
- Public GitHub repository, latest stable release, release assets, and stable installer redirect

## Previous behavior

The Vite landing page already queried GitHub's `/releases/latest` endpoint in the browser, but the main badge was independently hardcoded to `V 0.0.35 Available Now`. The current public latest stable release is `v0.0.33`, so the page could display contradictory versions. The hook had no timeout, cache, response validation, draft/prerelease checks, or shared-request deduplication.

The Windows button accepted the first asset ending in `.exe`, not the exact trusted installer name. Its fallback URL was the correct stable GitHub latest-download URL. The Mac fallback was hardcoded to an obsolete `0.0.34` filename. The download modal exposed every release asset except `.yml` and `.blockmap`, contained hardcoded English, and showed raw request failure behavior.

## Latest-release integration selected

The site remains a static Vite client hosted through the checked-in Vercel SPA configuration. It uses one shared client-side GitHub API request because this repository contains no server-rendered route or serverless API. The request:

- uses the public GitHub API without a token;
- accepts only a published stable SemVer release with `draft: false` and `prerelease: false`;
- validates the release and asset URLs as HTTPS URLs under the configured public repository;
- selects Windows only when the asset name is exactly `MyDesck-PRO-Setup.exe`;
- selects Mac only through a version-matched MyDesck PRO DMG naming pattern;
- times out after eight seconds;
- shares an in-flight request across components; and
- caches the validated response in memory and `sessionStorage` for 15 minutes.

## Version and installer presentation

The hardcoded `0.0.35` badge and fixed `0.0.34` Mac URL were removed. The visible Windows version now comes from the same stable release containing the selected installer, with a leading `v` removed only for presentation. The download modal shows the release date and live asset size when available.

The primary Windows link is immediately available through:

`https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-Setup.exe`

After the API resolves, the button uses the exact validated asset URL. If GitHub's API is temporarily unavailable, the verified stable URL remains usable and the version is marked unavailable rather than replaced with an old or fake number. If GitHub returns a valid latest release that lacks the expected installer, the button is disabled so the site does not knowingly send users to a broken or unrelated file.

`latest.yml`, blockmaps, source archives, and arbitrary release assets are never offered as normal user downloads.

## Stable, prerelease, and failure handling

Drafts, prereleases, invalid tags, untrusted URLs, and malformed API responses are rejected. Network failure, timeout, offline mode, and rate limiting preserve the stable installer fallback and show a compact localized status with retry. A valid release missing the installer produces a localized unavailable state. Development logs contain only a generic request failure object and no credentials.

## Localization, RTL, and accessibility

All download/version/loading/error/retry/release-note strings exist in English, Arabic, and Hebrew. Technical version/platform details have local LTR direction, dates and file sizes use the active locale, dialog controls have accessible names, the dialog has semantic labeling, focus indicators are visible, and unavailable states use text rather than color alone.

## Deployment and revalidation behavior

`vercel.json` configures the built Vite SPA for Vercel, but the repository contains no website deployment workflow and no local Vercel project metadata proving that Git-based automatic deployment is enabled. Source-commit deployment therefore depends on external Vercel project settings and cannot be confirmed from this checkout.

A new public stable GitHub Release does not require a website source edit or redeployment. On a new session, or after the 15-minute cache expires, the runtime GitHub request updates the displayed version, date, size, and exact asset URL. During API failure, the stable latest-download redirect follows the newest public stable release immediately where GitHub can resolve it.

## Security result

No GitHub token is used or present in client code. Only HTTPS GitHub URLs under `Aseel-V/MyDesck-PRO-Releases` are accepted. Release content is not injected as HTML. User input cannot control the provider, repository, asset name, or download URL. TLS validation is unchanged.

## Verification result

- Live repository check confirmed the repository is public.
- Live latest-release check confirmed stable `v0.0.33`, not draft or prerelease.
- Exact asset check found `MyDesck-PRO-Setup.exe` at 108,018,137 bytes.
- The stable latest-download URL resolved successfully to the installer without authentication.
- `git diff --check`, localization validation, typecheck, production build, and changed-file ESLint were run.
- Static checks found no website link to `latest.yml`, `.blockmap`, an old fixed DMG, or a client GitHub token.

## Exact behavior after the next release

When a higher stable GitHub Release is published with the exact Windows asset name, GitHub changes the `latest` API response and stable redirect. The site displays and downloads that release automatically on the next uncached lookup, no later than the configured 15-minute session-cache expiry. Drafts and prereleases do not replace the stable website download.

## Remaining risks

- Automatic website deployment after source commits cannot be proven without access to the external Vercel project settings.
- GitHub API availability and unauthenticated rate limits can temporarily hide version/date/size, although the stable installer link remains available.
- A release published without the exact installer name disables the validated button after lookup and requires correcting the release artifacts.
- Cached release information can remain visible for up to 15 minutes after publication.

## Rollback

Revert the website files listed above and remove the added `landing.download` locale keys and `test:website-release` script. Do not restore the hardcoded version or version-specific installer URLs; if this implementation must be rolled back, retain the stable GitHub latest-download URL as the minimum safe download behavior.
