#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hash } from '../lib/environment-readiness.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6});
const baseline=JSON.parse(readFileSync('migration/env-blocker-closure.local/staged-baseline.json','utf8'));
const index=new Map(git('ls-files','--stage','-z').split('\0').filter(Boolean).map(row=>{
  const tab=row.indexOf('\t'); return [row.slice(tab+1),row.slice(0,tab)];
}));
for(const p of baseline.paths) {
  if(index.get(p.path)!==`${p.mode} ${p.blob} ${p.stage}`) throw Error(`PREEXISTING_INDEX_CHANGED:${p.path}`);
}
const manifest=baseline.paths.map(p=>`${p.path}\0${p.mode}\0${p.blob}\0${p.stage}\n`).join('');
if(hash(manifest)!==baseline.overallManifestSha256) throw Error('BASELINE_MANIFEST_CHANGED');
const report={generatedAt:new Date().toISOString(),branch:git('branch','--show-current').trim(),startingSha:baseline.head,
  currentSha:git('rev-parse','HEAD').trim(),recoveryTag:baseline.tag,baselineCount:baseline.count,preserved:baseline.paths.length,
  overallStagedManifestSha256:baseline.overallManifestSha256,status:'PASS'};
writeFileSync('migration/reports/firebase-env-staged-preservation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
