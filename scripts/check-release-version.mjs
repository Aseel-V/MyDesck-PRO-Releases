import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const versionMetadata = JSON.parse(readFileSync('public/version.json', 'utf8'));
const releaseNotes = JSON.parse(readFileSync('public/release-notes.json', 'utf8'));

assert.ok(typeof packageJson.version === 'string' && packageJson.version.length > 0, 'packageJson.version must be a valid non-empty string');
assert.equal(lockfile.version, packageJson.version);
assert.equal(lockfile.packages[''].version, packageJson.version);
assert.equal(versionMetadata.version, packageJson.version);
assert.equal(versionMetadata.required, false);
assert.equal(releaseNotes.version, packageJson.version);
for (const language of ['en', 'he', 'ar']) {
  assert.equal(typeof releaseNotes.title[language], 'string');
  assert.ok(Array.isArray(releaseNotes.changes[language]) && releaseNotes.changes[language].length > 0);
}

if (existsSync('dist')) {
  const distVersion = JSON.parse(readFileSync('dist/version.json', 'utf8'));
  const distNotes = JSON.parse(readFileSync('dist/release-notes.json', 'utf8'));
  assert.equal(distVersion.version, packageJson.version);
  assert.equal(distNotes.version, packageJson.version);
  assert.ok(existsSync('dist/sw.js'), 'dist/sw.js must exist');
  assert.ok(existsSync('dist/index.html'), 'dist/index.html must exist');
}

const directory = await mkdtemp(join(tmpdir(), 'mydesck-release-tests-'));
const outfile = join(directory, 'website-release.mjs');
try {
  await build({ entryPoints: ['src/lib/websiteRelease.ts'], outfile, bundle: true, platform: 'node', format: 'esm', define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }), __APP_VERSION__: JSON.stringify(packageJson.version) }, logLevel: 'warning' });
  const release = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
  assert.equal(release.APP_VERSION, packageJson.version);
  assert.equal(release.compareStableVersions(packageJson.version, '0.0.55'), 1);
  assert.equal(release.compareStableVersions(`v${packageJson.version}`, '0.0.55'), 1);
  assert.equal(release.compareStableVersions(packageJson.version, `V${packageJson.version}`), 0);
  assert.equal(release.compareStableVersions('0.0.100', packageJson.version), 1);
  assert.equal(release.compareStableVersions('1.0.0', '0.9.99'), 1);
  assert.equal(release.compareStableVersions('invalid', packageJson.version), null);
  assert.equal(release.isNewerWebsiteVersion(packageJson.version, '0.0.55'), true);
  assert.equal(release.isNewerWebsiteVersion(`v${packageJson.version}`, '0.0.55'), true);
  assert.equal(release.isNewerWebsiteVersion(packageJson.version, `v${packageJson.version}`), false);
  assert.equal(release.isNewerWebsiteVersion(packageJson.version, packageJson.version), false);
  assert.equal(release.shouldDeferWebsiteUpdate(packageJson.version), false);
} finally {
  await rm(directory, { recursive: true, force: true });
}

const app = readFileSync('src/App.tsx', 'utf8');
const notice = readFileSync('src/components/WebsiteUpdateNotice.tsx', 'utf8');
const dialog = readFileSync('src/components/WebsiteReleaseNotesDialog.tsx', 'utf8');
assert.ok(app.includes('useWebsiteUpdate(!isElectron)'));
assert.ok(notice.includes("t('websiteUpdate.updateNow')") && notice.includes("t('websiteUpdate.later')"));
assert.ok(dialog.includes('role="dialog"') && dialog.includes("event.key === 'Escape'"));
assert.ok(!readFileSync('src/lib/websiteRelease.ts', 'utf8').includes('localStorage.clear'));

console.log(`Release version checks passed for v${packageJson.version}.`);
