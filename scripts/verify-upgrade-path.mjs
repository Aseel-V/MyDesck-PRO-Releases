import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isHigherStableVersion, parseStableVersion } from '../updater-policy.cjs';

console.log('[verify-upgrade-path] Verifying desktop application upgrade path contract...');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const currentVersion = pkg.version;

// Historical versions tested
const historicalVersions = ['0.0.45', '0.0.47', '0.0.52', '0.0.56'];

for (const oldVer of historicalVersions) {
  assert.ok(isHigherStableVersion(currentVersion, oldVer), `Current version ${currentVersion} must be higher than historical version ${oldVer}`);
  const oldParsed = parseStableVersion(oldVer);
  const currentParsed = parseStableVersion(currentVersion);
  assert.ok(oldParsed !== null && currentParsed !== null, 'Versions must parse as valid SemVer tuples');
}

console.log(`[verify-upgrade-path] Upgrade contract from historical versions (${historicalVersions.join(', ')}) to v${currentVersion} PASSED.`);
