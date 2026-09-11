import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const baseline = JSON.parse(readFileSync('migration/app-layer.local/baseline.json', 'utf8'));
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
const paths = baseline.paths.map((x) => x.path);
const current = git(['ls-files', '--stage', '-z']).split('\0')
  .filter((x) => paths.includes(x.split('\t')[1])).sort();
if (JSON.stringify(current) !== JSON.stringify(baseline.entries)) throw Error('STAGED_BASELINE_CHANGED');
for (const item of baseline.paths) {
  const hash = createHash('sha256').update(readFileSync(item.path)).digest('hex');
  if (hash !== item.sha256) throw Error('STAGED_WORKING_FILE_CHANGED');
}
console.log(JSON.stringify({ preserved: paths.length, indexMatches: true, workingBytesMatch: true }));
