const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const file = path.join(__dirname, 'debug-cwd.txt');
let log = 'CWD: ' + process.cwd() + '\n';
try {
  log += 'BRANCH: ' + execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf8'}).trim() + '\n';
  log += 'HEAD SHA: ' + execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim() + '\n';
} catch (e) {
  log += 'GIT ERROR: ' + e.message + '\n';
}
fs.writeFileSync(file, log, 'utf8');
console.log('Saved to ' + file);
