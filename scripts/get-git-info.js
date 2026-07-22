const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outFile = path.join(__dirname, '../docs/final-git-info.txt');
let log = '';

function runCmd(name, cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    log += `${name}: ${out}\n`;
  } catch (e) {
    log += `${name}: ERROR (${e.message})\n`;
  }
}

runCmd('BRANCH', 'git branch --show-current');
runCmd('HEAD_SHA', 'git rev-parse HEAD');
runCmd('REMOTE_SHA', 'git rev-parse origin/release/staging-0.0.57');
runCmd('REMOTE_TRACKING', 'git rev-parse --abbrev-ref --symbolic-full-name @{u}');
runCmd('LAST_COMMIT', 'git log -1 --oneline --decorate');
runCmd('STATUS', 'git status -s');

fs.writeFileSync(outFile, log, 'utf8');
console.log('Written to ' + outFile);
