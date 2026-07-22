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
run('HASH', 'git rev-parse HEAD');
run('MESSAGE', 'git log -1 --pretty=%B');
run('STATUS', 'git status -s');
run('REMOTES', 'git branch -r');
run('TAGS', 'git tag -l "v0.0.5*"');

const targetPath = path.resolve(__dirname, '../docs/git-debug-log.txt');
fs.writeFileSync(targetPath, log, 'utf8');
console.log('Wrote git debug log to ' + targetPath);
