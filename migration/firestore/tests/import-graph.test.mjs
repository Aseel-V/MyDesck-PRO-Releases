import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeFile } from '../lib/import-graph.mjs';

/**
 * The Firebase root guard counts every Supabase database, RPC, Auth, realtime and Edge Function site on the TypeScript
 * AST. A type cast, a parenthesised callee or a method alias changes nothing at runtime, so none may hide a site.
 */
const directory = mkdtempSync(join(tmpdir(), 'import-graph-test-'));
test.after(() => rmSync(directory, { recursive: true, force: true }));
let counter = 0;
const sites = (code, extension = 'ts') => {
  counter += 1;
  const file = join(directory, `case${counter}.${extension}`);
  writeFileSync(file, code);
  return analyzeFile(file).calls.map(({ kind, target }) => `${kind}:${target}`);
};

test('direct client calls are sites', () => {
  assert.deepEqual(sites(`supabase.from('trips').select('*'); supabase.rpc('get_trip_years');`), ['database:trips', 'rpc:get_trip_years']);
  assert.deepEqual(sites(`supabase.channel('c').on('x', () => {}).subscribe(); supabase.removeChannel(ch);`), ['realtime:c', 'realtime:<dynamic>']);
  assert.deepEqual(sites(`supabase.auth.getSession(); supabase.functions.invoke('generate-trip-pdf');`), ['auth:getSession', 'edgeFunctions:generate-trip-pdf']);
});

test('a cast or parenthesised receiver does not hide a site', () => {
  assert.deepEqual(sites(`(supabase as any).from('restaurant_staff').update({});`), ['database:restaurant_staff']);
  assert.deepEqual(sites(`(supabase as any).rpc('get_server_time');`), ['rpc:get_server_time']);
  assert.deepEqual(sites(`(<any>supabase).rpc('r');`), ['rpc:r']);
  assert.deepEqual(sites(`supabase!.channel('c').subscribe();`), ['realtime:c']);
  assert.deepEqual(sites(`(supabase satisfies object as any).from('t');`), ['database:t']);
  assert.deepEqual(sites(`(supabase as any).auth.getUser(); (supabase as any).functions.invoke('f');`), ['auth:getUser', 'edgeFunctions:f']);
});

// Fixtures await inside functions: in a script without imports, a top-level `await` is an identifier being called.
test('a cast callee does not hide a site', () => {
  assert.deepEqual(sites(`async function f() { await (supabase.rpc as any)('verify_staff_pin_secure', { p_pin: pin }); }`), ['rpc:verify_staff_pin_secure']);
  assert.deepEqual(sites(`async function f() { await ((supabase.from) as unknown as F)('t'); }`), ['database:t']);
});

test('a method alias or bind is still a site', () => {
  assert.deepEqual(sites(`async function f() { const rpc = supabase.rpc as unknown as LogActivityRpc; await rpc('log'); }`), ['rpc:<alias>']);
  assert.deepEqual(sites(`const from = supabase.from.bind(supabase); from('t');`), ['database:<alias>']);
});

test('comments, strings and other clients are not sites', () => {
  assert.deepEqual(sites(`// supabase.from('t')\nconst s = "supabase.rpc('x')"; storage.from('bucket'); db.from('t');`), []);
  assert.deepEqual(sites(`supabase.storage.from('bucket').upload(path, file);`), ['storage:null']);
});

test('JSX files are parsed as TSX', () => {
  assert.deepEqual(sites(`export const A = () => { void (supabase as any).from('t'); return <div />; };`, 'tsx'), ['database:t']);
});
