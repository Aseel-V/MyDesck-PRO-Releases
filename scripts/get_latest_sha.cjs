const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim();
const branch = execSync('git branch --show-current', { encoding: 'utf8', cwd: root }).trim();
const lsRemote = execSync('git ls-remote --heads origin release/staging-0.0.57', { encoding: 'utf8', cwd: root }).trim();
const log = execSync('git log -1 --format="%H %s"', { encoding: 'utf8', cwd: root }).trim();
const status = execSync('git status --short', { encoding: 'utf8', cwd: root }).trim();

const target = path.join(root, 'src/commit_log.txt');
fs.writeFileSync(target, `BRANCH=${branch}\nSHA=${sha}\nLS_REMOTE=${lsRemote}\nLOG=${log}\nSTATUS=${status || 'CLEAN'}\n`, 'utf8');
console.log('Saved latest info to ' + target);
