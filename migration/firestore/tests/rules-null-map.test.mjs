import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { RulesClient, toFirestoreFields } from '../lib/rules-client.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const root = 'migration/reports/rules-null-map-fix';
// RULES_DIFF_BASELINE re-points the differential at any earlier candidate, so a later change can be
// proved against the ruleset it actually supersedes rather than only against the original one. The
// per-case `previousAllow` overrides describe the ORIGINAL pre-fix candidate specifically, so they
// apply only to the default baseline; against any other baseline both versions must agree exactly.
const baseline = process.env.RULES_DIFF_BASELINE ?? `${root}/previous-candidate.rules`;
const baselineIsOriginal = process.env.RULES_DIFF_BASELINE === undefined;
const sources = [readFileSync(baseline, 'utf8'), readFileSync('migration/firestore/rules/firestore.rules', 'utf8')];
const decimal = n => ({ decimal: String(n), unitsText: String(n), units: null, scale: 0 });
// Extract the actual functions, including map literals, rather than copying their implementations.
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function exists: ${name}`);
  let depth = 0, quote = null;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    const c = source[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '/' && source[i + 1] === '/') i = source.indexOf('\n', i);
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`UNTERMINATED_FUNCTION:${name}`);
}
const line = { orderId: 'order', priceAtTime: decimal(5), quantity: 2, status: 'pending', voided: false };
const ledger = { ledgerItemId: 'line', ledgerRevision: 1, itemsTotal: decimal(10) };
const prior = { ledgerRevision: 0, itemsTotal: decimal(0) };
const service = { partId: 'part', partQuantity: 2, partItemId: 'item', partPrice: decimal(10), partCost: decimal(6) };
const part = { quantity: 5, sellingPriceUnit: decimal(5), purchasePriceUnit: decimal(3) };
const consumed = { ...part, quantity: 3, lastRepairServiceId: 'service' };
const item = { repairServiceId: 'service' };
const cases = [
  { name: 'part consumption', kind: 'repair', before: part, after: consumed, item, d: service, allow: true },
  ...[undefined, {}, { ...part, quantity: null }, { ...part, quantity: '5' }].map((before, i) =>
    ({ name: `part before missing/empty/null/wrong-type ${i}`, kind: 'repair', before, after: consumed, item, d: service, allow: false })),
  ...[undefined, {}, { ...consumed, quantity: null }, { ...consumed, lastRepairServiceId: null }].map((after, i) =>
    ({ name: `part after missing/empty/null/wrong-link ${i}`, kind: 'repair', before: part, after, item, d: service, allow: false })),
  { name: 'both part documents absent', kind: 'repair', d: service, item, allow: false },
  { name: 'missing service item', kind: 'repair', before: part, after: consumed, d: service, allow: false },
  { name: 'null service item linkage', kind: 'repair', before: part, after: consumed, item: { repairServiceId: null }, d: service, allow: false },
  { name: 'forged financial value', kind: 'repair', before: part, after: consumed, item, d: { ...service, partPrice: decimal(1) }, allow: false },
  { name: 'null part with nonzero charge', kind: 'repair', d: { ...service, partId: null }, allow: false },
  { name: 'valid labor-only absence', kind: 'repair', d: { partId: null, partQuantity: 0, partItemId: null, partPrice: decimal(0), partCost: decimal(0) }, allow: true },
  { name: 'missing partId field', kind: 'repair', d: { ...service, partId: undefined }, allow: false },
  { name: 'non-string partId with matching document name', kind: 'repair', partPath: '7', before: part, after: consumed, item,
    d: { ...service, partId: 7 }, previousAllow: true, allow: false },
  { name: 'line created with exact ledger', kind: 'ledger', after: line, d: ledger, allow: true },
  { name: 'line deleted with exact ledger', kind: 'ledger', before: line, d: { ...ledger, itemsTotal: decimal(0) }, prior: { ...prior, itemsTotal: decimal(10) }, allow: true },
  { name: 'line updated with exact ledger', kind: 'ledger', before: line, after: { ...line, quantity: 3 }, d: { ...ledger, itemsTotal: decimal(15) }, prior: { ...prior, itemsTotal: decimal(10) }, allow: true },
  { name: 'both line documents absent even with zero delta', kind: 'ledger', d: { ...ledger, itemsTotal: decimal(0) }, allow: false },
  ...[{}, { ...line, orderId: null }, { ...line, orderId: 'foreign-order' }, { ...line, priceAtTime: null }, { ...line, quantity: null }].flatMap((bad, i) => [
    { name: `malformed/foreign line after ${i}`, kind: 'ledger', after: bad, d: ledger, allow: false },
    { name: `malformed/foreign line before ${i}`, kind: 'ledger', before: bad, after: line, d: ledger, allow: false },
  ]),
  { name: 'null ledger reference', kind: 'ledger', after: line, d: { ...ledger, ledgerItemId: null }, allow: false },
  { name: 'missing ledger reference', kind: 'ledger', after: line, d: { ...ledger, ledgerItemId: undefined }, allow: false },
  { name: 'forged total', kind: 'ledger', after: line, d: { ...ledger, itemsTotal: decimal(1) }, allow: false },
  { name: 'skipped revision', kind: 'ledger', after: line, d: { ...ledger, ledgerRevision: 2 }, allow: false },
];
const results = [];
test('actual helpers preserve valid operations and fail closed, with explicit non-string part ID hardening', async t => {
  for (const [version, source] of sources.entries()) {
    const project = `mydesck-null-map-${version}`;
    const helpers = ['decimalOrZero', 'pow10', 'isProduct', 'sfDecimal', 'activeLine', 'lineUnitsAt', 'unitsAt', 'ledgerMoved', 'validServicePart'];
    // Keyed off the source, not the slot: any baseline that already carries the extracted helper
    // needs it in its probe too, otherwise the probe fails to compile rather than measuring anything.
    if (source.includes('function validConsumedPart(')) helpers.push('validConsumedPart');
    const content = `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents {
      function scopedPath(c, id) { return /databases/$(database)/documents/businesses/b/$(c)/$(id); }
      match /probes/{orderId} {
        ${helpers.map(name => extract(source, name)).join('\n')}
        allow create: if request.resource.data.kind == 'repair'
          ? validServicePart('service', request.resource.data.d)
          : ledgerMoved(request.resource.data.before, request.resource.data.d);
      }
      // Only isolated fixture writes are open; this harness tests helper semantics, not authorization.
      match /businesses/b/{collection}/{id} { allow write: if true; }
    } }`;
    const load = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'probe.rules', content }] } }) });
    assert.equal(load.ok, true, await load.text());
    const admin = RulesClient.asAdminBypass({ host, projectId: project });
    const client = RulesClient.asUser('probe', { host, projectId: project });
    for (const c of cases) await t.test(`${version ? 'candidate' : 'previous'}: ${c.name}`, async () => {
      const path = `businesses/b/${c.kind === 'repair' ? `parts/${c.partPath ?? 'part'}` : 'orderItems/line'}`;
      await admin.delete('probes/order');
      await admin.delete(path);
      await admin.delete('businesses/b/repairOrderItems/item');
      if (c.before !== undefined) assert.ok((await admin.set(path, c.before)).ok);
      if (c.item !== undefined) assert.ok((await admin.set('businesses/b/repairOrderItems/item', c.item)).ok);
      const prefix = `projects/${project}/databases/(default)/documents/`;
      const writes = c.after === undefined ? [{ delete: prefix + path }]
        : [{ update: { name: prefix + path, fields: toFirestoreFields(c.after) } }];
      const d = Object.fromEntries(Object.entries(c.d).filter(([, v]) => v !== undefined));
      writes.push({ update: { name: prefix + 'probes/order', fields: toFirestoreFields({ kind: c.kind, d, before: c.prior ?? prior }) } });
      const response = await fetch(`${client.base}:commit`, { method: 'POST', headers: client.headers(), body: JSON.stringify({ writes }) });
      const allowed = version === 0 && baselineIsOriginal ? (c.previousAllow ?? c.allow) : c.allow;
      assert.equal(response.status, allowed ? 200 : 403, `${c.name}: ${await response.text()}`);
      results.push({ version: version ? 'candidate' : 'previous', name: c.name, expected: allowed ? 'ALLOW' : 'DENY', status: response.status });
    });
  }
  writeFileSync(`${root}/semantic-cases.json`, `${JSON.stringify({ results, differences: results.slice(cases.length).filter((r, i) => r.status !== results[i].status) }, null, 2)}\n`);
});
