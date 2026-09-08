import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = process.env.SECURITY_DB_CONTAINER;
if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) {
  console.error('NOT RUN: set SECURITY_DB_CONTAINER to the ephemeral Supabase database container.');
  process.exit(2);
}
const sql = readFileSync(new URL('./security/tenant-isolation.sql', import.meta.url), 'utf8');
const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', timeout: 120000 });
if (result.status !== 0 || !result.stdout?.includes('SECURITY_ASSERTIONS_COMPLETED')) {
  console.error(result.stderr || result.error?.message || 'Security assertions did not complete.');
  process.exit(1);
}
console.log(result.stdout);
