#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { indexReadiness, classifyIndexes } from '../lib/environment-readiness.mjs';
if(process.argv.some(a=>a.startsWith('--mode=') && a!=='--mode=plan')) throw Error('OPERATOR_INDEX_DEPLOYMENT_REQUIRED');
const required=JSON.parse(readFileSync('migration/firestore/rules/firestore.indexes.json','utf8')).indexes;
const inventory=JSON.parse(readFileSync('migration/reports/firebase-production-environment-inventory.json','utf8'));
const analysis=JSON.parse(readFileSync('migration/reports/firestore-enterprise-index-analysis.json','utf8'));
const reviews=JSON.parse(readFileSync('migration/firestore/config/index-classification.json','utf8'));
const quote=s=>`'${s.replaceAll("'","''")}'`;
// Joined by index identity, never by array position: the operator command for a spec must carry that spec's own
// reviewed classification, so reordering firestore.indexes.json cannot attach the wrong rationale to a command.
const reviewed=classifyIndexes(required,reviews.classifications,indexReadiness(required,inventory.evidence.indexes));
const indexes=reviewed.indexes.map((entry,i)=>{
  const args=['firestore','indexes','composite','create','--project=mydesckpro','--database=default',
    `--collection-group=${entry.collectionGroup}`,'--query-scope=collection',
    ...entry.fields.map(f=>`--field-config=field-path=${f.fieldPath},order=${f.order.toLowerCase()}`)];
  return {...entry,id:`candidate-${i+1}`,command:`gcloud ${args.map(quote).join(' ')}`};
});
const report={generatedAt:new Date().toISOString(),project:'mydesckpro',database:'default',mode:'plan',productionMutations:0,
  candidates:indexes.length,hardRequired:indexes.filter(i=>i.hardDryRunGate).length,
  hardReady:indexes.filter(i=>i.hardDryRunGate&&i.state==='READY').length,
  ready:indexes.filter(i=>i.state==='READY').length,creating:indexes.filter(i=>i.state==='CREATING').length,
  missing:indexes.filter(i=>i.state==='MISSING').length,error:indexes.filter(i=>i.state==='ERROR').length,indexes,
  verification:'gcloud firestore indexes composite list --project=mydesckpro --database=default --format=json',
  cleanup:'Delete only a specific index resource created by the approved operation: gcloud firestore indexes composite delete EXACT_CREATED_INDEX_RESOURCE --project=mydesckpro --database=default. Never delete preexisting indexes or use wildcard cleanup.',
  note:'Create only reviewed MISSING entries. The two hard-required trip indexes must become READY; the installment index is an explicit cost optimization. CREATING is not READY. Field overrides are outside these commands.'};
writeFileSync('migration/reports/firebase-production-index-readiness.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
