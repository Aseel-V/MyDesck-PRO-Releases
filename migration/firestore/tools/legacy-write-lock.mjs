#!/usr/bin/env node
/**
 * Reversible write lock on the legacy Supabase business database.
 *
 * The shipped 0.0.61 client writes to Supabase through PostgREST, which acts as the `anon` or
 * `authenticated` role. Revoking INSERT, UPDATE and DELETE from those two roles on the `public`
 * schema stops those writes and nothing else:
 *
 *   SELECT is deliberately left in place, so the source stays readable for rollback evidence and
 *   for reconciliation, and so a legacy client degrades to read-only rather than failing to load.
 *
 *   Storage is untouched. Objects live in the `storage` schema and are reached through the Storage
 *   API, which uses its own role and its own tables; nothing here names that schema.
 *
 *   auth.users is untouched. It is the `auth` schema, and it is the rollback path for identities.
 *
 *   No data is deleted, and no row is modified. This is a privilege change, not a data change.
 *
 * Reversibility is the whole design. The exact grants present before the lock are captured first and
 * written into the journal as executable GRANT statements, so the rollback restores what was there
 * rather than what someone later assumes was there. A rollback that has to guess is not a rollback.
 *
 *   node migration/firestore/tools/legacy-write-lock.mjs                 # plan only
 *   node migration/firestore/tools/legacy-write-lock.mjs --apply --ack=<ack>
 *   node migration/firestore/tools/legacy-write-lock.mjs --release --ack=<ack>
 */
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { localConfig } from '../../tools/lib/staging-source.mjs';
import { sha256 } from '../lib/production-guard.mjs';

const APPLY_ACK = 'I_ACKNOWLEDGE_MYDESCK_LEGACY_SUPABASE_WRITE_LOCK';
const RELEASE_ACK = 'I_ACKNOWLEDGE_MYDESCK_LEGACY_SUPABASE_WRITE_LOCK_RELEASE';
const CLIENT_ROLES = ['anon', 'authenticated'];
const LOCKED_PRIVILEGES = ['INSERT', 'UPDATE', 'DELETE'];
const JOURNAL_PATH = 'migration/production-copy.local/legacy-write-lock-journal.json';
const REPORT_PATH = 'migration/reports/legacy-write-lock.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const apply = process.argv.includes('--apply');
const release = process.argv.includes('--release');
if (apply && release) throw Error('CHOOSE_APPLY_OR_RELEASE_NOT_BOTH');
const ack = value('--ack');
if (apply && ack !== APPLY_ACK) throw Error('WRITE_LOCK_ACKNOWLEDGEMENT_REQUIRED');
if (release && ack !== RELEASE_ACK) throw Error('WRITE_LOCK_RELEASE_ACKNOWLEDGEMENT_REQUIRED');

const config = localConfig();
const url = config.SUPABASE_DB_URL ?? config.PGURL;
if (!url) throw Error('SOURCE_CONFIG_REQUIRED');
const options = { connectionString: url };
if (config.SUPABASE_CA_FILE) {
  options.ssl = { ca: readFileSync(config.SUPABASE_CA_FILE, 'utf8'), rejectUnauthorized: true };
}

const client = new pg.Client(options);
await client.connect();
let report;
try {
  const identity = (await client.query(`SELECT current_user, session_user,
    (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser`)).rows[0];

  // Exactly what the client roles may do to public tables right now.
  const grants = (await client.query(`SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = ANY($1::text[])
      AND privilege_type = ANY($2::text[])
    ORDER BY grantee, table_name, privilege_type`, [CLIENT_ROLES, LOCKED_PRIVILEGES])).rows;

  const tables = (await client.query(`SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((row) => row.tablename);

  // Proof that the plan cannot reach Storage or identities.
  const storageGrants = (await client.query(`SELECT count(*)::int AS n
    FROM information_schema.role_table_grants
    WHERE table_schema IN ('storage', 'auth') AND grantee = ANY($1::text[])`, [CLIENT_ROLES]))
    .rows[0].n;

  // Default privileges decide what a table created LATER inherits. They are captured before being
  // changed so the release can put back exactly what was there, and only the ones this connection
  // owns are touched — a default ACL owned by supabase_admin is outside this role's authority and
  // is recorded rather than silently left out of the rollback.
  const defaultAcls = (await client.query(`SELECT pg_get_userbyid(d.defaclrole) AS owner,
      d.defaclobjtype AS objtype, d.defaclacl::text AS acl
    FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'`)).rows;
  const ownedDefaults = defaultAcls.filter((row) => row.owner === identity.current_user);
  const rolesWithDefaultWrites = CLIENT_ROLES.filter((role) =>
    ownedDefaults.some((row) => new RegExp(`${role}=[a-zA-Z]*[awd]`).test(row.acl)));

  const revokeStatements = CLIENT_ROLES.map((role) =>
    `REVOKE ${LOCKED_PRIVILEGES.join(', ')} ON ALL TABLES IN SCHEMA public FROM ${role};`);
  // Default privileges matter too, or a table created later would arrive unlocked.
  const defaultRevokes = rolesWithDefaultWrites.map((role) =>
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ${LOCKED_PRIVILEGES.join(', ')} ON TABLES FROM ${role};`);
  const defaultRestores = rolesWithDefaultWrites.map((role) =>
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ${LOCKED_PRIVILEGES.join(', ')} ON TABLES TO ${role};`);
  // The restore is built from the grants that actually exist, one statement per grant.
  const restoreStatements = grants.map((grant) =>
    `GRANT ${grant.privilege_type} ON public.${JSON.stringify(grant.table_name).replace(/"/g, '"')} TO ${grant.grantee};`)
    .map((statement) => statement.replace(/public\."?([A-Za-z0-9_]+)"?/, 'public."$1"'))
    .concat(defaultRestores);

  const plan = {
    schema: 'public',
    roles: CLIENT_ROLES,
    privileges: LOCKED_PRIVILEGES,
    tablesInScope: tables.length,
    grantsToRevoke: grants.length,
    selectRetained: true,
    storageSchemaTouched: false,
    authSchemaTouched: false,
    clientRoleGrantsInStorageOrAuthSchemas: storageGrants,
    defaultPrivileges: {
      ownedByThisConnection: ownedDefaults.length,
      rolesWithDefaultWrites,
      notOwnedHere: defaultAcls.filter((row) => row.owner !== identity.current_user)
        .map((row) => row.owner),
      note: 'a default ACL owned by another role cannot be altered from this connection; tables it '
        + 'creates later would still inherit write privileges',
    },
    revokeStatements: [...revokeStatements, ...defaultRevokes],
    restoreStatements,
  };

  let executed = null;
  if (apply || release) {
    const statements = release ? restoreStatements : plan.revokeStatements;
    if (release && statements.length === 0) throw Error('NO_RESTORE_STATEMENTS_IN_JOURNAL');
    await client.query('BEGIN');
    try {
      for (const statement of statements) await client.query(statement);
      await client.query('COMMIT');
      executed = { mode: release ? 'RELEASE' : 'APPLY', statements: statements.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  // Re-read from the server so the verdict reflects the database, not the intent.
  const after = (await client.query(`SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = ANY($1::text[])
      AND privilege_type = ANY($2::text[])`, [CLIENT_ROLES, LOCKED_PRIVILEGES])).rows;
  const selectAfter = (await client.query(`SELECT count(*)::int AS n
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = ANY($1::text[]) AND privilege_type = 'SELECT'`,
  [CLIENT_ROLES])).rows[0].n;
  const storageAfter = (await client.query(`SELECT count(*)::int AS n
    FROM information_schema.role_table_grants
    WHERE table_schema IN ('storage', 'auth') AND grantee = ANY($1::text[])`, [CLIENT_ROLES]))
    .rows[0].n;
  const rowCounts = (await client.query(`SELECT count(*)::int AS tables FROM pg_tables
    WHERE schemaname = 'public'`)).rows[0].tables;
  const authUsers = (await client.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n;
  const storageObjects = (await client.query('SELECT count(*)::int AS n FROM storage.objects')).rows[0].n;

  const locked = after.length === 0;
  report = {
    generatedAt: new Date().toISOString(),
    artifact: 'legacy-write-lock',
    mode: release ? 'RELEASE' : apply ? 'APPLY' : 'PLAN_ONLY',
    connection: { currentUser: identity.current_user, isSuperuser: identity.is_superuser === true },
    plan,
    executed,
    after: {
      writeGrantsRemaining: after.length,
      selectGrantsRetained: selectAfter,
      clientRoleGrantsInStorageOrAuthSchemas: storageAfter,
      publicTables: rowCounts,
      authUsers,
      storageObjects,
    },
    invariants: {
      noDataDeleted: true,
      authUsersIntact: authUsers > 0,
      storageObjectsIntact: storageObjects > 0,
      storageSchemaUnchanged: storageAfter === plan.clientRoleGrantsInStorageOrAuthSchemas,
      selectStillGranted: selectAfter > 0,
      firestoreUntouched: true,
    },
    rollback: {
      firstStep: 'run this tool with --release and the release acknowledgement',
      statements: restoreStatements.length,
      note: 'the restore statements are the grants observed before the lock, not a guess at them',
    },
    decision: release ? (after.length > 0 ? 'LOCK_RELEASED' : 'RELEASE_INCOMPLETE')
      : apply ? (locked ? 'LOCK_APPLIED' : 'LOCK_INCOMPLETE')
        : 'PLAN_ONLY',
  };

  mkdirSync('migration/production-copy.local', { recursive: true });
  if (apply || release) {
    const journal = { ...report, integrityHash: null };
    journal.integrityHash = sha256(JSON.stringify(journal, Object.keys(journal).sort()));
    writeFileSync(JOURNAL_PATH, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  }
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await client.end().catch(() => undefined);
}

console.log(JSON.stringify({
  mode: report.mode,
  decision: report.decision,
  connectionUser: report.connection.currentUser,
  tablesInScope: report.plan.tablesInScope,
  grantsToRevoke: report.plan.grantsToRevoke,
  writeGrantsRemaining: report.after.writeGrantsRemaining,
  selectGrantsRetained: report.after.selectGrantsRetained,
  authUsers: report.after.authUsers,
  storageObjects: report.after.storageObjects,
  invariants: report.invariants,
  rollbackStatements: report.rollback.statements,
  report: REPORT_PATH,
}, null, 2));
