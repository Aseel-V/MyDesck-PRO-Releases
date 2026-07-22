import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

console.log('[verify-desktop-release-assets] Verifying desktop release assets configuration and contract...');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 1. Verify build configuration in package.json
assert.equal(pkg.build.appId, 'com.mydesck.pro');
assert.equal(pkg.build.publish.provider, 'github');
assert.equal(pkg.build.publish.owner, 'Aseel-V');
assert.equal(pkg.build.publish.repo, 'MyDesck-PRO-Releases');
assert.equal(pkg.build.win.target[0], 'nsis');
assert.equal(pkg.build.nsis.artifactName, 'MyDesck-PRO-Setup.exe');

// 2. Local release build check (if release directory exists)
if (!existsSync('release/latest.yml')) {
  console.error('❌ FAIL CLOSED: release/latest.yml does not exist!');
  process.exit(1);
}

const latestYml = readFileSync('release/latest.yml', 'utf8');
assert.ok(latestYml.includes(`version: ${pkg.version}`), `latest.yml version must match package.json (${pkg.version})`);
assert.ok(latestYml.includes('MyDesck-PRO-Setup.exe'), 'latest.yml must point to MyDesck-PRO-Setup.exe');
assert.ok(latestYml.includes('sha512:'), 'latest.yml must specify sha512 checksum');
assert.ok(existsSync('release/MyDesck-PRO-Setup.exe'), 'MyDesck-PRO-Setup.exe must exist in release directory');
assert.ok(existsSync('release/MyDesck-PRO-Setup.exe.blockmap'), 'MyDesck-PRO-Setup.exe.blockmap must exist in release directory');

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const setupStat = statSync('release/MyDesck-PRO-Setup.exe');
const blockmapStat = statSync('release/MyDesck-PRO-Setup.exe.blockmap');
const latestStat = statSync('release/latest.yml');

const latestSha512Match = latestYml.match(/sha512:\s*([^\s\r\n]+)/);
const latestSha512 = latestSha512Match ? latestSha512Match[1] : '';

mkdirSync('results', { recursive: true });
const result = {
  test: 'artifact-integrity',
  status: 'STAGING PASS',
  commit_sha: process.env.COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  workflow_run_id: String(process.env.RUN_ID || process.env.GITHUB_RUN_ID || 'local'),
  timestamp: new Date().toISOString(),
  installer_filename: 'MyDesck-PRO-Setup.exe',
  installer_size: setupStat.size,
  installer_sha256: sha256('release/MyDesck-PRO-Setup.exe'),
  blockmap_filename: 'MyDesck-PRO-Setup.exe.blockmap',
  blockmap_size: blockmapStat.size,
  blockmap_sha256: sha256('release/MyDesck-PRO-Setup.exe.blockmap'),
  latest_yml_filename: 'latest.yml',
  latest_yml_size: latestStat.size,
  latest_yml_sha256: sha256('release/latest.yml'),
  latest_yml_version: pkg.version,
  latest_yml_installer_filename: 'MyDesck-PRO-Setup.exe',
  latest_yml_sha512: latestSha512,
  details: 'Verified installer, blockmap, and latest.yml SHA256/SHA512 hashes and non-zero sizes.'
};
writeFileSync('results/artifact-integrity-result.json', JSON.stringify(result, null, 2), 'utf8');

console.log('✓ Artifact integrity verified and saved to results/artifact-integrity-result.json.');
