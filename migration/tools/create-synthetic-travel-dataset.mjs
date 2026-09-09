import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes,randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readPrivate,savePrivate } from './lib/cloud-control.mjs';
import { localConfig,withSourceSnapshot } from './lib/staging-source.mjs';
import { openKeylessAdmin,lookupOrAbsent } from './lib/keyless-admin.mjs';
import { buildImportRecord } from './lib/auth-classify.mjs';
import { writeReport } from './lib/write-report.mjs';

if(!process.argv.includes('--execute-approved-synthetic'))throw new Error('EXPLICIT_SYNTHETIC_FLAG_REQUIRED');
const config={};
for(const path of ['.env','migration/.env.local'])if(existsSync(path)){
  const env=parseEnv(readFileSync(path,'utf8'));
  for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','FIREBASE_WEB_API_KEY'])if(env[key])config[key]=env[key];
}
assert.equal(config.VITE_SUPABASE_URL,'https://pubugnfaqqukelvgckdr.supabase.co');
process.env.GOOGLE_CLOUD_PROJECT='mydesckpro';process.env.FIREBASE_PROJECT_ID='mydesckpro';
const local=readPrivate();
if(!local.dataset){
  const runId=new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+randomUUID().slice(0,8);
  local.dataset={runId,users:['a','b'].map(label=>({label,email:`migration-test--travel-${runId}-${label}@example.test`,
    password:randomBytes(28).toString('base64url')+'!7a',steps:{},trips:[]}))};savePrivate(local);
}
const dataset=local.dataset;
const manifestPath='migration/reports/full-staging-cleanup-manifest.json';
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):
  {runId:dataset.runId,deletionApproved:false,identities:[],businesses:[],trips:[],cleanupStatus:'retained_pending_approval'};
assert.equal(manifest.runId,dataset.runId);assert.equal(manifest.deletionApproved,false);
const report={generatedAt:new Date().toISOString(),runId:dataset.runId,status:'BLOCKED',realCustomerChanges:0,
  creationPath:'Supabase signup, profile PostgREST inserts, save_trip_transaction and audited payment RPCs',
  dataset:[],sourceSafety:{},failures:[]};
const save=()=>{savePrivate(local);writeReport(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  writeReport('migration/reports/synthetic-travel-dataset.json',JSON.stringify(report,null,2)+'\n');};
const step=async(user,key,work)=>{
  if(user.steps[key]==='DONE')return;
  if(user.steps[key]==='PENDING')throw new Error('AMBIGUOUS_MUTATION_REQUIRES_READ_RECONCILIATION_'+key);
  user.steps[key]='PENDING';save();
  try{await work();user.steps[key]='DONE';save();}
  catch(error){if(error.definiteRejection)user.steps[key]='REJECTED';save();throw error;}
};
const api=async(user,path,method='GET',body)=>{
  const r=await fetch(config.VITE_SUPABASE_URL+path,{method,
    headers:{apikey:config.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+(user?.token??config.VITE_SUPABASE_ANON_KEY),
      'Content-Type':'application/json',Prefer:'return=representation'},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),redirect:'error'});
  const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{throw new Error('API_RESPONSE_INVALID');}
  if(!r.ok){
    const constraint=/violates check constraint "([a-zA-Z0-9_]+)"/.exec(data?.message??'')?.[1];
    throw Object.assign(new Error('SYNTHETIC_API_'+r.status+'_'+String(data?.code??data?.error_code??'REJECTED').replace(/[^A-Z0-9_]/gi,'')+(constraint?'_'+constraint:'')),{definiteRejection:r.status>=400&&r.status<500});
  }
  return data;
};
let firebase;
try {
  firebase=openKeylessAdmin();
  for(const user of dataset.users){
    assert.ok(user.email.startsWith('migration-test--travel-'));
    await step(user,'signup',async()=>{
      await withSourceSnapshot(localConfig(),async select=>{
        assert.equal((await select('SELECT id::text FROM auth.users WHERE email=$1',[user.email])).rows.length,0);
      },report.sourceSafety);
      assert.equal(await lookupOrAbsent(()=>firebase.auth.getUserByEmail(user.email)),null);
      const body=await api(null,'/auth/v1/signup','POST',{email:user.email,password:user.password});
      const created=body.user??body;assert.equal(created.email,user.email);assert.ok(created.id);
      user.uid=created.id;user.token=body.access_token;
      manifest.identities.push({uid:user.uid,email:user.email,source:'Supabase',created_at:created.created_at,cleanup_status:'retained_pending_approval'});
    });
    const session=await api(null,'/auth/v1/token?grant_type=password','POST',{email:user.email,password:user.password});
    assert.equal(session.user?.id,user.uid);user.token=session.access_token;save();
    await step(user,'business',async()=>{
      const rows=await api(user,'/rest/v1/business_profiles','POST',{user_id:user.uid,
        business_name:'migration-test--'+(user.label==='a'?'رحلات ألف / טיולי א / Tenant A':'رحلات باء / טיולי ב / Tenant B'),
        preferred_currency:'ILS',preferred_language:user.label==='a'?'ar':'he'});
      assert.equal(rows.length,1);assert.equal(rows[0].user_id,user.uid);user.businessId=rows[0].id;
      manifest.businesses.push({id:user.businessId,user_id:user.uid});
    });
    await step(user,'profile',async()=>{
      await api(user,'/rest/v1/user_profiles','POST',{user_id:user.uid,full_name:'migration-test--Tenant '+user.label,role:'user',is_suspended:false});
    });
    for(const [index,currency] of [[0,'ILS'],[1,'EUR']]){
      user.requests??={};user.requests[index]??=randomUUID();save();
      await step(user,'trip_'+index,async()=>{
        const result=await api(user,'/rest/v1/rpc/save_trip_transaction','POST',{
          p_trip_data:{user_id:user.uid,client_name:'migration-test-- عميل לדוגמה '+user.label+' '+index,
            destination:index===0?'القدس / ירושלים / Jerusalem':'Paris / باريس / פריז',
            start_date:'2026-12-01',end_date:'2026-12-08',currency,exchange_rate:'1',
            sale_price:index===0?'1234.57':'918.43',wholesale_cost:index===0?'987.13':'711.29',amount_paid:'0',
            payment_method:index===0?'mixed':'cash',payment_status:'unpaid',status:'active',
            travelers_count:2,travelers:[{full_name:'migration-test-- مسافر ראשון '+user.label,nationality:'TEST'},
              {full_name:'migration-test-- Traveler שני '+user.label,nationality:'TEST'}],
            notes:'Synthetic migration proof only; no real passenger or contact information',payments:[],itinerary:[]},
          p_payment_plan:{method:index===0?'mixed':'cash',currency,
            cardTotalMinor:index===0?'100001':'0',cashTotalMinor:index===0?'23456':'91843',
            confirmedCashMinor:'0',installmentCount:index===0?3:1,firstDate:'2026-12-01'},
          p_client_request_id:user.requests[index]});
        assert.ok(result.id);user.trips[index]=result.id;manifest.trips.push({id:result.id,user_id:user.uid,currency});
      });
      const plans=await api(user,'/rest/v1/trip_payment_plans?select=id&trip_id=eq.'+user.trips[index]);
      assert.equal(plans.length,1);const planId=plans[0].id;
      await step(user,'cash_'+index,()=>api(user,'/rest/v1/rpc/record_trip_cash_payment','POST',{
        p_payment_plan_id:planId,p_paid_amount_minor:index===0?'12003':'27011',p_paid_at:'2026-09-09T12:00:00Z',p_notes:'migration-test--partial cash'}));
      if(index===0){
        const installments=await api(user,'/rest/v1/trip_installments?select=id&payment_plan_id=eq.'+planId+'&order=installment_number');
        assert.equal(installments.length,3);
        for(const [event,amount] of [[1,'11111'],[2,'22223']])await step(user,'installment_'+event,()=>api(user,'/rest/v1/rpc/record_trip_installment_payment','POST',{
          p_installment_id:installments[0].id,p_paid_amount_minor:amount,p_paid_at:`2026-09-0${6+event}T12:00:00Z`,p_notes:'migration-test--receipt '+event}));
      }else await step(user,'archive',()=>api(user,'/rest/v1/trips?id=eq.'+user.trips[index]+'&user_id=eq.'+user.uid,'PATCH',
        {status:'archived'}));
    }
    await step(user,'firebase_import',async()=>{
      assert.equal(await lookupOrAbsent(()=>firebase.auth.getUser(user.uid)),null);
      assert.equal(await lookupOrAbsent(()=>firebase.auth.getUserByEmail(user.email)),null);
      await withSourceSnapshot(localConfig(),async select=>{
        const {rows}=await select('SELECT id,email,encrypted_password,email_confirmed_at FROM auth.users WHERE id=$1 AND email=$2',[user.uid,user.email]);
        assert.equal(rows.length,1);const record=buildImportRecord(rows[0]);
        try{const r=await firebase.auth.importUsers([record],{hash:{algorithm:'BCRYPT'}});assert.equal(r.successCount,1);assert.equal(r.failureCount,0);}
        finally{record.passwordHash?.fill(0);rows[0].encrypted_password=null;}
      },report.sourceSafety);
      manifest.identities.push({uid:user.uid,email:user.email,source:'Firebase',cleanup_status:'retained_pending_approval'});
    });
    report.dataset.push({uid:user.uid,businessId:user.businessId,tripIds:user.trips,steps:user.steps});save();
  }
  report.status='CREATED';
}catch(error){report.failures.push(/^[A-Z0-9_]+$/.test(error.message)?error.message:'SYNTHETIC_DATASET_ASSERTION_FAILED');}
finally{if(firebase)await firebase.close();save();}
console.log(JSON.stringify({status:report.status,users:manifest.identities.filter(x=>x.source==='Supabase').length,
  businesses:manifest.businesses.length,trips:manifest.trips.length,failures:report.failures}));
process.exitCode=report.status==='CREATED'?0:2;
