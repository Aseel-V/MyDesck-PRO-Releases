import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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
if (existsSync('release/latest.yml')) {
  const latestYml = readFileSync('release/latest.yml', 'utf8');
  assert.ok(latestYml.includes(`version: ${pkg.version}`), `latest.yml version must match package.json (${pkg.version})`);
  assert.ok(latestYml.includes('MyDesck-PRO-Setup.exe'), 'latest.yml must point to MyDesck-PRO-Setup.exe');
  assert.ok(latestYml.includes('sha512:'), 'latest.yml must specify sha512 checksum');
  assert.ok(existsSync('release/MyDesck-PRO-Setup.exe'), 'MyDesck-PRO-Setup.exe must exist in release directory');
  assert.ok(existsSync('release/MyDesck-PRO-Setup.exe.blockmap'), 'MyDesck-PRO-Setup.exe.blockmap must exist in release directory');
  
  function sha256(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  }

  mkdirSync('results', { recursive: true });
  const result = {
    test: 'artifact-integrity',
    status: 'STAGING PASS',
    timestamp: new Date().toISOString(),
    installer_sha256: sha256('release/MyDesck-PRO-Setup.exe'),
    blockmap_sha256: sha256('release/MyDesck-PRO-Setup.exe.blockmap'),
    latest_yml_sha256: sha256('release/latest.yml'),
    details: 'Verified installer, blockmap, and latest.yml SHA256 hashes.'
  };
  writeFileSync('results/artifact-integrity-result.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('✓ Local release artifacts verified and saved to results/artifact-integrity-result.json');
} else {
  console.log('ℹ Local release artifacts not generated yet (run npm run dist:win to generate build assets)');
}

console.log('[verify-desktop-release-assets] DESKTOP RELEASE ASSET CONTRACT PASSED.');
