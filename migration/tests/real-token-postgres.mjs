import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { withFirebaseTransaction } from '../tools/lib/firebase-transaction.mjs';

export async function verifyLocalProofTarget(connectionString) {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('LOCAL_TARGET_REQUIRED');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const { rows: [r] } = await client.query(`SELECT current_setting('server_version_num')::int AS version,
      current_setting('server_encoding') AS encoding, inet_server_addr()::text AS address,
      to_regprocedure('auth.bind_identity(uuid,text,jsonb)') IS NOT NULL AS binder`);
    if (r.version < 170000 || r.version >= 180000 || r.encoding !== 'UTF8' || !r.binder ||
        !['127.0.0.1/32', '::1/128', '127.0.0.1', '::1'].includes(r.address)) throw new Error('LOCAL_TARGET_NOT_READY');
    return r;
  } finally { await client.end(); }
}

/** All data/DDL/negative-control writes in this module target the local DB only. */
export async function runRealTokenPostgres({ connectionString, auth, users, test }) {
  await verifyLocalProofTarget(connectionString);
  const [A, B] = users;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const role = 'mydesck_runtime';
  const appUrl = new URL(connectionString); appUrl.username = role; appUrl.password = 'runtime_test_pw';
  const pool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });
  const as = (user, work, targetPool = pool) => withFirebaseTransaction(auth, targetPool, user?.token ?? null, work);
  const denied = async work => assert.rejects(work, { code: '42501' });
  const trips = new Map();
  try {
    await admin.query('SELECT auth.grant_runtime_access($1)', [role]);
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated');
    for (const u of [A, B]) {
      // No upsert or adoption: colliding local fixture rows abort the run.
      await admin.query('INSERT INTO auth.users(id,email,migrated_from_supabase) VALUES($1,$2,true)', [u.uid,u.email]);
      await admin.query('INSERT INTO public.business_profiles(user_id,business_name) VALUES($1,$2)', [u.uid,'migration-test--token']);
      await admin.query("INSERT INTO public.user_profiles(user_id,full_name,role) VALUES($1,$2,'user')", [u.uid,'migration-test--token']);
      const {rows:[trip]} = await admin.query(`INSERT INTO public.trips
        (user_id,destination,client_name,start_date,end_date,sale_price,wholesale_cost)
        VALUES($1,$2,$3,'2026-10-01','2026-10-07',1000.00,800.00) RETURNING id`,
      [u.uid,'migration-test--Paris','migration-test--client']);
      trips.set(u.uid,trip.id);
    }
    for (const [label,u] of [['A',A],['B',B]]) await test(`identity_${label}`,async()=>{
      await as(u,async(c,uid)=>{const {rows:[r]}=await c.query('SELECT auth.uid() AS uid');assert.equal(uid,u.uid);assert.equal(r.uid,u.uid);});
    });
    await test('A_own_select',async()=>as(A,async c=>{
      const r=await c.query('SELECT user_id FROM public.trips');assert.equal(r.rowCount,1);assert.equal(r.rows[0].user_id,A.uid);
    }));
    for(const [action,sql] of [
      ['select','SELECT id FROM public.trips WHERE user_id=$1'],
      ['update','UPDATE public.trips SET sale_price=1 WHERE user_id=$1 RETURNING id'],
      ['delete','DELETE FROM public.trips WHERE user_id=$1 RETURNING id'],
    ]) await test(`A_cross_${action}`,async()=>as(A,async c=>assert.equal((await c.query(sql,[B.uid])).rowCount,0)));
    await test('A_cross_insert',async()=>denied(()=>as(A,c=>c.query(`INSERT INTO public.trips
      (user_id,destination,client_name,start_date,end_date) VALUES($1,'forged','forged','2026-10-01','2026-10-07')`,[B.uid]))));
    await test('B_cross_select',async()=>as(B,async c=>assert.equal((await c.query('SELECT id FROM public.trips WHERE user_id=$1',[A.uid])).rowCount,0)));
    await test('anonymous_private_data',async()=>denied(()=>as(null,c=>c.query('SELECT id FROM public.trips'))));
    await test('invalid_token_before_database',async()=>{
      let checkedOut=false;
      const rejectPool={connect:async()=>{checkedOut=true;throw new Error('SHOULD_NOT_CHECK_OUT');}};
      await assert.rejects(withFirebaseTransaction(auth,rejectPool,'not-a-token',async()=>{}));assert.equal(checkedOut,false);
    });
    await test('invalid_signature_before_database',async()=>{
      const parts=A.token.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
      let checkedOut=false;
      await assert.rejects(withFirebaseTransaction(auth,{connect:async()=>{checkedOut=true;throw new Error('SHOULD_NOT_CHECK_OUT');}},parts.join('.'),async()=>{}));
      assert.equal(checkedOut,false);
    });
    await test('expired_real_token_controlled_clock',async()=>{
      const r=spawnSync(process.execPath,['migration/tests/expired-token-probe.mjs'],{
        input:JSON.stringify({token:A.token,expiry:A.exp}),encoding:'utf8',env:process.env,timeout:30000,
      });
      assert.equal(r.status,0);assert.equal(r.stdout.trim(),'auth/id-token-expired');
    });
    await test('rpc_uses_auth_uid',async()=>{
      const {rows:[r]}=await admin.query("SELECT pg_get_functiondef('public.get_owned_trip_payment_summary(uuid)'::regprocedure) AS definition");
      assert.ok(r.definition.includes('auth.uid()'));
    });
    await test('rpc_own_tenant',async()=>as(A,async c=>{
      const {rows:[r]}=await c.query('SELECT public.get_owned_trip_payment_summary($1) AS summary',[trips.get(A.uid)]);assert.ok(r.summary);
    }));
    await test('rpc_cross_tenant',async()=>as(A,async c=>{
      const {rows:[r]}=await c.query('SELECT public.get_owned_trip_payment_summary($1) AS summary',[trips.get(B.uid)]);assert.equal(r.summary,null);
    }));
    await test('self_admin',async()=>{
      await denied(()=>as(A,c=>c.query("UPDATE public.user_profiles SET role='admin' WHERE user_id=$1",[A.uid])));
      assert.equal((await admin.query('SELECT role FROM public.user_profiles WHERE user_id=$1',[A.uid])).rows[0].role,'user');
    });
    await test('self_unsuspend',async()=>{
      await admin.query('UPDATE public.user_profiles SET is_suspended=true WHERE user_id=$1',[A.uid]);
      try {
        await denied(()=>as(A,c=>c.query('UPDATE public.user_profiles SET is_suspended=false WHERE user_id=$1',[A.uid])));
        assert.equal((await admin.query('SELECT is_suspended FROM public.user_profiles WHERE user_id=$1',[A.uid])).rows[0].is_suspended,true);
      } finally {await admin.query('UPDATE public.user_profiles SET is_suspended=false WHERE user_id=$1',[A.uid]);}
    });
    for(const name of ['service_role','supabase_admin'])await test(`set_role_${name}`,async()=>denied(()=>as(A,c=>c.query(`SET LOCAL ROLE ${name}`))));
    await test('client_cannot_call_binder',async()=>denied(()=>as(A,c=>c.query('SELECT auth.bind_identity($1::uuid,$2)',[B.uid,'authenticated']))));
    await test('runtime_posture',async()=>{
      const {rows:[r]}=await admin.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=$1',[role]);
      assert.ok(Object.values(r).every(v=>v===false));
      assert.equal((await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner=$1",[role])).rowCount,0);
    });
    await test('pool_A_B_anonymous_same_connection',async()=>{
      const seen=[];
      for(const u of [A,B,null])await as(u,async c=>{
        const {rows:[r]}=await c.query('SELECT auth.uid() AS uid, pg_backend_pid() AS pid');assert.equal(r.uid,u?.uid??null);seen.push(r.pid);
      });
      assert.equal(new Set(seen).size,1);
      const c=await pool.connect();try{assert.equal((await c.query('SELECT auth.uid() AS uid')).rows[0].uid,null);}finally{c.release();}
    });
    await test('pool_25_alternations',async()=>{for(let i=0;i<25;i++){const u=i%2?B:A;await as(u,async c=>assert.equal((await c.query('SELECT auth.uid() AS uid')).rows[0].uid,u.uid));}});
    await test('pool_40_interleaved',async()=>{
      const concurrent=new pg.Pool({connectionString:appUrl.toString(),max:2});
      try{await Promise.all(Array.from({length:40},(_,i)=>{const u=i%2?B:A;return as(u,async c=>assert.equal((await c.query('SELECT auth.uid() AS uid')).rows[0].uid,u.uid),concurrent);}));}
      finally{await concurrent.end();}
    });
    await test('NC_session_global_detected',async()=>{
      const verified=await auth.verifyIdToken(A.token,true);const c=await pool.connect();
      try{await c.query("SELECT set_config('app.user_id',$1,false)",[verified.uid]);
        assert.throws(()=>assert.equal(verified.uid,null));
        const r=await c.query('SELECT auth.uid() AS uid');assert.equal(r.rows[0].uid,verified.uid);
        assert.throws(()=>assert.equal(r.rows[0].uid,null));
      }finally{await c.query("SELECT set_config('app.user_id','',false)");c.release();}
    });
    await test('NC_bypassrls_detected',async()=>{
      try{await admin.query(`ALTER ROLE ${role} BYPASSRLS`);
        const {rows:[r]}=await admin.query('SELECT rolbypassrls FROM pg_roles WHERE rolname=$1',[role]);assert.throws(()=>assert.equal(r.rolbypassrls,false));
      }finally{await admin.query(`ALTER ROLE ${role} NOBYPASSRLS`);}
    });
    await test('NC_open_policy_detected',async()=>{
      try{await admin.query('CREATE POLICY migration_token_nc_open ON public.trips FOR SELECT TO authenticated USING(true)');
        await as(A,async c=>{const r=await c.query('SELECT user_id FROM public.trips');assert.ok(r.rows.some(row=>row.user_id===B.uid));assert.throws(()=>assert.ok(r.rows.every(row=>row.user_id===A.uid)));});
      }finally{await admin.query('DROP POLICY IF EXISTS migration_token_nc_open ON public.trips');}
    });
    await test('NC_wrong_uid_detected',async()=>{
      const expected=(await auth.verifyIdToken(A.token,true)).uid;
      await as(B,async c=>{const actual=(await c.query('SELECT auth.uid() AS uid')).rows[0].uid;assert.throws(()=>assert.equal(actual,expected));});
    });
    await test('secure_state_and_financial_values_restored',async()=>{
      assert.equal((await admin.query("SELECT 1 FROM pg_policies WHERE policyname='migration_token_nc_open'")).rowCount,0);
      assert.equal((await admin.query('SELECT rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0].rolbypassrls,false);
      const rows=(await admin.query('SELECT user_id,sale_price::text AS price FROM public.trips WHERE user_id=ANY($1::uuid[])',[[A.uid,B.uid]])).rows;
      assert.equal(rows.length,2);assert.ok(rows.every(row=>Number(row.price)===1000));
    });
  } finally {
    await admin.query('DROP POLICY IF EXISTS migration_token_nc_open ON public.trips');
    await admin.query(`ALTER ROLE ${role} NOBYPASSRLS`);
    await pool.end();await admin.end();
  }
}
