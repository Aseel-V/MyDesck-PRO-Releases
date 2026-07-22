const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputFile = path.join(root, 'src/commit_log.txt');

let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token && fs.existsSync(path.join(root, '.env'))) {
  const envContent = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const match = envContent.match(/GH_TOKEN=([^\s\r\n]+)/);
  if (match) token = match[1];
}

let log = '# Force Commit Execution Log\n\n';

function exec(name, cmd) {
  log += `========================================\n${name}\n========================================\n`;
  log += `Command: ${cmd.replace(/https:\/\/[^@]+@/g, 'https://<TOKEN>@')}\n`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    log += stdout || '(empty stdout)';
    log += `\nExit Code: 0\n\n`;
  } catch (err) {
    log += `STDOUT:\n${err.stdout || ''}\n`;
    log += `STDERR:\n${err.stderr || ''}\n`;
    log += `Exit Code: ${err.status || err.code || 1}\n\n`;
  }
}

// 1. Remove powershell.bat if present
if (fs.existsSync(path.join(root, 'powershell.bat'))) {
  try { fs.unlinkSync(path.join(root, 'powershell.bat')); } catch(e){}
}

exec('1. Add all workflow & script modifications', 'git add .github/workflows/staging-pipeline.yml .github/workflows/build-release.yml package.json package-lock.json scripts/aggregate-staging-evidence.mjs scripts/verify-desktop-updater-metadata.mjs scripts/verify-desktop-updater-staging.mjs scripts/verify-desktop-upgrade-physical.mjs scripts/verify-staging-database.mjs scripts/test-staging-e2e.mjs scripts/verify-desktop-release-assets.mjs scripts/test-workflow-negative-rules.mjs docs/RELEASE_SYSTEM_ARCHITECTURE.md');

exec('2. Commit changes', 'git commit -m "fix: require real staging upgrade and evidence results"');

const remoteUrlWithToken = token 
  ? `https://${token}@github.com/Aseel-V/MyDesck-PRO-Releases.git`
  : 'origin';

exec('3. Push to remote release/staging-0.0.57', `git push "${remoteUrlWithToken}" HEAD:refs/heads/release/staging-0.0.57`);
exec('4. git fetch origin --prune', 'git fetch origin --prune');
exec('5. git ls-remote --heads', `git ls-remote --heads "${remoteUrlWithToken}" release/staging-0.0.57`);
exec('6. git rev-parse HEAD', 'git rev-parse HEAD');
exec('7. git log origin/release/staging-0.0.57 -1', 'git log origin/release/staging-0.0.57 -1 --format="%H %s"');

fs.writeFileSync(outputFile, log, 'utf8');
console.log('Saved log to ' + outputFile);
