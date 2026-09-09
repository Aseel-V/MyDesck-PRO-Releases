import assert from 'node:assert/strict';
import { withFirebaseTransaction } from '../tools/lib/firebase-transaction.mjs';
const uid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const claims = { uid, sub: uid, aud: 'mydesckpro', iss: 'https://securetoken.google.com/mydesckpro', exp: Math.floor(Date.now()/1000)+3600 };
function fixture(overrides = {}) {
  const calls = [];
  const auth = { verifyIdToken: async (token, revocation) => { calls.push(['verify', revocation]); return {...claims,...overrides}; } };
  const client = { query: async (sql, values) => { calls.push([sql, values]); }, release: discard => calls.push(['release', discard]) };
  const pool = { connect: async () => { calls.push(['connect']); return client; } };
  return {auth, pool, calls, client};
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`  ok    ${name}`); }
await test('signature verification and revocation check precede connection checkout', async () => {
  const f=fixture(); await withFirebaseTransaction(f.auth,f.pool,'token',async(c,id)=>assert.equal(id,uid));
  assert.deepEqual(f.calls.slice(0,2),[['verify',true],['connect']]);
  assert.deepEqual(f.calls[3],['SELECT auth.bind_identity($1::uuid, $2)',[uid,'authenticated']]);
  assert.equal(f.calls.at(-2)[0],'COMMIT'); assert.deepEqual(f.calls.at(-1),['release',false]);
});
await test('invalid signature never reaches PostgreSQL', async()=>{
  const f=fixture();f.auth.verifyIdToken=async()=>{throw new Error('INVALID_SIGNATURE');};
  await assert.rejects(withFirebaseTransaction(f.auth,f.pool,'bad',async()=>assert.fail()),/INVALID_SIGNATURE/);
  assert.equal(f.calls.length,0);
});
for(const [name,override] of [['wrong audience',{aud:'other'}],['wrong issuer',{iss:'other'}],['expired claims',{exp:0}],['non-UUID UID',{uid:'someone'}],['UID/sub mismatch',{sub:'someone'}]]) {
  await test(`${name} rejected before database access`,async()=>{const f=fixture(override);await assert.rejects(withFirebaseTransaction(f.auth,f.pool,'token',async()=>assert.fail()),/INVALID_VERIFIED_IDENTITY/);assert.equal(f.calls.length,1);});
}
await test('token role claims cannot promote the database role',async()=>{
  const f=fixture({role:'service_role'});await withFirebaseTransaction(f.auth,f.pool,'token',async()=>{});
  assert.equal(f.calls[4][0],'SET LOCAL ROLE authenticated');
});
await test('anonymous transaction explicitly clears UID and uses anon',async()=>{
  const f=fixture();await withFirebaseTransaction(f.auth,f.pool,null,async(c,id)=>assert.equal(id,null));
  assert.deepEqual(f.calls[2],['SELECT auth.bind_identity($1::uuid, $2)',[null,'anon']]);
  assert.equal(f.calls[3][0],'SET LOCAL ROLE anon');
});
await test('failed work rolls back instead of committing',async()=>{
  const f=fixture();await assert.rejects(withFirebaseTransaction(f.auth,f.pool,'token',async()=>{throw new Error('WORK_FAILED');}),/WORK_FAILED/);
  assert.equal(f.calls.at(-2)[0],'ROLLBACK');assert.ok(!f.calls.some(c=>c[0]==='COMMIT'));
});
await test('failed rollback discards the pooled connection',async()=>{
  const f=fixture();f.client.query=async sql=>{if(sql==='ROLLBACK')throw new Error('BROKEN_CONNECTION');};
  await assert.rejects(withFirebaseTransaction(f.auth,f.pool,'token',async()=>{throw new Error('WORK_FAILED');}),/WORK_FAILED/);
  assert.deepEqual(f.calls.at(-1),['release',true]);
});
console.log(`\n[firebase-transaction] ${passed} passed, 0 failed`);
