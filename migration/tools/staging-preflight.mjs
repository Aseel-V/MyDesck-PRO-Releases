import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeReport } from './lib/write-report.mjs';

const git = args => execFileSync('git', args, { maxBuffer: 50_000_000, stdio: ['ignore','pipe','pipe'] });
const hash = value => createHash('sha256').update(value).digest('hex');
const start = JSON.parse(readFileSync('migration/staging.local/preflight.json','utf8'));
const stagedPaths = git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
const baselineEntries = Buffer.from(start.staged,'base64').toString().split('\0').filter(Boolean);
const currentEntries = new Set(git(['ls-files','--stage','-z']).toString().split('\0').filter(Boolean));
const patterns = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['database_password_url', /postgres(?:ql)?:\/\/[^\s:'"<>]+:[^\s@'"<>]{8,}@/],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['supabase_secret', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
];
const findings = [];
const files = git(['ls-files','-z']).toString().split('\0').filter(Boolean);
const blobs=execFileSync('git',['cat-file','--batch'],{
  input:files.map(file=>':'+file).join('\n')+'\n',maxBuffer:150_000_000,stdio:['pipe','pipe','pipe']});
let offset=0;
for (const file of files) {
  const newline=blobs.indexOf(10,offset);
  const size=Number(blobs.subarray(offset,newline).toString().split(' ')[2]);
  if (!Number.isSafeInteger(size)) throw new Error('INDEX_SCAN_FAILED');
  const content=blobs.subarray(newline+1,newline+1+size).toString();
  offset=newline+size+2;
  for (const [rule, pattern] of patterns) {
    const scanned = rule==='private_key' ? content.replaceAll('-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----\\n','') : content;
    if (pattern.test(scanned)) findings.push({ path:file, rule });
  }
  // Supabase legacy service_role keys must not be confused with publishable anon keys.
  for (const token of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try { if (JSON.parse(Buffer.from(token[1],'base64url')).role === 'service_role') findings.push({path:file,rule:'service_role_jwt'}); } catch {}
  }
}
const report = { generatedAt:new Date().toISOString(), startingCommit:start.head,
  currentCommit:git(['rev-parse','HEAD']).toString().trim(),
  branch:git(['branch','--show-current']).toString().trim(), recoveryTag:start.tag,
  recoveryTagCommit:git(['rev-parse',start.tag]).toString().trim(),
  previousRecoveryTags:git(['tag','--list','recovery/*']).toString().trim().split('\n').filter(x=>x!==start.tag),
  unrelatedStagedPaths:start.count, currentStagedPaths:stagedPaths.length,
  baselineIndexEntriesPreserved:baselineEntries.every(x=>currentEntries.has(x)),
  unrelatedWorktreeBytesPreserved:start.working.every(x=>hash(readFileSync(x.path))===x.sha256),
  localEnvironmentIgnored:git(['check-ignore','migration/.env.local']).toString().trim()==='migration/.env.local',
  secretScan:{ scope:'current index; pattern scan, not a guarantee about history or unknown secret formats',
    pathsScanned:files.length, findings },
};
writeReport('migration/reports/staging-preflight.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
process.exitCode = !report.baselineIndexEntriesPreserved || !report.unrelatedWorktreeBytesPreserved || findings.length ? 2 : 0;
