# Auto-Update Release Guide

## What this setup does

This project uses:

- Electron
- `electron-builder`
- `electron-updater`
- GitHub Releases
- Windows NSIS installer

Users only receive app updates from an official GitHub Release with a higher app version.

Normal commits do not update users.
Normal pushes to `main` or `master` do not publish production updates.

## Important concepts

- A `git commit` only saves code history.
- A `git push` only sends code to GitHub.
- A GitHub Release publishes versioned installer files and updater metadata.
- The app version comes from `package.json`.
- Auto-update needs a newer GitHub Release with a higher version than the installed app.

## Before testing

Make sure the GitHub repository used by `electron-builder` is correct:

- `Aseel-V/MyDesck-PRO-Releases`

Make sure the tag matches the app version exactly.

Example:

- `package.json` version: `0.0.40`
- Git tag: `v0.0.40`

If they do not match, the release workflow will fail intentionally.

## A. Create the baseline installer

Use this when you want to install the first updater-enabled version on a test Windows PC.

### 1. Set the app version

Set `package.json` version to:

`0.0.40`

### 2. Commit the change

```bash
git add package.json
git commit -m "Release v0.0.40"
```

### 3. Create the release tag

```bash
git tag v0.0.40
```

### 4. Push branch and tag

```bash
git push origin main
git push origin v0.0.40
```

### 5. Wait for GitHub Actions

The tag-based release workflow will:

- build the Windows NSIS installer
- generate `latest.yml`
- generate the installer `.blockmap`
- publish the assets to GitHub Releases

### 6. Download the installer

From the GitHub Release for `v0.0.40`, download:

- `MyDesck-PRO-Setup.exe`

### 7. Install on the test Windows PC

Important:

- test with the installed NSIS app
- do not test with `win-unpacked`
- do not test with a copied `.exe`

## B. Create the update release

Use this to test real auto-update from the older installed app.

### 1. Set the next version

Set `package.json` version to:

`0.0.41`

### 2. Commit the change

```bash
git add package.json
git commit -m "Release v0.0.41"
```

### 3. Create the release tag

```bash
git tag v0.0.41
```

### 4. Push branch and tag

```bash
git push origin main
git push origin v0.0.41
```

### 5. Wait for release assets

Confirm the GitHub Release includes:

- `MyDesck-PRO-Setup.exe`
- `MyDesck-PRO-Setup.exe.blockmap`
- `latest.yml`

### 6. Open the already installed `0.0.40` app on the test PC

Expected behavior:

1. The app checks for updates automatically.
2. It detects `0.0.41`.
3. It shows the update modal.
4. It starts downloading automatically.
5. It shows progress percentage.
6. It shows that the update is ready.
7. The user clicks restart.
8. The app installs the new version.
9. After restart, the app version is `0.0.41`.

## How to confirm the update worked

Check all of the following:

1. The installed `0.0.40` app detects `0.0.41`.
2. The modal shows the current version and available version.
3. Download progress moves normally.
4. Restart installs the new version without manual reinstall.
5. Settings shows `v0.0.41` after restart.
6. Existing user data is still present after update.

## If users already have older versions

There are two cases:

### Case 1: Their installed version already includes updater support

Then they can update automatically from future official GitHub Releases.

### Case 2: Their installed version does not include updater support

Then they cannot auto-update yet.

They must first install one newer manual baseline installer that includes updater support.

After that baseline install, later releases can update automatically.

## What does not trigger updates

These do not update users by themselves:

- a local commit
- pushing code to GitHub
- merging to `main`
- building locally without publishing a GitHub Release

Only a published GitHub Release with a higher version updates installed users.

## Windows-specific warnings

- Windows SmartScreen may warn if the installer is unsigned or not reputation-established.
- Testing must use the NSIS installer, not `win-unpacked`.
- Portable or manually copied EXEs may not update correctly.
- If users skip the installer and run unpacked files, updater behavior is not a supported test path.

## Local artifact validation

To build local Windows release artifacts without publishing:

```bash
npm run dist:win
```

After it finishes, confirm these files exist in `release/`:

- `MyDesck-PRO-Setup.exe`
- `MyDesck-PRO-Setup.exe.blockmap`
- `latest.yml`

## Recommended safe workflow

1. Change code.
2. Run checks locally.
3. Bump `package.json` version.
4. Commit.
5. Create matching tag `vX.Y.Z`.
6. Push the tag.
7. Wait for GitHub Release assets.
8. Test update from the previous installed version.
9. Only then send users the release.
