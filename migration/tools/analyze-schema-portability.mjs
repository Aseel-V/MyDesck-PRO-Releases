import { readFileSync,readdirSync } from 'node:fs';
import pg from 'pg';
import { localConfig } from './lib/staging-source.mjs';
import { writeReport } from './lib/write-report.mjs';
const source=JSON.parse(readFileSync('migration/reports/staging-schema-plan.json','utf8'));
const baseline=JSON.parse(readFileSync('migration/reports/staging-local-validation.json','utf8'));
const url=new URL(localConfig().PGURL);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('LOCAL_ONLY');
url.pathname='/'+baseline.database;
const c=new pg.Client({connectionString:url.toString()});await c.connect();
let columns,functions;
try{
  await c.query('BEGIN READ ONLY');
  columns=(await c.query(`SELECT c.relname AS table_name,a.attname AS column_name,
    format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attgenerated AS generated,a.attidentity AS identity
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
  functions=(await c.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND NOT EXISTS
      (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg WHERE cfg LIKE 'search_path=%') ORDER BY p.proname`)).rows;
  await c.query('ROLLBACK');
}finally{await c.end();}
const shared=new Set(baseline.targetTables.filter(t=>source.columns.some(x=>x.table_name===t)));
const differences=[];
for(const s of source.columns.filter(x=>shared.has(x.table_name))){
  const t=columns.find(x=>x.table_name===s.table_name&&x.column_name===s.column_name);
  if(!t)differences.push({table:s.table_name,column:s.column_name,gap:'SOURCE_ONLY_COLUMN',source:s,target:null});
  else for(const field of ['type','not_null','generated','identity'])if(s[field]!==t[field])differences.push({table:s.table_name,column:s.column_name,gap:field,source:s[field],target:t[field]});
}
for(const t of columns.filter(x=>shared.has(x.table_name)))if(!source.columns.some(s=>s.table_name===t.table_name&&s.column_name===t.column_name)){
  differences.push({table:t.table_name,column:t.column_name,gap:'TARGET_ONLY_COLUMN',source:null,target:t});
}
const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
const platform=[];
for(const file of migrations){const sql=readFileSync('supabase/migrations/'+file,'utf8');
  if(/storage\.(objects|buckets|foldername)|supabase_realtime/.test(sql))platform.push({file,
    storage:/storage\.(objects|buckets|foldername)/.test(sql),realtime:/supabase_realtime/.test(sql)});
}
const report={generatedAt:new Date().toISOString(),sourceCatalogCapturedAt:source.generatedAt,
  sourceTableCount:baseline.schemaDifference.sourcePublicTables,targetTableCount:baseline.schemaDifference.targetPublicTables,
  tableDifferences:baseline.schemaDifference,columnDifferences:differences,securityDefinersWithoutPath:functions,
  platformMigrations:platform,sourceTriggers:source.triggers.filter(x=>!x.internal),sourceSequences:source.sequences,
  noSourceSchemaWrites:true,noFakeCloudPlatformObjects:true};
writeReport('migration/reports/schema-portability-gaps.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tableDifferences:report.tableDifferences,columnDifferences:differences.length,
  details:differences.map(x=>({table:x.table,column:x.column,gap:x.gap})),definers:functions.length,platformMigrations:platform}));
