#!/usr/bin/env node
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const normalize = (value) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
const result = await withSourceSnapshot(localConfig(), async (select) => {
  const rows = (await select(`SELECT id::text, user_id::text AS tenant_id, search_document,
    updated_at::text AS order_key FROM public.trips ORDER BY user_id, id`)).rows;
  const byTenant = new Map();
  for (const row of rows) { const list = byTenant.get(row.tenant_id) ?? []; list.push(row); byTenant.set(row.tenant_id, list); }
  const cases = [];
  for (const [tenantId, tenantRows] of byTenant) {
    const tokens = [...new Set(tenantRows.flatMap((row) => normalize(row.search_document ?? '').split(' '))
      .filter((token) => token.length >= 2))].slice(0, 4);
    for (const term of tokens) {
      const expected = (await select(`SELECT id::text FROM public.trips t WHERE t.user_id = $1::uuid
        AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(lower(trim($2::text)), '\\s+') token
          WHERE token <> '' AND t.search_document NOT LIKE '%' || token || '%') ORDER BY t.updated_at, t.id`,
      [tenantId, term])).rows.map((row) => row.id);
      const actual = tenantRows.filter((row) => normalize(term).split(' ')
        .every((token) => normalize(row.search_document ?? '').includes(token)))
        .sort((a, b) => a.order_key.localeCompare(b.order_key) || a.id.localeCompare(b.id)).map((row) => row.id);
      cases.push({ matched: JSON.stringify(actual) === JSON.stringify(expected), resultCount: actual.length });
    }
  }
  return { rows: rows.length, tenants: byTenant.size, cases };
});
const mismatches = result.cases.filter((item) => !item.matched).length;
const report = { generatedAt: new Date().toISOString(), status: mismatches ? 'FAIL' : 'PASS',
  sourceSnapshot: { readOnly: true, isolationLevel: 'repeatable read', writesCaused: 0 },
  corpusRows: result.rows, tenants: result.tenants, cases: result.cases.length,
  mismatches, piiPersisted: false, semantics: 'case-insensitive AND-token substring with stable order' };
writeReport('migration/reports/firestore-search-full-corpus-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (mismatches) process.exitCode = 1;
