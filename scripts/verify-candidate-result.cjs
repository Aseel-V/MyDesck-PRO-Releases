const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let log = '';
function run(name, cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    log += `=== ${name} ===\n${out}\n\n`;
  } catch (e) {
    log += `=== ${name} (ERROR) ===\n${e.message}\nSTDOUT: ${e.stdout || ''}\nSTDERR: ${e.stderr || ''}\n\n`;
  }
}

run('BRANCH', 'git rev-parse --abbrev-ref HEAD');
run('HEAD SHA', 'git rev-parse HEAD');
run('ORIGIN BRANCH SHA', 'git rev-parse origin/release/staging-0.0.57');
run('LAST COMMIT', 'git log -1 --pretty=fuller');
run('STATUS', 'git status -s');
run('LS REPOSITORIES', 'git remote -v');

const file = path.join(__dirname, 'candidate-result-log.txt');
fs.writeFileSync(file, log, 'utf8');
console.log('Result saved to ' + file);
