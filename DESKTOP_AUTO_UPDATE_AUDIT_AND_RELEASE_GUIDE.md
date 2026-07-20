# Desktop Auto-Update Audit and Release Guide

## Current updater architecture

- Auto-update existed before this task and was initialized in the packaged Electron main process, not merely listed as a dependency.
- Electron `33.4.11` is packaged by `electron-builder` `26.0.12`; updates use `electron-updater` `6.6.2` and its `autoUpdater` instance.
- `package.json` is the single version source. Electron `app.getVersion()`, the renderer, the packaged manifest, and generated update metadata use that version.
- The application ID is `com.mydesck.pro`. The stable channel is `latest`.
- The public GitHub repository `Aseel-V/MyDesck-PRO-Releases` is the update provider. Installed clients need no token; CI receives only the workflow's short-lived GitHub token.
- The secure preload bridge exposes only fixed check, download, and install actions plus typed state events. It exposes no provider URL, token, Node API, or arbitrary updater command.

## Release and version semantics

A commit, version bump, push, CI build, release, and client update are distinct:

1. A commit records source only; it does not publish an update.
2. A branch push runs ordinary CI only; it does not publish an update.
3. A version bump changes the version clients compare, but does not publish it.
4. Pushing a matching stable tag such as `v0.0.46` starts the release workflow.
5. The workflow verifies that the tag equals the `package.json` version, builds the installer and metadata, and publishes a visible GitHub Release.
6. Only after that public release contains the required artifacts can installed clients discover it.

The candidate must be strictly greater than the installed stable SemVer. `0.0.46` updates `0.0.45`; the same version, an older version, an invalid value, or a prerelease is rejected. Never replace or republish an existing version as a new update.

The workflow's manual dispatch is deliberately a non-publishing Windows packaging check. The local `npm run release` script can publish when explicitly supplied credentials, but it is not the recommended production path.

## Packaging and required artifacts

| Platform | Configuration and expected outputs | Result |
| --- | --- | --- |
| Windows x64 | NSIS `MyDesck-PRO-Setup.exe`, `MyDesck-PRO-Setup.exe.blockmap`, and `latest.yml` | Local non-publishing build passed; filenames and SHA-512 metadata match. |
| macOS | DMG and ZIP would generate `latest-mac.yml` | Not release-ready: `assets/icon.icns` is missing, the release workflow has no macOS job, and signing/notarization are not configured. |
| Linux | No target or metadata configured | Unsupported by the current desktop release pipeline. |

The Windows package contains `electron.js`, `preload.cjs`, `updater-policy.cjs`, `dist/index.html`, `package.json`, and `electron-updater`. Its generated `app-update.yml` points to the configured public GitHub repository and contains no credential.

## CI/CD behavior

- `.github/workflows/build.yml` runs lint, typecheck, and web production build for pushes and pull requests to `main`/`master`; it never publishes.
- `.github/workflows/build-release.yml` runs only for a `v*.*.*` tag or manual dispatch. It uses `npm ci`, localization validation, typecheck, updater tests, and the production build.
- Tag runs validate tag/version equality and use the workflow-scoped token to publish a normal (non-draft, non-prerelease) release.
- Manual runs execute `npm run dist:win`, which includes `--publish never`.
- The public release history currently reports `v0.0.33` as the latest published release. Local/current version `0.0.45` therefore has no higher update to detect. A successful next production release must be at least `0.0.46`.
- Historical tag workflow run `v0.0.45` failed in the build/publish step. Run `v0.0.43` succeeded but did not result in a visible public release; explicit `releaseType: release` and the workflow token configuration now close those confirmed configuration gaps.

## Runtime update behavior

- The packaged app registers updater listeners once after the main window is ready and performs one non-blocking startup check. Development and unpackaged builds are excluded with `app.isPackaged` and development guards.
- Concurrent checks and downloads are deduplicated. A manual **Check for updates** action is available in Settings > About.
- An available update is announced globally and in Settings. Download starts only after the user chooses it, with normalized visible progress.
- A downloaded update is installed only after the user chooses **Restart to install**. Postponing does not close the app and normal quit does not force installation.
- No-update, invalid metadata, provider/network failures, and download failures become localized states. Raw provider errors and stack traces are logged only in the main process and are not shown to users.
- Failures leave login and local application functionality available. Interrupted or partial downloads remain the updater library's responsibility and may be retried by checking again.

## Localization, RTL, and accessibility

English, Arabic, and Hebrew include checking, available, progress, ready, retry, postpone, current/new version, up-to-date, and error messages. Versions use LTR wrappers, progress uses native progressbar semantics and numeric ARIA values, buttons are keyboard controls with visible focus styles, and state is conveyed in text rather than color alone.

## Signing and platform trust

- The locally generated Windows application and installer are both `NotSigned`. SHA-512 metadata protects artifact integrity in the updater path, but unsigned binaries remain subject to Windows SmartScreen/reputation warnings and are not production-signing ready.
- No certificate material or password is committed or exposed. Add a trusted Windows code-signing certificate through CI secrets before treating distribution as trusted.
- macOS has neither signing nor notarization configuration. Reliable macOS installation/update cannot be claimed until Developer ID signing, notarization, the missing icon, and a macOS release job are implemented and tested.
- Signature or TLS verification is not disabled. The renderer cannot redirect the updater to an untrusted feed.

## Verification performed

- Static updater test covers stable version comparison, invalid versions, same/older versions, progress clamping, lifecycle-event presence, duplicate-initialization guard, fixed IPC mapping, provider configuration, tag gating, and non-publishing manual workflow behavior.
- `node --check` passed for the Electron main and preload scripts.
- Workflow YAML parsed successfully for both workflow files.
- `npm run i18n:check`, `npm run typecheck`, changed-file ESLint, `npm run build`, and `git diff --check` were run.
- `npm run dist:win` completed with `--publish never`; `latest.yml` reports `0.0.45` and matches the generated installer filename, size, and SHA-512.
- No release, tag, push, or artifact upload was performed.

## End-to-end limitation

A true installed-client test was not performed because it requires an isolated older installed build and a higher reachable test feed/release. The production provider currently exposes only `v0.0.33`, which is older than the current `0.0.45`. Therefore detection, download, replacement, and restart are verified statically and through packaging, but not as a complete installed-app round trip.

## Exact production release checklist

1. Start from a reviewed, clean release commit and confirm CI is green.
2. Confirm the next version is higher than every distributed version. From `0.0.45`, run `npm version patch` to create `0.0.46`, its version commit, and tag `v0.0.46`.
3. Run `npm ci`, `npm run i18n:check`, `npm run typecheck`, `npm run build`, and `npm run test:updater`.
4. Push the release commit and its tag intentionally: `git push origin main --follow-tags`.
5. Confirm the tag workflow passes and the public `v0.0.46` GitHub Release is not a draft or prerelease.
6. Confirm the release contains `MyDesck-PRO-Setup.exe`, its `.blockmap`, and `latest.yml`, and that `latest.yml` says `0.0.46` with the correct file and checksum.
7. On an isolated machine, install the prior signed production version, verify it detects `0.0.46`, download it, postpone once, then restart/install and confirm `app.getVersion()` reports `0.0.46`.
8. Do not announce the update as fully validated until that installed-client test passes.

## Rollback procedure

- Before publication, delete the local tag and version commit only if they have not been pushed, correct the issue, and create a new coherent version/tag.
- After publication, do not overwrite the same version. For the safest recovery, fix the defect, bump to a higher patch version, and publish that replacement through the same tag workflow.
- If a release must be stopped immediately, unpublish the affected GitHub Release so new clients cannot discover it, then publish a higher fixed version. Clients that already downloaded it may still require support; release removal is not a complete rollback.

## Remaining risks

- No installed older-to-newer end-to-end update test has run.
- Windows artifacts are unsigned, so OS trust warnings remain.
- macOS and Linux are not release-ready through the current workflow.
- The next real release workflow and public artifact availability remain unverified until an intentional higher tag is pushed.
- Provider outage, corrupted remote metadata, interrupted downloads, installation failure, and machine-specific permissions require an isolated release-candidate test; application access remains non-blocking when checks fail.
