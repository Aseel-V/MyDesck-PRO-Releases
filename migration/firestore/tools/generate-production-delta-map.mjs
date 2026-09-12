#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import inventory from '../../reports/firestore-source-domain-inventory.json' with { type: 'json' };
import { TABLE_MAP_BY_NAME } from '../lib/table-map.mjs';

const appendNames = /(?:events?|audit|logs?)$/i;
const freezeNames = new Set(['fiscal_counters', 'z_report_counters', 'trip_pdf_rate_limits']);
const rows = inventory.tables.map((table) => {
  const map = TABLE_MAP_BY_NAME.get(table.name);
  const columns = new Set(table.columns.map((c) => c.name));
  const updatedTrigger = table.userTriggers.some((t) => /updated_at/i.test(t.function));
  let classification;
  let strategy;
  if (map?.appendOnly || appendNames.test(table.name)) {
    classification = 'APPEND_ONLY_EVENT';
    strategy = 'Replay stable primary keys above the checkpoint, then compare the complete ordered PK/hash set during freeze.';
  } else if (freezeNames.has(table.name)) {
    classification = 'FREEZE_REQUIRED';
    strategy = 'Freeze the owning workflow before the final read and perform a complete PK/hash reconciliation.';
  } else if (columns.has('updated_at') && updatedTrigger) {
    classification = 'RELIABLE_UPDATED_AT';
    strategy = 'Read updated_at above the T0 watermark inside the final read-only snapshot, then perform full PK/hash reconciliation.';
  } else if (columns.has('created_at') && map?.disposition === 'ARCHIVE') {
    classification = 'RELIABLE_CREATED_AT';
    strategy = 'Copy new immutable history by created_at plus PK; validate immutability and full PK/hash set under freeze.';
  } else {
    classification = 'FULL_RECOPY_REQUIRED';
    strategy = 'Do not trust timestamps; re-stream the complete table during freeze and converge by deterministic ID and canonical hash.';
  }
  return { table: table.name, domain: map?.domain, classification, hasCreatedAt: columns.has('created_at'),
    hasUpdatedAt: columns.has('updated_at'), updatedAtTrigger: updatedTrigger, strategy };
});
const counts = Object.fromEntries([...new Set(rows.map((r) => r.classification))].sort()
  .map((name) => [name, rows.filter((r) => r.classification === name).length]));
const output = { generatedAt: new Date().toISOString(), tables: rows.length, unknown: 0, counts, rows };
writeFileSync('migration/firestore/config/production-delta-map.json', `${JSON.stringify(output, null, 2)}\n`);
const grouped = [...new Set(rows.map((r) => r.classification))].sort().map((classification) => {
  const items = rows.filter((r) => r.classification === classification);
  return `## ${classification} (${items.length})\n\n${items.map((r) => `- \`${r.table}\`: ${r.strategy}`).join('\n')}`;
}).join('\n\n');
writeFileSync('migration/firestore/PRODUCTION_DELTA_MAP.md', `# Production delta map\n\n` +
  `Machine evidence: \`migration/firestore/config/production-delta-map.json\`. All ${rows.length} source tables are classified; UNKNOWN = 0. A timestamp is trusted only when the schema records an update trigger or the table is explicitly immutable history. Every final pass ends with complete PK and canonical-hash reconciliation, so a missed timestamp update cannot disappear silently.\n\n${grouped}\n\n## Final delta algorithm\n\n1. Enable maintenance and prove all source business writes are rejected.\n2. Begin one PostgreSQL \`REPEATABLE READ READ ONLY\` transaction and record the final marker.\n3. Apply updated/created/event deltas, full re-copies, and frozen-domain reads according to this map.\n4. Apply the Storage path/size/SHA-256 delta from a fresh object listing.\n5. Reconcile complete source and target PK sets, canonical hashes, money, relationships, events, timestamps, and Storage hashes.\n6. Return \`NO_GO\` on any mismatch. Backend switching is a later, separately approved action.\n`);
console.log(JSON.stringify({ tables: rows.length, unknown: 0, counts }));
