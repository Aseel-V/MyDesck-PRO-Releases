#!/usr/bin/env node
// Compile supplied source via projects.test. No ruleset/release creation, deployment or data requests.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = 'migration/reports/rules-null-map-fix';
const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
let token;
try {
  token = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
    [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
} catch { throw Error('GCLOUD_AUTH_FAILED_NO_CREDENTIAL_OUTPUT'); }
const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': 'mydesckpro', 'Content-Type': 'application/json' };
const base = 'https://firebaserules.googleapis.com/v1/projects/mydesckpro';
async function release() {
  const r = await fetch(`${base}/releases/cloud.firestore/default`, { headers });
  if (!r.ok) throw Error(`RELEASE_READ_FAILED:${r.status}`);
  return r.json();
}
const before = await release();
const results = [];
for (const [label, path] of [['previous', `${root}/previous-candidate.rules`], ['candidate', 'migration/firestore/rules/firestore.rules']]) {
  const content = readFileSync(path, 'utf8');
  const r = await fetch(`${base}:test`, { method: 'POST', headers,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } }) });
  const body = await r.json();
  const result = { label, path, sha256: createHash('sha256').update(content).digest('hex'), http: r.status,
    issues: body.issues ?? [], error: body.error?.status ?? null };
  results.push(result);
  console.log(JSON.stringify(result));
}
const after = await release();
const report = { generatedAt: new Date().toISOString(), endpoint: 'projects.test (source compilation only)',
  productionMutations: 0, releaseBefore: before, releaseAfter: after,
  releaseUnchanged: before.rulesetName === after.rulesetName && before.updateTime === after.updateTime, results };
writeFileSync(`${root}/compilation.json`, `${JSON.stringify(report, null, 2)}\n`);
// Type diagnostics may be labelled WARNING by this API even when Console refuses publication.
if (!report.releaseUnchanged || results[1].http !== 200
  || results[1].issues.some(i => i.severity !== 'WARNING' || !i.description.startsWith('Unused function: '))) process.exitCode = 1;
