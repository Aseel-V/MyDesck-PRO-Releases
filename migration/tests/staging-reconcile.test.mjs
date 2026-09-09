import test from 'node:test';
import assert from 'node:assert/strict';
import { tableDigest, reconcileTable, exactSum, financialGroups, eventOrder, orphanKeys } from '../tools/lib/staging-reconcile.mjs';
import { sourceOptions } from '../tools/lib/staging-source.mjs';

const fixture = () => ({ primaryKey:['id'], columns:[
  {name:'id',type:'uuid'}, {name:'trip_id',type:'uuid'}, {name:'amount',type:'numeric(30,8)'},
  {name:'occurred_at',type:'timestamptz'}, {name:'sequence',type:'bigint'},
  {name:'currency',type:'text'}, {name:'payload',type:'jsonb'}, {name:'bytes',type:'bytea'},
], rows:[
  { id:'f1191f99-f242-4eb5-a1a6-d45c5222c7a8', trip_id:'14819359-83d9-4401-9795-fcb42176e59b',
    amount:'9007199254740993.12345678', occurred_at:'2026-09-09 09:58:29.409951+00', sequence:'9223372036854775806',
    currency:'ILS', payload:'{"n": 9007199254740993123456789.12345678}', bytes:'\\x00ff' },
  { id:'608befcc-7ed8-4466-80f4-d99a45c5e4c5', trip_id:'14819359-83d9-4401-9795-fcb42176e59b',
    amount:'-0.00000001', occurred_at:'2026-09-09 09:58:29.409952+00', sequence:'9223372036854775807',
    currency:'ILS', payload:null, bytes:'\\x' },
] });

test('deterministic rows and column order; exact text values retained',()=>{
  const a=fixture(), b=fixture(); b.rows.reverse(); b.columns.reverse();
  assert.equal(reconcileTable(a,b).status,'MATCH');
});
for(const [label,mutate] of [
  ['missing row',b=>b.rows.pop()],
  ['changed UUID',b=>b.rows[0].id='11111111-1111-4111-8111-111111111111'],
  ['changed FK',b=>b.rows[0].trip_id='11111111-1111-4111-8111-111111111111'],
  ['one NUMERIC unit at eighth decimal',b=>b.rows[0].amount='9007199254740993.12345679'],
  ['timestamp microsecond',b=>b.rows[0].occurred_at='2026-09-09 09:58:29.409952+00'],
  ['event sequence',b=>b.rows[0].sequence='9223372036854775807'],
  ['JSON number beyond JS precision',b=>b.rows[0].payload='{"n": 9007199254740993123456789.12345679}'],
  ['byte change',b=>b.rows[0].bytes='\\x00fe'],
  ['NULL versus empty string',b=>b.rows[1].payload=''],
  ['column type drift',b=>b.columns[2].type='double precision'],
]) test('detects '+label,()=>{ const a=fixture(), b=fixture(); mutate(b); assert.equal(reconcileTable(a,b).status,'MISMATCH'); });

test('financial sum is exact above 2^53 and below one cent',()=>{
  assert.equal(exactSum(fixture().rows.map(x=>x.amount)),'9007199254740993.12345677');
  assert.equal(exactSum(['1.20','-1.2','-0.00']),'0');
  assert.equal(exactSum(['-0.01','0.001']),'-0.009');
});
test('currency groups cannot cancel across currencies',()=>{
  const rows=fixture().rows; rows[1].currency='USD';
  assert.equal(financialGroups(rows,'amount',['trip_id','currency']).length,2);
});
test('reordered events detected even with equal table hashes',()=>{
  const a=fixture(), b=fixture(); b.rows.reverse();
  assert.equal(reconcileTable(a,b).status,'MATCH');
  assert.notDeepEqual(eventOrder(a.rows,['trip_id'],'id'),eventOrder(b.rows,['trip_id'],'id'));
});
test('orphan relationship detected',()=>{
  const rows=fixture().rows, parents=[{id:rows[0].trip_id}];
  assert.equal(orphanKeys(rows,parents,['trip_id'],['id']).length,0);
  rows[0].trip_id='11111111-1111-4111-8111-111111111111';
  assert.equal(orphanKeys(rows,parents,['trip_id'],['id']).length,1);
});
test('rejects JS Number values',()=>{
  const a=fixture(); a.rows[0].amount=9007199254740993;
  assert.throws(()=>tableDigest(a),/LOSSY_OR_MISSING_CELL/);
  assert.throws(()=>exactSum([0.1]),/UNSUPPORTED_NUMERIC/);
});
test('rejects duplicate or missing PK',()=>{
  const a=fixture(); a.rows.push(a.rows[0]); assert.throws(()=>tableDigest(a),/DUPLICATE_PRIMARY_KEY/);
  a.primaryKey=[]; assert.throws(()=>tableDigest(a),/MISSING_PRIMARY_KEY/);
});
test('source guard refuses other projects',()=>{
  assert.throws(()=>sourceOptions({SUPABASE_DB_URL:'postgresql://u:p@example.com/db'}),/SOURCE_PROJECT_MISMATCH/);
});
test('source URL cannot turn off TLS or read-only startup',()=>{
  const options=sourceOptions({SUPABASE_DB_URL:'postgresql://postgres.pubugnfaqqukelvgckdr:p@aws-0-ap-southeast-2.pooler.supabase.com/postgres?sslmode=disable&options=-c%20default_transaction_read_only=off'});
  assert.equal(options.ssl.rejectUnauthorized,true);
  assert.equal(options.options,'-c default_transaction_read_only=on');
});
