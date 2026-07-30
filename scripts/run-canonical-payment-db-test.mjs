import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const list = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
if (list.status !== 0) {
  console.error('Canonical payment DB test requires a running local Supabase Docker database.');
  process.exit(2);
}
const container = list.stdout.split(/\r?\n/).find((name) => name.startsWith('supabase_db_'));
if (!container) {
  console.error('Canonical payment DB test requires a running local Supabase Docker database.');
  process.exit(2);
}
const sql = readFileSync(new URL('./verify-canonical-trip-payments.sql', import.meta.url), 'utf8');
const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: sql,
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.error(result.stderr || 'Canonical payment database verification failed.');
  process.exit(result.status || 1);
}
console.log('Canonical payment database save/reload verification passed and rolled back.');
