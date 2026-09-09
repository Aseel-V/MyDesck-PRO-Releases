import { writeReport } from './lib/write-report.mjs';
import { approvedIdentities, localConfig, qi, withSourceSnapshot } from './lib/staging-source.mjs';

const report = { generatedAt: new Date().toISOString(), status: 'BLOCKED',
  sourceProject: 'pubugnfaqqukelvgckdr', realCustomerRowsExported: 0,
  identityRowsRead: 0, businessRowsExported: 0, sourceSafety: {}, blockers: [] };
try {
  const users = approvedIdentities();
  report.sliceUids = users.map(x => x.uid);
  await withSourceSnapshot(localConfig(), async select => {
    const { rows } = await select(`SELECT id::text, email, created_at::text
      FROM auth.users WHERE id = ANY($1::uuid[]) ORDER BY id`, [report.sliceUids]);
    report.identityRowsRead = rows.length;
    if (rows.length !== users.length || rows.some(x => !users.some(y => y.uid === x.id && y.email === x.email))) {
      throw new Error('SOURCE_IDENTITIES_CHANGED');
    }
    report.identityValidation = 'MATCH';
    report.source = (await select(`SELECT current_setting('server_version') AS version,
      current_setting('server_encoding') AS encoding,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
      has_table_privilege(current_user, 'public.trips', $1) AS role_has_update`, ['UPDATE'])).rows[0];
    report.tables = (await select(`SELECT c.relname AS name, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
    report.foreignKeys = (await select(`SELECT c.conname AS name,
      ns.nspname AS child_schema, rel.relname AS child_table,
      pn.nspname AS parent_schema, pr.relname AS parent_table,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(id,ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.id ORDER BY k.ord) AS child_columns,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(id,ord)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.id ORDER BY k.ord) AS parent_columns
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_class pr ON pr.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pr.relnamespace
      WHERE c.contype='f' AND ns.nspname='public' ORDER BY rel.relname,c.conname`)).rows;
    report.directSyntheticCounts = [];
    for (const table of report.tables) {
      const edges = report.foreignKeys.filter(f => f.child_table === table.name && f.parent_schema === 'auth' &&
        f.parent_table === 'users' && f.child_columns.length === 1 && f.parent_columns[0] === 'id');
      if (!edges.length) continue;
      // Counts only, never read customer contents. Actor-only references are
      // inventory candidates, not automatic authorization to export those rows.
      const predicate = edges.map(f => `${qi(f.child_columns[0])} = ANY($1::uuid[])`).join(' OR ');
      const { rows: [count] } = await select(`SELECT count(*)::text AS count FROM public.${qi(table.name)} WHERE ${predicate}`, [report.sliceUids]);
      report.directSyntheticCounts.push({ table: table.name, count: count.count, dependencyColumns: edges.map(f => f.child_columns[0]) });
    }
    report.syntheticDirectRows = report.directSyntheticCounts.reduce((sum,x) => sum + BigInt(x.count), 0n).toString();
    report.status = 'INVENTORIED';
  }, report.sourceSafety);
} catch (error) {
  const safe = ['SOURCE_PROJECT_MISMATCH','SOURCE_NOT_READ_ONLY','SOURCE_WRITE_CONTROL_FAILED',
    'SOURCE_QUERY_NOT_SELECT','SOURCE_IDENTITIES_CHANGED','SYNTHETIC_SLICE_INVALID','CLEANUP_APPROVAL_CHANGED'];
  report.blockers.push(safe.includes(error.message) ? error.message : 'SOURCE_INVENTORY_FAILED');
  report.errorCode = /^[A-Z0-9_]{2,50}$/.test(error.code ?? '') ? error.code : null;
}
writeReport('migration/reports/staging-source-inventory.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status:report.status,identityRowsRead:report.identityRowsRead,
  directRows:report.syntheticDirectRows, tables:report.tables?.length,
  nonempty:report.directSyntheticCounts?.filter(x=>x.count!=='0'), safety:report.sourceSafety, blockers:report.blockers}));
process.exitCode = report.status === 'INVENTORIED' ? 0 : 2;
