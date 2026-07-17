import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { isHigherStableVersion, normalizeProgress, parseStableVersion } = require('../updater-policy.cjs');

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('electron.js');
const preload = read('preload.cjs');
const workflow = read('.github/workflows/build-release.yml');

assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package version must be stable SemVer');
assert.equal(pkg.dependencies?.['electron-updater'], '^6.6.2');
assert.equal(pkg.build?.publish?.provider, 'github');
assert.equal(pkg.build?.publish?.owner, 'Aseel-V');
assert.equal(pkg.build?.publish?.repo, 'MyDesck-PRO-Releases');
assert.equal(pkg.build?.publish?.releaseType, 'release', 'tagged builds must become visible releases');
assert.ok(pkg.build?.win?.target?.includes('nsis'), 'Windows NSIS target is required');
assert.ok(pkg.build?.files?.includes('electron.js'));
assert.ok(pkg.build?.files?.includes('preload.cjs'));
assert.ok(pkg.build?.files?.includes('updater-policy.cjs'));
assert.match(pkg.scripts?.['dist:win'] ?? '', /dotenv -- electron-builder --win --publish never/);
assert.match(pkg.scripts?.release ?? '', /dotenv -- electron-builder --win --publish always/);

for (const channel of ['check-for-updates', 'download-update', 'install-update']) {
  assert.ok(main.includes(`ipcMain.handle('${channel}'`), `main handler missing: ${channel}`);
  assert.ok(preload.includes(`ipcRenderer.invoke('${channel}'`), `preload bridge missing: ${channel}`);
}

assert.ok(main.includes('!app.isPackaged'), 'updater must be disabled outside packaged builds');
assert.ok(main.includes('autoUpdater.autoDownload = false'), 'downloads must require user action');
assert.ok(main.includes('autoUpdater.autoInstallOnAppQuit = false'), 'installation must require user confirmation');
assert.ok(main.includes("autoUpdater.channel = 'latest'"), 'stable latest channel must be explicit');
assert.ok(main.includes('autoUpdaterInitialized'), 'listener initialization guard is required');
for (const event of ['checking-for-update', 'update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']) {
  assert.ok(main.includes(`autoUpdater.on('${event}'`), `updater lifecycle event missing: ${event}`);
}
assert.ok(workflow.includes("- 'v*.*.*'"), 'release workflow must be tag-gated');
assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"), 'manual dry-run path is required');
assert.ok(workflow.includes('npm run dist:win'), 'manual workflow must not publish');

assert.deepEqual(parseStableVersion('0.0.45'), [0, 0, 45]);
assert.equal(parseStableVersion('v0.0.46'), null);
assert.equal(parseStableVersion('0.0.46-beta.1'), null);
assert.equal(isHigherStableVersion('0.0.46', '0.0.45'), true);
assert.equal(isHigherStableVersion('0.0.45', '0.0.45'), false);
assert.equal(isHigherStableVersion('0.0.44', '0.0.45'), false);
assert.equal(isHigherStableVersion('invalid', '0.0.45'), false);
assert.equal(normalizeProgress(-5), 0);
assert.equal(normalizeProgress(52.4), 52.4);
assert.equal(normalizeProgress(140), 100);
assert.equal(normalizeProgress('invalid'), 0);

console.log(`Desktop updater configuration checks passed for v${pkg.version}.`);
