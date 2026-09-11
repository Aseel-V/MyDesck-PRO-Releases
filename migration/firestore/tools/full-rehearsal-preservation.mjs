import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const baseline = JSON.parse(readFileSync('migration/full-rehearsal.local/baseline.json', 'utf8'));
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const stageRows = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
const byPath = new Map(stageRows.map((row) => {
  const tab = row.indexOf('\t');
  return [row.slice(tab + 1), row.slice(0, tab)];
}));
const current = baseline.paths.map((item) => {
  const meta = byPath.get(item.path);
  if (!meta) throw new Error(`STAGED_BASELINE_PATH_MISSING:${item.path}`);
  const [mode, indexBlob, stage] = meta.split(' ');
  const bytes = readFileSync(item.path);
  return { path: item.path, mode, indexBlob, stage: Number(stage),
    workingSha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
});
const canonical = current.map(({ path, mode, indexBlob, stage, workingSha256, size }) =>
  [path, mode, indexBlob, stage, workingSha256, size]);
const manifestSha256 = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
if (manifestSha256 !== baseline.manifestSha256) throw new Error('STAGED_BASELINE_CHANGED');
console.log(JSON.stringify({ preserved: baseline.count, manifestSha256, indexMatches: true,
  workingBytesMatch: true }));

