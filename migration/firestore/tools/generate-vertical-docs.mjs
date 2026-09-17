#!/usr/bin/env node
/**
 * Generates the factual half of each per-vertical migration document from live evidence.
 *
 * Everything here is measured: source tables and row counts from the read-only live
 * inventory, RPCs and call sites from the source tree. The design half (Firestore
 * collections, Rules model, transaction invariants) is authored per vertical and lives
 * in the "Design" section, which this generator preserves if already written.
 *
 * Read-only with respect to production. Writes only migration/firestore/verticals/*.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'migration/firestore/verticals';
const inventory = JSON.parse(readFileSync('migration/reports/live-vertical-inventory.json', 'utf8'));
const parity = JSON.parse(readFileSync('migration/reports/active-product-parity.json', 'utf8'));

// Source-tree call sites, attributed to a vertical by path and name.
const sourceFiles = [];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const path = join(dir, entry.name).replaceAll('\\', '/');
  if (entry.isDirectory()) walk(path); else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
});
walk('src');

const VERTICAL_HINTS = {
  tourism: [/trip/i, /travel/i, /visa/i],
  restaurant: [/restaurant/i, /kitchen/i, /reservation/i, /menu/i],
  supermarket: [/market/i, /supermarket/i, /product/i],
  auto_repair: [/\/cars\//i, /repair/i, /vehicle/i],
  car_parts: [/\/parts\//i, /car_?parts/i],
  phone_shop: [/phone_?shop/i],
  clothes_shop: [/clothes/i],
  furniture_store: [/furniture/i],
};
const CALL = {
  database: /supabase[A-Za-z]*\s*\.\s*from\s*\(\s*['"]([a-z0-9_]+)['"]/g,
  rpc: /supabase[A-Za-z]*\s*\.\s*rpc\s*\(\s*['"]([a-z0-9_]+)['"]/g,
};
const STORAGE = /supabase[A-Za-z]*\s*\.\s*storage\b/g;
const REALTIME = /supabase[A-Za-z]*\s*\.\s*channel\s*\(/g;

function attribute(vertical) {
  const hints = VERTICAL_HINTS[vertical] ?? [];
  const files = sourceFiles.filter((f) => hints.some((h) => h.test(f)));
  const tables = new Set(); const rpcs = new Set();
  let storage = 0; let realtime = 0; let database = 0; let rpcCalls = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(CALL.database)) { tables.add(m[1]); database += 1; }
    for (const m of text.matchAll(CALL.rpc)) { rpcs.add(m[1]); rpcCalls += 1; }
    storage += (text.match(STORAGE) ?? []).length;
    realtime += (text.match(REALTIME) ?? []).length;
  }
  return { files, tables: [...tables].sort(), rpcs: [...rpcs].sort(), database, rpcCalls, storage, realtime };
}

mkdirSync(DIR, { recursive: true });
const written = [];
for (const entry of inventory.verticals) {
  const attributed = attribute(entry.vertical);
  const path = join(DIR, `${entry.vertical}.md`);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const design = existing.includes('<!-- DESIGN:BEGIN -->')
    ? existing.slice(existing.indexOf('<!-- DESIGN:BEGIN -->'), existing.indexOf('<!-- DESIGN:END -->') + 19)
    : ['<!-- DESIGN:BEGIN -->', '## Design', '', '_Not authored yet._ Firestore collections, document IDs,',
      'relationships, Rules ownership model, transaction invariants, search and analytics',
      'strategy must be designed before this vertical can be migrated.', '', '<!-- DESIGN:END -->'].join('\n');

  const evidencePath = `migration/reports/vertical-parity-${entry.vertical}.json`;
  const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : null;
  /**
   * A gate can pass because it was proven or because there was nothing to prove, and the two must not read alike.
   * A vertical with no table, tenant or row takes the measured not-applicable path in vertical-parity-evidence, and
   * that exemption is recorded on the gate; rendering it as YES would claim a rehearsal that never happened.
   */
  const exempt = (gate) => typeof evidence?.gates?.[gate]?.notApplicable === 'string'
    // A surface gate over an empty list passes without proving anything, which is the right result for a vertical
    // that exposes no such surface but is not a claim that one was proven.
    || (Array.isArray(evidence?.gates?.[gate]?.surfaces) && evidence.gates[gate].surfaces.length === 0);
  const passed = (gate) => {
    if (evidence?.gates?.[gate]?.status !== 'PASS') return 'NO';
    return exempt(gate) ? 'N/A' : 'YES';
  };
  const both = (a, b) => (passed(a) === 'NO' || passed(b) === 'NO' ? 'NO'
    : passed(a) === 'N/A' && passed(b) === 'N/A' ? 'N/A' : 'YES');
  const measured = (parity.verticals ?? []).find((item) => item.vertical === entry.vertical);
  const supportedRoot = measured?.reachableInFirebaseRoot && measured?.firebaseRootForbiddenCallSites === 0 ? 'YES' : 'NO';
  // Nothing is migrated for a vertical that owns no source row, however green its gates are.
  const migrated = evidence?.decision !== 'PASS' ? 'NO'
    : entry.tables.length === 0 && entry.rows === 0 ? 'NO — nothing to migrate' : 'YES';
  const evidenceRows = evidence
    ? Object.entries(evidence.gates).map(([gate, value]) => `| ${gate} | ${value.status}${
      typeof value.notApplicable === 'string' ? ' (not applicable)' : ''} |`).join('\n')
    : '| _not generated_ | FAIL |';
  const exemptions = evidence
    ? Object.entries(evidence.gates).filter(([, value]) => typeof value.notApplicable === 'string')
      .map(([gate, value]) => `- \`${gate}\`: ${value.notApplicable}`).join('\n')
    : '';
  const rows = entry.tables.length
    ? entry.tables.map((t) => `| \`${t.table}\` | ${t.rows} |`).join('\n')
    : '| _none_ | 0 |';
  const body = `# Vertical: ${entry.vertical}

Generated by \`migration/firestore/tools/generate-vertical-docs.mjs\` from live read-only
evidence (\`migration/reports/live-vertical-inventory.json\`, \`active-product-parity.json\`).
Do not hand-edit outside the Design block.

## Status

| Field | Value |
| --- | --- |
| Classification | **${entry.classification}** |
| Tenants (live \`business_profiles\`) | **${entry.tenants}** |
| Source rows (live) | **${entry.rows}** |
| Firestore migrated | **${migrated}** |
| Reachable in a Firebase production root without Supabase database calls | **${supportedRoot}** |
| Rules authored and within budget | ${both('suites', 'rulesBudget')} |
| Data rehearsal reconciled | ${passed('dataRehearsal')} |
| UI parity proven | ${passed('uiSmoke')} |
| Search proven | ${passed('search')} |
| Analytics proven | ${passed('analytics')} |
| Retirement requires owner approval | YES |

## Source data (live counts, read-only)

| Table | Rows |
| --- | ---: |
${rows}

## Firebase production root (measured)

Runtime-reachable files of \`src/firebase-main.tsx\` attributed to this vertical, counted on the TypeScript AST by
\`migration/firestore/lib/import-graph.mjs\` (\`active-product-parity.json\`). This is what the product runs.

| Measure | Value |
| --- | ---: |
| Reachable surface files | ${measured?.firebaseRootSurfaceFiles ?? 'n/a'} |
| Supabase database call sites | ${measured?.firebaseRootForbiddenByCategory?.database ?? 'n/a'} |
| Supabase RPC call sites | ${measured?.firebaseRootForbiddenByCategory?.rpc ?? 'n/a'} |
| Supabase Auth call sites | ${measured?.firebaseRootForbiddenByCategory?.auth ?? 'n/a'} |
| Supabase database realtime call sites | ${measured?.firebaseRootForbiddenByCategory?.realtime ?? 'n/a'} |
| Supabase Edge Function call sites | ${measured?.firebaseRootForbiddenByCategory?.edgeFunctions ?? 'n/a'} |
| Forbidden call sites in the shipped Supabase root | ${measured?.shippedRootForbiddenCallSites ?? 'n/a'} |

## Whole source tree, attributed by file name

Every \`src\` file whose path matches this vertical's name hints, reachable or not, including the shipped Supabase
adapters and legacy code no root imports. A text count: it shows what still references Supabase, not what runs.

| Measure | Value |
| --- | ---: |
| Attributed source files | ${attributed.files.length} |
| Supabase database call sites | ${attributed.database} |
| Supabase RPC call sites | ${attributed.rpcCalls} |
| Supabase database realtime call sites | ${attributed.realtime} |
| Supabase Storage call sites (allowed) | ${attributed.storage} |

Tables referenced directly: ${attributed.tables.length ? attributed.tables.map((t) => `\`${t}\``).join(', ') : '_none detected_'}

RPCs referenced: ${attributed.rpcs.length ? attributed.rpcs.map((r) => `\`${r}\``).join(', ') : '_none detected_'}

## Parity evidence

Gates from \`${evidencePath}\`${evidence ? ` (generated ${evidence.generatedAt}, decision **${evidence.decision}**)` : ''}.

| Gate | Status |
| --- | --- |
${evidenceRows}${exemptions ? `\n\nA gate marked *not applicable* passed because this vertical has nothing for it to prove. The exemption is\nhonoured only against the measured live inventory, never on the configuration's word:\n\n${exemptions}` : ''}

${design}

## Test plan

Every item must pass before this vertical counts toward \`PRODUCT_PARITY_GO\`.

- Firestore Rules: anonymous denied; same tenant allowed; other tenant denied;
  \`businessId\` and owner fields immutable; role escalation denied; audit records immutable;
  financial fields tamper-proof; schema validation enforced.
- Malicious client: raw client-SDK writes attempting cross-tenant injection, total overwrite,
  audit deletion, forged role and child-object relinking — every one denied.
- Data rehearsal: counts, IDs, relationships, financial values, statuses, timestamps, JSON,
  Unicode and tenant ownership reconcile with **0 unexplained mismatch** and 0 migration-created orphans.
- Negative controls: deliberate corruption in this vertical is detected.
- UI parity: dashboard load, list, search, create, edit, delete/archive, analytics,
  printing/PDF where present, Arabic RTL, Hebrew RTL, English LTR.
- Quota: measured Enterprise read/write units for this vertical's workflows.
`;
  writeFileSync(path, body);
  written.push({ vertical: entry.vertical, classification: entry.classification, path });
}
console.log(JSON.stringify({ written: written.length, verticals: written.map((w) => `${w.vertical}:${w.classification}`) }, null, 2));
