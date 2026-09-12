#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('migration/production-prep.local/staged-baseline.json', 'utf8'));
const rows = execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean);
const current = new Map(rows.map((row) => { const tab = row.indexOf('\t'); return [row.slice(tab + 1), row.slice(0, tab)]; }));
for (const item of baseline.paths) {
  const meta = current.get(item.path);
  if (!meta) throw Error(`STAGED_BASELINE_PATH_MISSING:${item.path}`);
  const [mode, blob, stage] = meta.split(' ');
  if (mode !== item.mode || blob !== item.blob || Number(stage) !== item.stage) throw Error(`STAGED_BASELINE_CHANGED:${item.path}`);
}
const canonical = baseline.paths.map((x) => `${x.path}\0${x.mode}\0${x.blob}\0${x.stage}\n`).join('');
const hash = createHash('sha256').update(canonical).digest('hex');
if (hash !== baseline.overallManifestSha256) throw Error('STAGED_MANIFEST_HASH_MISMATCH');
console.log(JSON.stringify({ baseline: baseline.count, preserved: baseline.paths.length, overallManifestSha256: hash }));
