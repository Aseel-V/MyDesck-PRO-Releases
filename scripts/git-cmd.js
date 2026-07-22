import { execSync } from 'child_process';
import fs from 'fs';
const args = process.argv.slice(2).join(' ') || 'status';
console.log('Running git ' + args);
try {
  const out = execSync(`git ${args}`, { encoding: 'utf8' });
  fs.writeFileSync('git-out.txt', out, 'utf8');
  console.log('Wrote git-out.txt successfully, length: ' + out.length);
} catch (err) {
  const errMsg = err.message + '\nSTDOUT:' + (err.stdout || '') + '\nSTDERR:' + (err.stderr || '');
  fs.writeFileSync('git-out.txt', errMsg, 'utf8');
  console.log('Wrote error to git-out.txt');
}
