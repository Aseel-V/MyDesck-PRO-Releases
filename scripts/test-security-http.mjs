import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) {
  console.error('NOT RUN: requires API_URL, ANON_KEY and SERVICE_ROLE_KEY from an ephemeral local Supabase. Remote targets are forbidden.');
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, options);
const report = { status: 'NOT RUN', tests: [], timestamp: new Date().toISOString() };
const users = [];
const objects = [];
const requireOk = (result) => { assert.equal(result.error, null, result.error?.message); return result.data; };
const checked = (name) => { report.tests.push(name); console.log(name); };
try {
  for (const role of ['user','user','admin']) {
    const email = `phase1-${randomUUID()}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const { user } = requireOk(await service.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push({ id: user.id });
    requireOk(await service.from('user_profiles').upsert({ user_id: user.id, role }));
    const client = createClient(url, anonKey, options);
    const session = requireOk(await client.auth.signInWithPassword({ email, password })).session;
    Object.assign(users.at(-1), { client, token: session.access_token });
  }
  const [a,b,admin] = users;
  const escalation = await a.client.from('user_profiles').update({ role: 'admin' }).eq('user_id',a.id);
  assert.ok(escalation.error, 'Self-promotion must be rejected');
  assert.equal(requireOk(await service.from('user_profiles').select('role').eq('user_id',a.id).single()).role,'user');
  assert.deepEqual(requireOk(await a.client.from('user_profiles').select('*').eq('user_id',b.id)),[]);
  assert.equal(requireOk(await admin.client.rpc('is_platform_admin')),true);
  checked('Real JWT users A/B/admin: self-promotion rejected, B profile hidden, admin recognized');

  const trip = requireOk(await service.from('trips').insert({ user_id:b.id,destination:'Private B',client_name:'B',start_date:'2026-12-01',end_date:'2026-12-02',sale_price:100 }).select().single());
  assert.deepEqual(requireOk(await a.client.from('trips').select('*').eq('id',trip.id)),[]);
  assert.deepEqual(requireOk(await a.client.from('trips').update({client_name:'attacker'}).eq('id',trip.id).select('id')),[]);
  const deletion = await a.client.from('trips').delete().eq('id',trip.id).select('id');
  assert.ok(deletion.error || deletion.data.length===0);
  assert.ok((await a.client.from('trips').insert({user_id:b.id,destination:'injected',client_name:'X',start_date:'2026-12-01',end_date:'2026-12-02'})).error);
  assert.equal(requireOk(await a.client.rpc('get_trip_details',{p_trip_id:trip.id})),null);
  assert.equal(requireOk(await service.from('trips').select('client_name').eq('id',trip.id).single()).client_name,'B');
  checked('REST SELECT/INSERT/UPDATE/DELETE and detail RPC cannot access B trip');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9L8AAAAASUVORK5CYII=','base64');
  for (const [bucket,path,client] of [
    ['business-signatures',`${a.id}/own.png`,a.client],
    ['business-signatures',`${b.id}/private.png`,b.client],
    ['logos',`business-signatures/sig-${b.id}-legacy.png`,service],
    ['business-logos',`${a.id}/logo.png`,a.client],
  ]) {
    requireOk(await client.storage.from(bucket).upload(path,png,{contentType:'image/png'}));
    objects.push({bucket,path});
  }
  assert.ok((await a.client.storage.from('business-signatures').download(`${b.id}/private.png`)).error);
  assert.ok((await a.client.storage.from('business-signatures').createSignedUrl(`${b.id}/private.png`,60)).error);
  assert.ok((await a.client.storage.from('business-signatures').upload(`${b.id}/injected.png`,png,{contentType:'image/png'})).error);
  const own = requireOk(await a.client.storage.from('business-signatures').createSignedUrl(`${a.id}/own.png`,60));
  assert.equal((await fetch(own.signedUrl)).status,200);
  for (const [bucket,path] of [['business-signatures',`${b.id}/private.png`],['logos',`business-signatures/sig-${b.id}-legacy.png`]]) {
    const publicUrl = service.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    assert.notEqual((await fetch(publicUrl)).status,200,'Private signatures must not be publicly downloadable');
  }
  assert.equal((await fetch(service.storage.from('business-logos').getPublicUrl(`${a.id}/logo.png`).data.publicUrl)).status,200);
  assert.ok((await a.client.storage.from('business-signatures').upload(`${a.id}/bad.svg`,'<svg/>',{contentType:'image/svg+xml'})).error);
  assert.ok((await a.client.storage.from('business-signatures').upload(`${a.id}/large.png`,Buffer.alloc(2097153),{contentType:'image/png'})).error);
  checked('Storage bytes: private signatures, tenant signed-URL denial, public logos, MIME and size limits');

  // Wait only for the local runtime to bind, never reinterpret missing runtime as PASS.
  let ready=false;
  for (let attempt=0; attempt<30; attempt++) {
    try {
      const r=await fetch(`${url}/functions/v1/send-whatsapp`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,apikey:anonKey}});
      if (r.status===503 && (await r.json()).error==='AUTOMATED_WHATSAPP_UNAVAILABLE') {ready=true;break;}
    } catch { /* retry local runtime startup */ }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(ready,'Edge Runtime did not become ready');
  for (const token of ['', 'invalid', a.token,b.token,admin.token]) {
    const r=await fetch(`${url}/functions/v1/send-whatsapp`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:anonKey,'Content-Type':'application/json'},body:JSON.stringify({business_id:b.id,phone_number:'+972501234567'})});
    assert.ok([401,403,503].includes(r.status));
    if(r.status===503) assert.equal((await r.json()).error,'AUTOMATED_WHATSAPP_UNAVAILABLE');
  }
  for (const endpoint of ['get-users','create-user']) {
    const r=await fetch(`${url}/functions/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,apikey:anonKey,'Content-Type':'application/json'},body:'{}'});
    const body=await r.json();
    assert.ok(body.error && !body.users && !body.user,`${endpoint} must deny tenant A`);
  }
  const adminResponse=await fetch(`${url}/functions/v1/get-users`,{method:'POST',headers:{Authorization:`Bearer ${admin.token}`,apikey:anonKey,'Content-Type':'application/json'},body:'{}'});
  assert.equal(adminResponse.status,200);
  assert.ok(Array.isArray((await adminResponse.json()).users));
  checked('Edge Runtime: invalid/tenant/admin JWTs cannot send WhatsApp; tenant admin functions denied; admin read works');
  report.status='PASS';
} catch(error) {
  report.status='FAIL'; report.error=error.message; console.error(error.message); process.exitCode=1;
} finally {
  for (const {bucket,path} of objects) await service.storage.from(bucket).remove([path]);
  for (const {id} of users) await service.auth.admin.deleteUser(id);
  mkdirSync('results',{recursive:true});
  writeFileSync('results/security-http.json',JSON.stringify(report,null,2));
}
