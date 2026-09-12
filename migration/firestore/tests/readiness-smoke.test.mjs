import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readinessSmoke } from '../functions/readiness-smoke-core.mjs';
import { cleanupPlan } from '../lib/environment-readiness.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080') throw Error('LOCAL_EMULATOR_REQUIRED');
const migrationRunId='migration-test--production-readiness-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const app=initializeApp({projectId:'mydesck-env-guard-proof'},'readiness-guard-proof');
const db=getFirestore(app,'default');
const req={data:{migrationRunId},auth:{uid:`${migrationRunId}--owner`,token:{migrationRunId,migrationReadiness:true}},app:{appId:'emulator-app-proof'}};
const deps={db,Timestamp};
const paths=['business','trip','payment','journal','idempotency'].map(k=>`migration-test/${migrationRunId}--${k}`);
before(async()=>{for(const p of paths)await db.doc(p).delete();});
after(async()=>{for(const p of paths)await db.doc(p).delete();await deleteApp(app);});
test('synthetic callable rejects real UID, unmarked claims, missing App Check and extra input before writes',async()=>{
  await assert.rejects(readinessSmoke(deps,{...req,auth:{...req.auth,uid:'customer'}}),/IDENTITY/);
  await assert.rejects(readinessSmoke(deps,{...req,auth:{...req.auth,token:{}}}),/IDENTITY/);
  await assert.rejects(readinessSmoke(deps,{...req,app:null}),/APP_CHECK/);
  await assert.rejects(readinessSmoke(deps,{...req,data:{...req.data,amount:'100'}}),/INPUT/);
  assert.equal((await db.doc(paths[0]).get()).exists,false);
});
test('synthetic transaction is atomic and idempotent; journal supports Firestore-only financial rollback',async()=>{
  const first=await readinessSmoke(deps,req), second=await readinessSmoke(deps,req);
  assert.equal(first.replay,false); assert.equal(second.replay,true);
  assert.equal(first.backend,'supabase'); assert.equal(first.ids.length,5);
  assert.deepEqual(first.ids,second.ids);
  const resources=[];
  for(const path of paths){const snap=await db.doc(path).get();assert.equal(snap.data().migrationRunId,migrationRunId);
    resources.push({kind:'firestore',path,migrationRunId,createdByThisRun:true,creationReceipt:'local-emulator-transaction',version:snap.updateTime.toDate().toISOString()});}
  const journal=(await db.doc(paths[3]).get()).data();
  assert.equal(journal.beforeHash,null); assert.equal(journal.operation,'SYNTHETIC_PAYMENT');
  assert.equal((await db.doc(paths[2]).get()).data().amount,'17.25');
  const plan=cleanupPlan({project:'mydesckpro',database:'projects/mydesckpro/databases/default',migrationRunId,resources},resources);
  assert.equal(plan.length,5);
  for(const item of plan)await db.doc(item.path).delete();
  assert.equal((await db.doc(paths[2]).get()).exists,false);
  // This suite is deliberately labelled emulator; it cannot close real-project smoke/rollback gates.
});
test('preexisting synthetic document aborts entire transaction without overwriting',async()=>{
  await db.doc(paths[0]).create({migrationRunId:'other-run',value:'preserve'});
  await assert.rejects(readinessSmoke(deps,req));
  assert.equal((await db.doc(paths[0]).get()).data().value,'preserve');
  assert.equal((await db.doc(paths[2]).get()).exists,false);
});
