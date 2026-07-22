import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { splitSqlStatements } from './sql-routine-grants.mjs';

const identifierPattern = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';

function normalizeIdentifier(identifier) {
  const value = identifier.trim();
  return value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value.toLowerCase();
}

function policyKey(table, policy) {
  return `${normalizeIdentifier(table)}::${normalizeIdentifier(policy)}`;
}

export function findUnsafeDuplicatePolicies(migrations) {
  const activePolicies = new Map();
  const duplicates = [];
  const policyPattern = new RegExp(`(${identifierPattern})`);

  for (const migration of migrations) {
    for (const statement of splitSqlStatements(migration.sql)) {
      const drop = statement.match(new RegExp(`^DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?${policyPattern.source}\\s+ON\\s+(?:${identifierPattern}\\s*\\.\\s*)?${policyPattern.source}`, 'i'));
      if (drop) {
        activePolicies.delete(policyKey(drop[2], drop[1]));
        continue;
      }

      const create = statement.match(new RegExp(`^CREATE\\s+POLICY\\s+${policyPattern.source}\\s+ON\\s+(?:${identifierPattern}\\s*\\.\\s*)?${policyPattern.source}`, 'i'));
      if (!create) continue;

      const key = policyKey(create[2], create[1]);
      const previousMigration = activePolicies.get(key);
      if (previousMigration) {
        duplicates.push({ key, previousMigration, migration: migration.name });
      }
      activePolicies.set(key, migration.name);
    }
  }

  return duplicates;
}

const originalFailure = [
  {
    name: '20251118170905.sql',
    sql: 'CREATE POLICY "Users can read own profile" ON public.business_profiles FOR SELECT USING (auth.uid() = user_id);',
  },
  {
    name: '20251118175038.sql',
    sql: 'CREATE POLICY "Users can read own profile" ON public.business_profiles FOR SELECT USING (auth.uid() = user_id);',
  },
];
assert.deepEqual(findUnsafeDuplicatePolicies(originalFailure), [{
  key: 'business_profiles::Users can read own profile',
  previousMigration: '20251118170905.sql',
  migration: '20251118175038.sql',
}], 'Regression fixture must detect the original SQLSTATE 42710 policy collision');

const authoritativeReplacement = [
  originalFailure[0],
  {
    name: '20251118175038.sql',
    sql: `
      DROP POLICY IF EXISTS "Users can read own profile" ON public.business_profiles;
      CREATE POLICY "Users can read own profile" ON public.business_profiles FOR SELECT USING (auth.uid() = user_id);
    `,
  },
];
assert.deepEqual(findUnsafeDuplicatePolicies(authoritativeReplacement), [], 'DROP POLICY IF EXISTS followed by CREATE POLICY must be accepted');

const migrationsDir = 'supabase/migrations';
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ name, sql: readFileSync(`${migrationsDir}/${name}`, 'utf8') }));
const duplicates = findUnsafeDuplicatePolicies(migrations);
assert.deepEqual(duplicates, [], `Migration chain contains unsafe duplicate policies: ${JSON.stringify(duplicates)}`);

console.log('[migration-policy-idempotency] Original-failure regression and ordered-chain policy checks passed.');
console.log('[migration-policy-idempotency] Static analysis supplements but does not replace a clean local Supabase db reset.');
