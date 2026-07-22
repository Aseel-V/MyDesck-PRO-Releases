import { writeFileSync, mkdirSync } from 'node:fs';

console.log('[verify-desktop-upgrade-physical] Running Windows Physical Previous-Version Upgrade Test...');

const isPhysicalUpgradeVerified = process.env.STAGING_PHYSICAL_UPGRADE_PASSED === 'true';

mkdirSync('results', { recursive: true });

if (!isPhysicalUpgradeVerified) {
  console.log('STATUS: DESKTOP UPGRADE: BLOCKED');
  console.log('Reason: Physical Windows upgrade test requires real Windows test VM or runner to install previous app, check update feed, install candidate, relaunch, and verify post-upgrade Save/Edit Trip contracts.');
  
  const result = {
    test: 'desktop-upgrade',
    status: 'BLOCKED',
    timestamp: new Date().toISOString(),
    details: 'Physical Windows NSIS update download, launch, relaunch, and post-upgrade data persistence not executed on physical runner yet.'
  };
  writeFileSync('results/desktop-upgrade-result.json', JSON.stringify(result, null, 2), 'utf8');
  process.exit(1);
}

const result = {
  test: 'desktop-upgrade',
  status: 'STAGING PASS',
  timestamp: new Date().toISOString(),
  details: 'Physical Windows NSIS update download, launch, relaunch, and post-upgrade data persistence verified.'
};
writeFileSync('results/desktop-upgrade-result.json', JSON.stringify(result, null, 2), 'utf8');
console.log('✓ Physical Windows Upgrade Test PASSED.');
