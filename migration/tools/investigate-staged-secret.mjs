import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { writeReport } from './lib/write-report.mjs';
const git=args=>execFileSync('git',args,{maxBuffer:80_000_000,stdio:['ignore','pipe','pipe']});
const file='src/commit_log.txt';
const content=git(['show',':'+file]).toString();
const matches=[...content.matchAll(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g)];
const secrets=[...new Set(matches.map(x=>x[0]))];
const objects=git(['rev-list','--objects','--all']).toString().trim().split('\n').map(x=>x.split(' ')[0]);
const historical=[];
for(let i=0;i<objects.length;i+=100){
  const batch=execFileSync('git',['cat-file','--batch'],{input:objects.slice(i,i+100).join('\n')+'\n',maxBuffer:150_000_000,stdio:['pipe','pipe','pipe']});
  let offset=0;
  while(offset<batch.length){
    const nl=batch.indexOf(10,offset);const [oid,type,length]=batch.subarray(offset,nl).toString().split(' ');
    const size=Number(length);if(!Number.isSafeInteger(size))throw new Error('HISTORY_SCAN_FAILED');
    if(type==='blob')for(const secret of secrets)if(batch.subarray(nl+1,nl+1+size).includes(Buffer.from(secret)))historical.push({object:oid,fingerprint:createHash('sha256').update(secret).digest('hex').slice(0,12)});
    offset=nl+size+2;
  }
}
let committedPath=false;try{git(['cat-file','-e','HEAD:'+file]);committedPath=true;}catch{}
const report={generatedAt:new Date().toISOString(),file,state:committedPath?'COMMITTED_AND_STAGED':'STAGED_ONLY_ADDITION',
  classification:'ACCESS_TOKEN',provider:'GitHub',status:secrets.length?'SECRET REMEDIATION REQUIRED':'NO_MATCH',
  findings:matches.map(m=>({line:content.slice(0,m.index).split('\n').length,
    prefixClass:m[0].startsWith('ghp_')?'GitHub classic personal access token':'GitHub access token',
    fingerprintSha256Prefix:createHash('sha256').update(m[0]).digest('hex').slice(0,12),
    confidence:'HIGH: provider-specific token syntax in staged content; liveness not tested'})),
  committedHistorically:historical.length>0,historicalMatchingBlobs:historical,
  historyScope:'all locally reachable Git refs; does not assert absence from deleted/unreachable objects or remote services',
  uniqueTokens:secrets.length,transmittedForValidation:false,rotated:false,historyRewritten:false,fileModified:false,
  actionRequired:'Owner must review and remove/redact the credential from this staged artifact and assess revocation; migration commits exclude this file'};
writeReport('migration/reports/staged-secret-investigation.json',JSON.stringify(report,null,2)+'\n');
const paths=git(['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
mkdirSync('migration/full-staging.local',{recursive:true});
writeFileSync('migration/full-staging.local/preflight.json',JSON.stringify({head:git(['rev-parse','HEAD']).toString().trim(),
  index:git(['ls-files','--stage','-z']).toString('base64'),paths:paths.map(path=>({path,hash:createHash('sha256').update(readFileSync(path)).digest('hex')}))},null,2));
console.log(JSON.stringify({...report,unrelatedStagedPaths:paths.length}));
