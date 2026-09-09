import { readFileSync,existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { readPrivate } from './lib/cloud-control.mjs';
import { localConfig,withSourceSnapshot } from './lib/staging-source.mjs';
import { openKeylessAdmin } from './lib/keyless-admin.mjs';
import { writeReport } from './lib/write-report.mjs';
import assert from 'node:assert/strict';
const local=readPrivate(),users=local.dataset.users;
const env=parseEnv(readFileSync('migration/.env.local','utf8'));
process.env.GOOGLE_CLOUD_PROJECT='mydesckpro';process.env.FIREBASE_PROJECT_ID='mydesckpro';
const report={generatedAt:new Date().toISOString(),status:'BLOCKED',sourceSafety:{},firebase:[],storage:{objects:[],copied:0,
  byteMigration:'UNPROVEN',privateAccess:'NOT_TESTED_NO_OBJECTS'},customerChanges:0};
let firebase;
try{
  assert.equal(users.length,2);assert.ok(users.every(x=>x.email.startsWith('migration-test--travel-')));
  firebase=openKeylessAdmin();
  for(const user of users){
    const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password,returnSecureToken:true}),signal:AbortSignal.timeout(20000)});
    const data=await r.json();assert.ok(r.ok);assert.equal(data.localId,user.uid);
    const verified=await firebase.auth.verifyIdToken(data.idToken,true);assert.equal(verified.uid,user.uid);
    report.firebase.push({uid:user.uid,passwordLogin:'PASS',realTokenVerification:'PASS',uidPreservation:'MATCH'});
  }
  await withSourceSnapshot(localConfig(),async select=>{
    const columns=(await select("SELECT column_name FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects'")).rows.map(x=>x.column_name);
    const ownership=[];if(columns.includes('owner'))ownership.push('owner::text=ANY($1::text[])');
    if(columns.includes('owner_id'))ownership.push('owner_id=ANY($1::text[])');
    assert.ok(ownership.length);
    report.storage.objects=(await select(`SELECT bucket_id AS bucket,name AS path,owner::text AS owner,
      metadata->>'size' AS size,metadata->>'mimetype' AS mime FROM storage.objects WHERE ${ownership.join(' OR ')} ORDER BY bucket_id,name`,[users.map(x=>x.uid)])).rows;
    const refs=(await select(`SELECT id::text,user_id::text,attachments::text FROM public.trips WHERE user_id=ANY($1::uuid[]) ORDER BY id`,[users.map(x=>x.uid)])).rows;
    report.storage.tripAttachmentReferences=refs.reduce((n,x)=>n+JSON.parse(x.attachments??'[]').length,0);
    report.storage.profileReferences=(await select(`SELECT id::text,user_id::text,
      logo_url IS NOT NULL AND logo_url<>'' AS has_logo,signature_url IS NOT NULL AND signature_url<>'' AS has_signature
      FROM public.business_profiles WHERE user_id=ANY($1::uuid[]) ORDER BY id`,[users.map(x=>x.uid)])).rows;
    assert.equal(report.storage.objects.length,0);assert.equal(report.storage.tripAttachmentReferences,0);
    assert.ok(report.storage.profileReferences.every(x=>!x.has_logo&&!x.has_signature));
    report.storage.status='MANIFEST_ONLY_NO_SYNTHETIC_OBJECTS';
  },report.sourceSafety);
  report.status='PASS';
}catch(error){report.blocker=/^[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_STORAGE_ASSERTION_FAILED';report.errorCode=error.code??null;}
finally{if(firebase)await firebase.close();}
writeReport('migration/reports/synthetic-identity-storage-proof.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,firebaseUsers:report.firebase.length,storageObjects:report.storage.objects.length,
  copied:0,blocker:report.blocker,errorCode:report.errorCode}));process.exitCode=report.status==='PASS'?0:2;
