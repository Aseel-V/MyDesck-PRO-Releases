import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { localConfig,withSourceSnapshot,qi } from './lib/staging-source.mjs';
import { privateDirectory } from './lib/cloud-control.mjs';
import { tableDigest,rowKey,financialGroups,orphanKeys,eventOrder } from './lib/staging-reconcile.mjs';
import { writeReport } from './lib/write-report.mjs';

const manifest=JSON.parse(readFileSync('migration/reports/full-staging-cleanup-manifest.json','utf8'));
const users=manifest.identities.filter(x=>x.source==='Supabase');
assert.equal(users.length,2);assert.equal(manifest.deletionApproved,false);
assert.ok(users.every(x=>x.email.startsWith('migration-test--travel-')));
const uids=users.map(x=>x.uid);
const report={generatedAt:new Date().toISOString(),runId:manifest.runId,status:'BLOCKED',sourceSafety:{},
  sourceWrites:0,realCustomerRows:0,selectedUids:uids,tables:[],orphanChecks:[],blockers:[]};
const snapshot={runId:manifest.runId,tables:{},foreignKeys:[],sourceSettings:{timeZone:'UTC',dateStyle:'ISO, YMD',bytea:'hex'}};
const map=new Map(),owned=new Map(),reasons=new Map();
try {
  await withSourceSnapshot(localConfig(),async select=>{
    const columns=(await select(`SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type,a.attgenerated AS generated,a.attidentity AS identity,a.attnum AS ordinal
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
    const fks=(await select(`SELECT c.conname AS name,ns.nspname||'.'||rel.relname AS child,pn.nspname||'.'||pr.relname AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(id,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.id ORDER BY k.ord) AS "childColumns",
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(id,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.id ORDER BY k.ord) AS "parentColumns"
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_class pr ON pr.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pr.relnamespace
      WHERE c.contype='f' AND ns.nspname='public' ORDER BY rel.relname,c.conname`)).rows;
    snapshot.foreignKeys=fks;
    assert.ok(fks.every(f=>Array.isArray(f.childColumns)&&Array.isArray(f.parentColumns)),'FK_ARRAY_METADATA_INVALID');
    const pks=(await select(`SELECT rel.relname AS table_name,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(id,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.id ORDER BY k.ord) AS columns
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      WHERE c.contype='p' AND ns.nspname='public' ORDER BY rel.relname`)).rows;
    for(const table of new Set(columns.map(x=>x.table_name))){
      const key='public.'+table;
      snapshot.tables[key]={columns:columns.filter(x=>x.table_name===table).map(({name,type,generated,identity})=>({name,type,generated,identity})),
        primaryKey:pks.find(x=>x.table_name===table)?.columns??[],rows:[]};
      map.set(key,new Map());owned.set(key,new Map());reasons.set(key,new Set());
    }
    const authColumns=[['id','uuid'],['email','text'],['email_confirmed_at','timestamp with time zone'],['phone','text'],
      ['raw_app_meta_data','jsonb'],['raw_user_meta_data','jsonb'],['is_anonymous','boolean'],['banned_until','timestamp with time zone'],
      ['created_at','timestamp with time zone'],['updated_at','timestamp with time zone'],['last_sign_in_at','timestamp with time zone']].map(([name,type])=>({name,type,generated:'',identity:''}));
    const authRows=(await select(`SELECT ${authColumns.map(x=>qi(x.name)+'::text AS '+qi(x.name)).join(',')} FROM auth.users WHERE id=ANY($1::uuid[]) ORDER BY id`,[uids])).rows;
    assert.equal(authRows.length,2);assert.ok(authRows.every(x=>users.some(u=>u.uid===x.id&&u.email===x.email)));
    snapshot.tables['auth.users']={columns:authColumns,primaryKey:['id'],rows:authRows};
    map.set('auth.users',new Map(authRows.map(x=>[rowKey(x,['id']),x])));owned.set('auth.users',map.get('auth.users'));
    reasons.set('auth.users',new Set(['exact approved synthetic UID and email']));
    const selectRows=async(table,fields,tuples)=>{
      if(!snapshot.tables[table])throw new Error('EXTERNAL_SCHEMA_DEPENDENCY');
      if(!tuples.length)return[];
      const t=snapshot.tables[table];assert.ok(t.primaryKey.length,'NO_PRIMARY_KEY');
      const values=[];
      const predicate=tuples.map(tuple=>'('+fields.map((name,i)=>{values.push(tuple[i]);return qi(name)+'::text=$'+values.length;}).join(' AND ')+')').join(' OR ');
      const guards=[];
      for(const fk of fks.filter(f=>f.child===table&&f.parent==='auth.users')){
        assert.equal(fk.childColumns.length,1);values.push(uids);
        guards.push('('+qi(fk.childColumns[0])+' IS NULL OR '+qi(fk.childColumns[0])+'::text=ANY($'+values.length+'::text[]))');
      }
      for(const fk of fks.filter(f=>f.child===table&&f.parent==='public.business_profiles'&&f.childColumns.includes('business_id'))){
        assert.equal(fk.childColumns.length,1);values.push(manifest.businesses.map(x=>x.id));
        guards.push('('+qi(fk.childColumns[0])+' IS NULL OR '+qi(fk.childColumns[0])+'::text=ANY($'+values.length+'::text[]))');
      }
      const qualified=table.split('.').map(qi).join('.');
      const where='('+predicate+')'+(guards.length?' AND '+guards.join(' AND '):'');
      const count=(await select('SELECT count(*)::text AS n FROM '+qualified+' WHERE '+where,values)).rows[0].n;
      if(BigInt(count)>5000n)throw new Error('SLICE_ROW_LIMIT');
      return(await select('SELECT '+t.columns.map(x=>qi(x.name)+'::text AS '+qi(x.name)).join(',')+' FROM '+qualified+' WHERE '+where,values)).rows;
    };
    let changes=true,iterations=0;
    while(changes){
      changes=false;if(++iterations>100)throw new Error('CLOSURE_DID_NOT_CONVERGE');
      for(const fk of fks){
        // Only owned descendants cause reverse expansion. Shared ancestors do not
        // authorize exporting unrelated tenants that reference the same parent.
        const parents=[...(owned.get(fk.parent)?.values()??[])];
        if(!parents.length)continue;
        const rows=await selectRows(fk.child,fk.childColumns,parents.map(r=>fk.parentColumns.map(c=>r[c])));
        for(const row of rows){const key=rowKey(row,snapshot.tables[fk.child].primaryKey);
          if(!map.get(fk.child).has(key)){map.get(fk.child).set(key,row);owned.get(fk.child).set(key,row);changes=true;}
          reasons.get(fk.child).add('dependent via '+fk.name);
        }
      }
      for(const fk of fks){
        const children=[...(map.get(fk.child)?.values()??[])].filter(r=>fk.childColumns.every(c=>r[c]!==null));
        for(const child of children){
          const present=[...(map.get(fk.parent)?.values()??[])].some(p=>fk.parentColumns.every((c,i)=>p[c]===child[fk.childColumns[i]]));
          if(present)continue;
          if(fk.parent==='auth.users')throw new Error('NON_SYNTHETIC_IDENTITY_REFERENCE');
          const rows=await selectRows(fk.parent,fk.parentColumns,[fk.childColumns.map(c=>child[c])]);
          if(rows.length!==1)throw new Error('MISSING_OR_OUT_OF_SCOPE_PARENT');
          const row=rows[0],key=rowKey(row,snapshot.tables[fk.parent].primaryKey);
          if(!map.get(fk.parent).has(key)){map.get(fk.parent).set(key,row);changes=true;}
          reasons.get(fk.parent).add('required parent via '+fk.name+'; no sibling expansion');
        }
      }
    }
    for(const [name,t] of Object.entries(snapshot.tables)){
      t.rows=[...map.get(name).values()].sort((a,b)=>rowKey(a,t.primaryKey).localeCompare(rowKey(b,t.primaryKey)));
      report.tables.push({table:name,selectedRowCount:t.rows.length,selectedPrimaryKeys:t.rows.map(r=>t.primaryKey.map(k=>r[k])),
        dependencyReason:[...reasons.get(name)],digest:t.primaryKey.length?tableDigest(t):null});
    }
    for(const fk of fks){
      const child=snapshot.tables[fk.child]?.rows??[],parent=snapshot.tables[fk.parent]?.rows??[];
      const orphans=orphanKeys(child,parent,fk.childColumns,fk.parentColumns);
      report.orphanChecks.push({constraint:fk.name,child:fk.child,parent:fk.parent,selectedChildRows:child.length,orphans:orphans.length});
      assert.equal(orphans.length,0);
    }
    report.iterations=iterations;report.identityRows=authRows.length;
  },report.sourceSafety);
  report.rowsExported=report.tables.reduce((n,t)=>n+t.selectedRowCount,0);
  report.nonemptyTables=report.tables.filter(t=>t.selectedRowCount>0).length;
  report.financial=[];
  for(const [table,t] of Object.entries(snapshot.tables))for(const column of t.columns.filter(x=>/^(numeric|bigint|integer)/.test(x.type)&&/amount|price|cost|paid|balance|margin|total|exchange|profit/.test(x.name))){
    for(const dimensions of [[],['user_id'],['business_id'],['trip_id'],['currency'],['user_id','currency'],['trip_id','currency']]){
      if(!dimensions.every(d=>t.columns.some(c=>c.name===d)))continue;
      report.financial.push({table,column:column.name,dimensions,totals:financialGroups(t.rows,column.name,dimensions)});
    }
  }
  const trips=snapshot.tables['public.trips'].rows;
  report.coverage={users:users.length,businesses:snapshot.tables['public.business_profiles'].rows.length,trips:trips.length,
    travelers:trips.reduce((n,r)=>n+JSON.parse(r.travelers??'[]').length,0),
    currencies:[...new Set(trips.map(x=>x.currency))],installments:snapshot.tables['public.trip_installments'].rows.length,
    installmentEvents:snapshot.tables['public.trip_installment_events'].rows.length,
    paymentEvents:snapshot.tables['public.trip_payment_events'].rows.length,
    auditActivityRows:Object.entries(snapshot.tables).filter(([k])=>/audit|activity/.test(k)).reduce((n,[,t])=>n+t.rows.length,0)};
  assert.ok(report.coverage.businesses>=2&&trips.length>=4&&report.coverage.installments>=6);
  report.status='EXPORTED_SYNTHETIC_ONLY';
  // Payloads are kept outside the repository and outside the synced workspace.
  writeFileSync(join(privateDirectory,'synthetic-export.json'),JSON.stringify(snapshot));
}catch(error){report.blockers.push(/^[A-Z_]+$/.test(error.message)?error.message:'SLICE_EXPORT_ASSERTION_FAILED');report.errorCode=error.code??null;report.errorType=error.name;
  report.errorLocation=error.stack?.split('\n').find(x=>x.includes('export-synthetic-slice.mjs:'))?.trim();}
writeReport('migration/reports/synthetic-slice-export.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,rows:report.rowsExported,tables:report.nonemptyTables,coverage:report.coverage,
  safety:report.sourceSafety,blockers:report.blockers,errorCode:report.errorCode,errorType:report.errorType,errorLocation:report.errorLocation}));process.exitCode=report.status==='EXPORTED_SYNTHETIC_ONLY'?0:2;
