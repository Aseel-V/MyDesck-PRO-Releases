import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (e) {
    return `ERROR: ${e.message}\n${e.stdout || ''}\n${e.stderr || ''}`;
  }
}

const res = {
  currentBranch: run('git rev-parse --abbrev-ref HEAD'),
  lastCommitHash: run('git rev-parse HEAD'),
  lastCommitMessage: run('git log -1 --pretty=%B'),
  statusShort: run('git status -s'),
  remoteBranches: run('git branch -r'),
  tags: run('git tag -l "v0.0.5*"')
};

const outFile = path.resolve('git-log-res.json');
fs.writeFileSync(outFile, JSON.stringify(res, null, 2), 'utf8');
console.log('Saved ' + outFile);
