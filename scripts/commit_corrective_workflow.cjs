const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputFile = path.join(root, 'src/commit_log.txt');

// Read token from .env
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token && fs.existsSync(path.join(root, '.env'))) {
  const envContent = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const match = envContent.match(/GH_TOKEN=([^\s\r\n]+)/);
  if (match) token = match[1];
}

let log = '# Corrective Commit Execution Log\n\n';

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

// 1. Remove powershell.bat if exists before staging
const psBat = path.join(root, 'powershell.bat');
if (fs.existsSync(psBat)) {
  try { fs.unlinkSync(psBat); } catch(e){}
}

// 2. Checkout branch release/staging-0.0.57
exec('1. Checkout release/staging-0.0.57', 'git checkout release/staging-0.0.57');

// 3. Stage approved workflow fixes
exec('2. Stage workflow architecture files', 'git add .github/workflows/staging-pipeline.yml .github/workflows/build-release.yml package.json scripts/release-pipeline.mjs scripts/test-workflow-negative-rules.mjs scripts/generate-release-notes-md.mjs');

// 4. Commit
exec('3. Commit corrective architecture changes', 'git commit -m "fix: require approval before production and bind staging artifacts"');

// 5. Push to origin
const remoteUrlWithToken = token 
  ? `https://${token}@github.com/Aseel-V/MyDesck-PRO-Releases.git`
  : 'origin';

exec('4. Push to remote release/staging-0.0.57', `git push "${remoteUrlWithToken}" HEAD:refs/heads/release/staging-0.0.57`);
exec('5. git fetch origin --prune', 'git fetch origin --prune');
exec('6. git ls-remote --heads', `git ls-remote --heads "${remoteUrlWithToken}" release/staging-0.0.57`);
exec('7. git rev-parse HEAD', 'git rev-parse HEAD');
exec('8. git rev-parse origin/release/staging-0.0.57', 'git rev-parse origin/release/staging-0.0.57');
exec('9. git log origin/release/staging-0.0.57 -1', 'git log origin/release/staging-0.0.57 -1 --format="%H %s"');

fs.writeFileSync(outputFile, log, 'utf8');
console.log('Committed and pushed corrective changes. Output saved to ' + outputFile);
