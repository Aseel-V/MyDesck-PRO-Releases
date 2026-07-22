import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

console.log('[verify-desktop-updater-metadata] Running Desktop Updater Metadata Contract Verification...');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 1. Updater Repository & Channel Validation
assert.equal(pkg.build.publish.provider, 'github', 'Provider must be github');
assert.equal(pkg.build.publish.owner, 'Aseel-V', 'Repository owner must be Aseel-V');
assert.equal(pkg.build.publish.repo, 'MyDesck-PRO-Releases', 'Repository name must be MyDesck-PRO-Releases');
assert.equal(pkg.build.nsis.artifactName, 'MyDesck-PRO-Setup.exe', 'Artifact name must be MyDesck-PRO-Setup.exe');

// 2. Pre-release / Staging Channel Verification
if (!existsSync('release/latest.yml')) {
  console.error('❌ FAIL CLOSED: release/latest.yml is missing!');
  process.exit(1);
}

if (!existsSync('release/MyDesck-PRO-Setup.exe')) {
  console.error('❌ FAIL CLOSED: release/MyDesck-PRO-Setup.exe is missing!');
  process.exit(1);
}

if (!existsSync('release/MyDesck-PRO-Setup.exe.blockmap')) {
  console.error('❌ FAIL CLOSED: release/MyDesck-PRO-Setup.exe.blockmap is missing!');
  process.exit(1);
}

const latestYml = readFileSync('release/latest.yml', 'utf8');
assert.ok(latestYml.includes(`version: ${pkg.version}`), `latest.yml version must equal package.json version ${pkg.version}`);
assert.ok(latestYml.includes('MyDesck-PRO-Setup.exe'), 'latest.yml must reference MyDesck-PRO-Setup.exe');
assert.ok(latestYml.includes('sha512:'), 'latest.yml must contain SHA512 hash');

const sha512Match = latestYml.match(/sha512:\s*([^\s\r\n]+)/);
const sha512Val = sha512Match ? sha512Match[1] : '';

mkdirSync('results', { recursive: true });
const result = {
  test: 'desktop-updater-metadata',
  status: 'STAGING PASS',
  commit_sha: process.env.COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  workflow_run_id: String(process.env.RUN_ID || process.env.GITHUB_RUN_ID || 'local'),
  timestamp: new Date().toISOString(),
  version: pkg.version,
  installer_filename: 'MyDesck-PRO-Setup.exe',
  blockmap_filename: 'MyDesck-PRO-Setup.exe.blockmap',
  latest_yml_filename: 'latest.yml',
  latest_yml_sha512: sha512Val,
  installer_exists: true,
  blockmap_exists: true,
  details: 'Verified provider, repo, latest.yml, installer, blockmap, version, and SHA512 metadata.'
};
writeFileSync('results/updater-metadata-result.json', JSON.stringify(result, null, 2), 'utf8');

console.log('✓ Desktop Updater Metadata Contract Verification PASSED.');
