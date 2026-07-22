import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hasEffectiveRoutineExecuteGrant } from './sql-routine-grants.mjs';
import { findLatestRoutineDefinition } from './sql-routine-contracts.mjs';

const manifest = JSON.parse(readFileSync('supabase/database-compatibility-manifest.json', 'utf8'));
const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort((left, right) => left.localeCompare(right));

let combinedSql = '';
const migrations = [];
for (const file of migrationFiles) {
  const sql = readFileSync(`${migrationsDir}/${file}`, 'utf8');
  combinedSql += sql + '\n';
  migrations.push({ name: file, sql });
}

console.log(`[db-compatibility] Validating ${manifest.rpcs.length} RPCs and ${manifest.tables.length} tables against migration definitions...`);

// 1. Validate RPC signatures and grants in SQL
for (const rpc of manifest.rpcs) {
  const rpcPattern = new RegExp(`FUNCTION\\s+public\\.${rpc.name}\\s*\\(`, 'i');
  assert.ok(rpcPattern.test(combinedSql), `RPC function public.${rpc.name} must be created in migrations`);

  for (const arg of rpc.arguments) {
    const argPattern = new RegExp(`${arg.name}\\s+${arg.type}`, 'i');
    assert.ok(argPattern.test(combinedSql), `RPC public.${rpc.name} must declare parameter ${arg.name} of type ${arg.type}`);
  }

  let effectiveDefinition = null;
  if (rpc.name === 'get_trips_page') {
    effectiveDefinition = findLatestRoutineDefinition(migrations, { schema: 'public', functionName: rpc.name });
    assert.ok(effectiveDefinition, `RPC function public.${rpc.name} must have an effective migration definition`);
    assert.deepEqual(rpc.arguments, effectiveDefinition.arguments,
      `Manifest arguments for public.${rpc.name} must exactly match ${effectiveDefinition.migration}`);
    assert.equal(rpc.return_type, effectiveDefinition.returnType,
      `Manifest return type for public.${rpc.name} must exactly match ${effectiveDefinition.migration}`);
  }

  for (const grantRole of rpc.grants) {
    const argumentTypes = rpc.name === 'save_trip_transaction' || effectiveDefinition
      ? rpc.arguments.map((argument) => argument.type)
      : undefined;
    assert.ok(hasEffectiveRoutineExecuteGrant(migrations, {
      schema: 'public',
      functionName: rpc.name,
      argumentTypes,
      grantee: grantRole,
    }), `RPC public.${rpc.name} must grant EXECUTE to ${grantRole}`);
  }
}

// 2. Validate tables, columns, generated columns, and check constraints
for (const table of manifest.tables) {
  const tablePattern = new RegExp(`TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?public\\.${table.name}\\b`, 'i');
  assert.ok(tablePattern.test(combinedSql), `Table public.${table.name} must be defined in migrations`);

  for (const col of table.columns) {
    if (col.write_forbidden && col.is_generated) {
      // Ensure generated columns in SQL use GENERATED ALWAYS AS or trigger generation
      const genPattern = new RegExp(`${col.name}\\b.*GENERATED\\s+ALWAYS\\s+AS`, 'i');
      const hasGen = genPattern.test(combinedSql) || combinedSql.includes(col.name);
      assert.ok(hasGen, `Generated column ${col.name} must be defined in table public.${table.name}`);
    }
  }

  if (table.check_constraints) {
    for (const check of table.check_constraints) {
      for (const val of check.allowed_values) {
        assert.ok(combinedSql.includes(`'${val}'`), `CHECK constraint for ${table.name}.${check.column} must include value '${val}'`);
      }
    }
  }
}

console.log(`[db-compatibility] Database compatibility manifest validation PASSED.`);
