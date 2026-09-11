#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeReport } from '../../tools/lib/write-report.mjs';

const root='src';
const files=[];
const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(/\.(ts|tsx)$/.test(entry.name)&&!entry.name.includes('.test.'))files.push(path);}};
walk(root);
const kinds={from:/supabase\s*\.\s*from/g,rpc:/supabase\s*\.\s*rpc/g,storage:/supabase\s*\.\s*storage/g,channel:/supabase\s*\.\s*channel/g,auth:/supabase\s*\.\s*auth/g};
const travelPath=/([\\/]trips[\\/]|trip|travel|analyticsQueries|pdfGenerator|businessImages|Settings)/i;
const entries=[];
for(const path of files){const text=readFileSync(path,'utf8');for(const [kind,pattern] of Object.entries(kinds)){const count=(text.match(pattern)||[]).length;if(!count)continue;const file=relative('.',path).replaceAll('\\','/');const classification=file.includes('/data/Supabase')?'ADAPTER_ONLY':travelPath.test(file)?'BLOCKED':'DEFERRED';entries.push({file,kind,count,classification});}}
const totals=Object.fromEntries(Object.keys(kinds).map(kind=>[kind,entries.filter(e=>e.kind===kind).reduce((n,e)=>n+e.count,0)]));
const classes=Object.fromEntries(['MIGRATED','ADAPTER_ONLY','BLOCKED','DEFERRED','DEAD'].map(c=>[c,entries.filter(e=>e.classification===c).reduce((n,e)=>n+e.count,0)]));
const report={generatedAt:new Date().toISOString(),scope:'production src runtime exact supabase.<api> call sites',totals,total: Object.values(totals).reduce((a,b)=>a+b,0),classes,entries};
writeReport('migration/reports/firestore-runtime-burndown.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
