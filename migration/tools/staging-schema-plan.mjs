import { readFileSync } from 'node:fs';
import { withSourceSnapshot, localConfig } from './lib/staging-source.mjs';
import { writeReport } from './lib/write-report.mjs';

const report={generatedAt:new Date().toISOString(),status:'BLOCKED',scope:'catalog only; no business rows or function bodies',sourceSafety:{}};
try {
  await withSourceSnapshot(localConfig(),async select=>{
    report.columns=(await select(`SELECT n.nspname AS schema,c.relname AS table_name,
      a.attname AS column_name,a.attnum AS ordinal,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS not_null,a.attgenerated AS generated,a.attidentity AS identity
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY c.relname,a.attnum`)).rows;
    report.primaryKeys=(await select(`SELECT rel.relname AS table_name,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(id,ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.id ORDER BY k.ord) AS columns
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace
      WHERE n.nspname='public' AND c.contype='p' ORDER BY rel.relname`)).rows;
    report.triggers=(await select(`SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,
      t.tgisinternal AS internal,p.proname AS function_name,nf.nspname AS function_schema
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace nf ON nf.oid=p.pronamespace
      WHERE n.nspname='public' ORDER BY c.relname,t.tgname`)).rows.map(x=>({...x,
        importClassification:x.internal?'SAFE DURING IMPORT':'BLOCKED',
        reason:x.internal?'Keep FK/constraint enforcement enabled':'Review function on disposable target before import; no trigger disabled on source'}));
    report.sequences=(await select(`SELECT c.relname AS table_name,a.attname AS column_name,s.relname AS sequence_name,
      sn.nspname AS sequence_schema,seq.seqincrement::text AS increment,seq.seqmin::text AS minimum,
      seq.seqmax::text AS maximum,seq.seqcycle AS cycle
      FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
      JOIN pg_namespace sn ON sn.oid=s.relnamespace
      JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
      JOIN pg_sequence seq ON seq.seqrelid=s.oid
      WHERE n.nspname='public' AND d.deptype IN ('a','i') ORDER BY c.relname,a.attname`)).rows;
    report.unvalidatedForeignKeys=(await select(`SELECT c.conname AS name,rel.relname AS table_name
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace n ON n.oid=rel.relnamespace
      WHERE n.nspname='public' AND c.contype='f' AND NOT c.convalidated ORDER BY rel.relname,c.conname`)).rows;
    report.status='CATALOG_CAPTURED_IMPORT_BLOCKED';
  },report.sourceSafety);
} catch(error) {report.blocker=/^[A-Z_]+$/.test(error.message)?error.message:'CATALOG_READ_FAILED';}

const source=JSON.parse(readFileSync('migration/reports/staging-source-inventory.json','utf8'));
const direct=new Map(source.directSyntheticCounts.map(x=>[x.table,x]));
const reachable=new Set(['auth.users']);
let changed=true;
while(changed){changed=false;for(const f of source.foreignKeys){
  if(reachable.has(f.parent_schema+'.'+f.parent_table)&&!reachable.has(f.child_schema+'.'+f.child_table)){
    reachable.add(f.child_schema+'.'+f.child_table);changed=true;
  }
}}
report.dependencyPlan=source.tables.map(t=>({table:'public.'+t.name,
  primaryKey:report.primaryKeys?.find(x=>x.table_name===t.name)?.columns??[],
  directSyntheticReferenceCount:direct.get(t.name)?.count??null,
  reachableFromAuth:reachable.has('public.'+t.name),
  dependencies:source.foreignKeys.filter(f=>f.child_table===t.name),
  selectedPrimaryKeys:[], sourceRowCount:null, targetRowCount:null,
  status:'BLOCKED',reason:direct.has(t.name)?'No synthetic rows directly reference the approved identities; no business slice exported':
    'Dependency metadata accounted for; row selection has not been executed; no MATCH claim'}));
report.unreachableTables=report.dependencyPlan.filter(x=>!x.reachableFromAuth).map(x=>x.table);
writeReport('migration/reports/staging-schema-plan.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,columns:report.columns?.length,triggers:report.triggers?.length,
  sequences:report.sequences?.length,unvalidatedForeignKeys:report.unvalidatedForeignKeys,
  unreachableTables:report.unreachableTables,blocker:report.blocker}));
process.exitCode=report.blocker?2:0;
