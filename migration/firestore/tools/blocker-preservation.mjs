#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { redactSecretText, scanSecretText } from '../lib/secret-scanner.mjs';

const baseline = JSON.parse(readFileSync('migration/blocker-closure.local/baseline.json', 'utf8'));
const git = (args, options = {}) => execFileSync('git', args,
  { encoding: options.encoding ?? 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
const currentMeta = new Map(rows.map((row) => { const tab = row.indexOf('\t'); return [row.slice(tab + 1), row.slice(0, tab)]; }));
const authorized = 'src/commit_log.txt';
let preserved = 0;
for (const item of baseline.paths) {
  const meta = currentMeta.get(item.path);
  if (!meta) throw new Error(`BASELINE_PATH_MISSING:${item.path}`);
  const [mode, indexBlob, stage] = meta.split(' ');
  if (item.path === authorized) {
    const original = git(['cat-file', 'blob', item.indexBlob]);
    const currentIndex = git(['show', `:${authorized}`]);
    const currentWorking = readFileSync(authorized, 'utf8').replaceAll('\r\n', '\n');
    const expected = redactSecretText(original).replace('[REDACTED-COMPROMISED-CREDENTIAL]',
      '[REDACTED-COMPROMISED-GITHUB-TOKEN]');
    if (currentIndex !== expected || currentWorking !== expected) throw new Error('AUTHORIZED_SECRET_EDIT_CHANGED_OTHER_CONTENT');
    if (scanSecretText(currentIndex, authorized).length) throw new Error('SECRET_REMAINS_IN_INDEX');
    continue;
  }
  const bytes = readFileSync(item.path);
  const workingSha256 = createHash('sha256').update(bytes).digest('hex');
  if (mode !== item.mode || indexBlob !== item.indexBlob || Number(stage) !== item.stage
    || workingSha256 !== item.workingSha256 || bytes.length !== item.size)
    throw new Error(`STAGED_BASELINE_CHANGED:${item.path}`);
  preserved += 1;
}
console.log(JSON.stringify({ baseline: baseline.count, byteIdenticalUnrelated: preserved,
  authorizedSecretFileEdits: 1, secretFileOtherContentPreserved: true, activeSecretInIndex: false }));
