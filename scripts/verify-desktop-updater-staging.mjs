import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

console.log('[verify-desktop-updater-staging] Running Desktop Updater Pre-Release & Staging Asset Contract...');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 1. Updater Repository & Channel Validation
assert.equal(pkg.build.publish.provider, 'github', 'Provider must be github');
assert.equal(pkg.build.publish.owner, 'Aseel-V', 'Repository owner must be Aseel-V');
assert.equal(pkg.build.publish.repo, 'MyDesck-PRO-Releases', 'Repository name must be MyDesck-PRO-Releases');
assert.equal(pkg.build.nsis.artifactName, 'MyDesck-PRO-Setup.exe', 'Artifact name must be MyDesck-PRO-Setup.exe');

// 2. Pre-release / Staging Channel Verification
if (existsSync('release/latest.yml')) {
  const latestYml = readFileSync('release/latest.yml', 'utf8');
  assert.ok(latestYml.includes(`version: ${pkg.version}`), `latest.yml version must equal package.json version ${pkg.version}`);
  assert.ok(latestYml.includes('MyDesck-PRO-Setup.exe'), 'latest.yml must reference MyDesck-PRO-Setup.exe');
  assert.ok(latestYml.includes('sha512:'), 'latest.yml must contain SHA512 hash');
  assert.ok(existsSync('release/MyDesck-PRO-Setup.exe'), 'Installer artifact MyDesck-PRO-Setup.exe must exist');
  assert.ok(existsSync('release/MyDesck-PRO-Setup.exe.blockmap'), 'Blockmap artifact MyDesck-PRO-Setup.exe.blockmap must exist');
  console.log('STATUS: STATIC CONTRACT PASS');
} else {
  console.log('STATUS: BLOCKED');
  console.log('Reason: Staging desktop release artifacts (latest.yml, MyDesck-PRO-Setup.exe, blockmap) not built yet for current tag.');
}
