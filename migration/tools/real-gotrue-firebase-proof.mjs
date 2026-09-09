#!/usr/bin/env node
/** Production safe-test: exactly three NEW GoTrue users; no customer exports. */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { openKeylessAdmin, lookupOrAbsent } from './lib/keyless-admin.mjs';
import { assertTestIdentity, assertSafeToCreate, makeTestEmail } from './lib/firebase-safety.mjs';
import { parseBcrypt, buildImportRecord } from './lib/auth-classify.mjs';
import { writeReport } from './lib/write-report.mjs';
import { runRealTokenPostgres, verifyLocalProofTarget } from '../tests/real-token-postgres.mjs';

if (!process.argv.includes('--execute-synthetic')) {
  console.error('NOT RUN: --execute-synthetic is required for the authorized three-user proof.');
  process.exit(2);
}
const config = {};
const keys = ['SUPABASE_DB_URL','SUPABASE_CA_FILE','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','FIREBASE_WEB_API_KEY','PGURL'];
for (const file of ['.env','.env.local','migration/.env.local']) {
  if (!existsSync(file)) continue;
  const values=parseEnv(readFileSync(file,'utf8'));
  for(const key of keys)if(values[key])config[key]=values[key];
}
for(const key of keys)if(process.env[key])config[key]=process.env[key];
const fail = code => { throw Object.assign(new Error(code), {code}); };
for(const key of keys)if(!config[key])fail(`MISSING_${key}`);
if(config.VITE_SUPABASE_URL!=='https://pubugnfaqqukelvgckdr.supabase.co')fail('SOURCE_API_PROJECT_MISMATCH');
const sourceUrl=new URL(config.SUPABASE_DB_URL);
if(sourceUrl.hostname!=='aws-0-ap-southeast-2.pooler.supabase.com'||
  decodeURIComponent(sourceUrl.username)!=='postgres.pubugnfaqqukelvgckdr'||sourceUrl.port!=='5432')fail('SOURCE_DATABASE_PROJECT_MISMATCH');

const manifestPath='migration/reports/firebase-auth-cleanup-manifest.json';
const oldManifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if(oldManifest.identities?.length)fail('EXISTING_MANIFEST_REQUIRES_EXPLICIT_RESUME_NO_ADOPTION');
const runId=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'-'+randomUUID();
const manifest={generatedAt:new Date().toISOString(),runId,firebaseProject:'mydesckpro',supabaseProject:'pubugnfaqqukelvgckdr',
  namespace:'migration-test--',deletionApproved:false,count:0,syntheticFirebaseUsers:0,syntheticSupabaseUsers:0,
  identities:[],note:'Only identities created by this run; no automatic deletion. Pending outcomes require review.'};
const report={generatedAt:new Date().toISOString(),runId,status:'RUNNING',existingCustomerChanges:0,
  productionDataMigration:'NOT STARTED',sourceHashRowsRead:0,accounts:[],tests:[],blockers:[],
  hashStorage:'memory only',passwordStorage:'memory only',tokenStorage:'memory only'};
const reportPath='migration/reports/real-gotrue-firebase-proof.json';
const save=()=>{
  manifest.syntheticFirebaseUsers=manifest.identities.filter(x=>x.source==='Firebase'&&x.cleanup_status==='retained_pending_approval').length;
  manifest.syntheticSupabaseUsers=manifest.identities.filter(x=>x.source==='Supabase'&&x.cleanup_status==='retained_pending_approval').length;
  manifest.count=manifest.syntheticFirebaseUsers+manifest.syntheticSupabaseUsers;
  writeReport(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  writeReport(reportPath,JSON.stringify(report,null,2)+'\n');
};
const codeOf=e=>/^[a-zA-Z0-9_/-]{1,80}$/.test(e?.code??'')?e.code:'ASSERTION_OR_PROOF_FAILED';
const test=async(name,work)=>{
  try{await work();report.tests.push({name,status:'PASS'});console.log(`PASS ${name}`);}
  catch(e){report.tests.push({name,status:'FAIL',code:codeOf(e)});console.log(`FAIL ${name} (${codeOf(e)})`);}
  save();
};
let firebase,source;
const users=[];
async function sourceRead(sql,params=[]) {
  await source.query('BEGIN READ ONLY');
  try{const result=await source.query(sql,params);await source.query('COMMIT');return result;}
  catch(error){await source.query('ROLLBACK');throw error;}
}
async function absentInFirebase(identity) {
  assertTestIdentity(identity,'Firebase collision check');
  const byUid=identity.uid?await lookupOrAbsent(()=>firebase.auth.getUser(identity.uid)):null;
  const byEmail=await lookupOrAbsent(()=>firebase.auth.getUserByEmail(identity.email));
  assertSafeToCreate(identity,{byUid,byEmail});
}
let importCalls=0;
async function importSynthetic(row) {
  assertTestIdentity({uid:row.id,email:row.email},'import');
  if(!manifest.identities.some(x=>x.source==='Supabase'&&x.uid===row.id&&x.email===row.email&&x.cleanup_status==='retained_pending_approval'))fail('SOURCE_PROVENANCE_REQUIRED');
  if(!parseBcrypt(row.encrypted_password).ok)fail('MALFORMED_BCRYPT');
  // Firebase import overwrites a colliding UID; never send a duplicate payload.
  await absentInFirebase({uid:row.id,email:row.email});
  const entry={uid:row.id,email:row.email,source:'Firebase',created_at:null,cleanup_status:'creation_pending'};
  manifest.identities.push(entry);save();
  const record=buildImportRecord(row);
  try{
    importCalls++;
    const result=await firebase.auth.importUsers([record],{hash:{algorithm:'BCRYPT'}});
    if(result.successCount!==1||result.failureCount!==0){entry.cleanup_status='import_failed_needs_review';save();fail('FIREBASE_IMPORT_FAILED');}
    const actual=await firebase.auth.getUser(row.id);
    entry.created_at=new Date(actual.metadata.creationTime).toISOString();entry.cleanup_status='retained_pending_approval';save();
    assert.equal(actual.uid,row.id);assert.equal(actual.email,row.email);assert.equal(actual.emailVerified,Boolean(row.email_confirmed_at));
  }finally{record.passwordHash?.fill(0);}
}
async function login(email,password) {
  assertTestIdentity({email},'password test');
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(config.FIREBASE_WEB_API_KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),
    signal:AbortSignal.timeout(20000),redirect:'error',
  });
  const body=await response.json();
  if(!response.ok){const code=body.error?.message;return {ok:false,code:['INVALID_LOGIN_CREDENTIALS','INVALID_PASSWORD','EMAIL_NOT_FOUND','OPERATION_NOT_ALLOWED','API_KEY_INVALID'].includes(code)?code:'FIREBASE_LOGIN_FAILED'};}
  return {ok:true,uid:body.localId,token:body.idToken};
}
save();
try {
  firebase=openKeylessAdmin();report.credentials=firebase.credentials;
  await lookupOrAbsent(()=>firebase.auth.getUserByEmail(makeTestEmail('probe-'+runId,'example.test')));
  report.firebaseAdminReadOnly='PASS';save();
  report.localTarget=await verifyLocalProofTarget(config.PGURL);
  source=new pg.Client({host:sourceUrl.hostname,port:5432,user:decodeURIComponent(sourceUrl.username),
    password:decodeURIComponent(sourceUrl.password),database:'postgres',
    ssl:{rejectUnauthorized:true,ca:readFileSync(config.SUPABASE_CA_FILE,'utf8')},
    connectionTimeoutMillis:10000,statement_timeout:10000,application_name:'migration-test--gotrue-proof'});
  await source.connect();
  const permission=await sourceRead("SELECT has_column_privilege(current_user,'auth.users','encrypted_password','SELECT') AS allowed");
  assert.equal(permission.rows[0].allowed,true);
  // Prepare the complete, unique three-user plan before any source signup.
  for(const label of ['a','b','c'])users.push({label,email:makeTestEmail(runId+'-'+label,'example.test'),password:'Migration-'+randomBytes(24).toString('base64url')+'!9a'});
  for(const u of users){
    assertTestIdentity(u,'GoTrue signup');
    const existing=await sourceRead('SELECT id, email FROM auth.users WHERE lower(email) = lower($1)',[u.email]);
    if(existing.rowCount)fail('SOURCE_EMAIL_ALREADY_EXISTS');
    await absentInFirebase({email:u.email});
  }
  for(const u of users){
    // Repeat exact email absence immediately before this one signup.
    if((await sourceRead('SELECT id, email FROM auth.users WHERE lower(email) = lower($1)',[u.email])).rowCount)fail('SOURCE_EMAIL_ALREADY_EXISTS');
    const entry={uid:null,email:u.email,source:'Supabase',created_at:null,cleanup_status:'creation_pending'};
    manifest.identities.push(entry);save();
    const response=await fetch(config.VITE_SUPABASE_URL+'/auth/v1/signup',{
      method:'POST',headers:{apikey:config.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:u.email,password:u.password}),signal:AbortSignal.timeout(20000),redirect:'error',
    });
    let body=await response.json();
    if(!response.ok){entry.cleanup_status='signup_failed_needs_review';save();fail('GOTRUE_SIGNUP_HTTP_'+response.status);}
    const created=body.user??body;
    if(!created.id||created.email!==u.email||!created.created_at)fail('GOTRUE_RESPONSE_INVALID');
    u.uid=created.id;entry.uid=u.uid;entry.created_at=created.created_at;entry.cleanup_status='retained_pending_approval';
    report.accounts.push({uid:u.uid,email:u.email,source_created_at:created.created_at,emailVerified:Boolean(created.email_confirmed_at)});
    body=null;save();console.log(`CREATED synthetic GoTrue user ${u.label}`);
    const {rows}=await sourceRead('SELECT id, email, encrypted_password, email_confirmed_at FROM auth.users WHERE id = $1::uuid',[u.uid]);
    if(rows.length!==1||rows[0].email!==u.email)fail('SYNTHETIC_SOURCE_ROW_MISMATCH');
    const row=rows[0];report.sourceHashRowsRead++;
    try {
      if(!parseBcrypt(row.encrypted_password).ok)fail('GOTRUE_HASH_NOT_BCRYPT');
      report.accounts.at(-1).emailVerified=Boolean(row.email_confirmed_at);
      if(u.label==='a')await test('NC_malformed_bcrypt_before_import',async()=>{
        const before=importCalls;
        await assert.rejects(importSynthetic({...row,encrypted_password:'malformed-bcrypt'}),{code:'MALFORMED_BCRYPT'});
        assert.equal(importCalls,before);
      });
      await importSynthetic(row);report.accounts.at(-1).imported=true;
    } finally {row.encrypted_password=null;}
    console.log(`IMPORTED synthetic user ${u.label}`);save();
    const signedIn=await login(u.email,u.password);
    if(!signedIn.ok)fail(signedIn.code);
    assert.equal(signedIn.uid,u.uid);u.token=signedIn.token;
    const verified=await firebase.auth.verifyIdToken(u.token,true);
    assert.equal(verified.uid,u.uid);assert.equal(verified.sub,u.uid);assert.equal(verified.aud,'mydesckpro');
    assert.equal(verified.iss,'https://securetoken.google.com/mydesckpro');assert.ok(verified.exp>Math.floor(Date.now()/1000));
    u.exp=verified.exp;
    await test(`same_password_${u.label}`,async()=>assert.equal(signedIn.uid,u.uid));
    await test(`wrong_password_${u.label}`,async()=>{const wrong=await login(u.email,u.password+'-WRONG');assert.equal(wrong.ok,false);assert.ok(['INVALID_LOGIN_CREDENTIALS','INVALID_PASSWORD'].includes(wrong.code));});
    await test(`token_and_uid_${u.label}`,async()=>assert.equal(verified.uid,u.uid));
    u.password=null;
  }
  await test('duplicate_uid_guard',async()=>assert.rejects(absentInFirebase({uid:users[0].uid,email:makeTestEmail(runId+'-collision','example.test')}),{code:'UID_ALREADY_EXISTS'}));
  await test('duplicate_email_guard',async()=>assert.rejects(absentInFirebase({uid:randomUUID(),email:users[0].email}),{code:'EMAIL_ALREADY_EXISTS'}));
  await test('account_conservation',async()=>{assert.equal(manifest.syntheticSupabaseUsers,3);assert.equal(manifest.syntheticFirebaseUsers,3);assert.equal(importCalls,3);assert.equal(report.sourceHashRowsRead,3);assert.ok(manifest.identities.every(x=>x.cleanup_status==='retained_pending_approval'));});
  await runRealTokenPostgres({connectionString:config.PGURL,auth:firebase.auth,users,test});
  report.status=report.tests.every(x=>x.status==='PASS')?'PASS':'FAIL';
} catch(error){report.status='BLOCKED';report.blockers.push(codeOf(error));console.log('BLOCKED '+codeOf(error));}
finally {
  for(const u of users){u.password=null;u.token=null;}
  if(source)await source.end().catch(()=>{});
  if(firebase)await firebase.close();
  report.finishedAt=new Date().toISOString();report.passed=report.tests.filter(x=>x.status==='PASS').length;
  report.failed=report.tests.filter(x=>x.status==='FAIL').length;save();
}
console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,supabaseUsers:manifest.syntheticSupabaseUsers,firebaseUsers:manifest.syntheticFirebaseUsers,blockers:report.blockers}));
process.exitCode=report.status==='PASS'?0:1;
