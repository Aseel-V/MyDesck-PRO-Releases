const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Clean up scratch debug files
const filesToRemove = [
  'powershell.bat',
  'src/head_info.txt',
  'src/auth_push_log.txt',
  'src/git_output.json',
  'docs/auth_push_log.md',
  'docs/git_raw_results.md',
  'docs/raw_push_verification.md',
  'scripts/capture_raw_git.js',
  'scripts/do_candidate_commit_and_push.cjs',
  'scripts/execute-git-operations.js',
  'scripts/push_with_auth.cjs',
  'scripts/raw_git_runner.cjs',
  'scripts/read_git_head.cjs',
  'scripts/run_git.js',
  'scripts/run_git_capture.bat',
  'scripts/verify-real-git.cjs',
  'scripts/write_git_info.cjs',
  'scripts/write_home_git.js',
  'scripts/debug-cwd.js'
];

for (const relPath of filesToRemove) {
  const fullPath = path.join(root, relPath);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {}
  }
}

// Write final clean status verification report to src/head_info.txt
try {
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim();
  const branch = execSync('git branch --show-current', { encoding: 'utf8', cwd: root }).trim();
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token && fs.existsSync(path.join(root, '.env'))) {
    const match = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/GH_TOKEN=([^\s\r\n]+)/);
    if (match) token = match[1];
  }
  const remoteUrl = token ? `https://${token}@github.com/Aseel-V/MyDesck-PRO-Releases.git` : 'origin';
  const lsRemote = execSync(`git ls-remote --heads "${remoteUrl}" release/staging-0.0.57`, { encoding: 'utf8', cwd: root }).trim();
  const log = execSync('git log -1 --format="%H %s"', { encoding: 'utf8', cwd: root }).trim();
  const status = execSync('git status --short', { encoding: 'utf8', cwd: root }).trim();

  const report = `BRANCH=${branch}\nSHA=${sha}\nLS_REMOTE=${lsRemote}\nLOG=${log}\nSTATUS=${status || 'CLEAN'}\n`;
  fs.writeFileSync(path.join(root, 'src/head_info.txt'), report, 'utf8');
} catch (err) {
  console.error(err.message);
}
