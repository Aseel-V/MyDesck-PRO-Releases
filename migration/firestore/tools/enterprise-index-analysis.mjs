#!/usr/bin/env node
// Read-only Enterprise Query Explain. OAuth token remains in memory and no document payload is persisted.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const project = 'mydesckpro';
const database = 'default';
const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const token = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
const specs = JSON.parse(readFileSync('migration/firestore/rules/firestore.indexes.json', 'utf8')).indexes;
const field = (fieldPath, value) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value } });
const and = (...filters) => ({ compositeFilter: { op: 'AND', filters } });
const queries = [
  { from: [{ collectionId: 'trips' }], where: and(field('ownerUid',{stringValue:'migration-test--explain'}), field('businessId',{stringValue:'migration-test--explain'}), field('isDeleted',{booleanValue:false})), orderBy: [{field:{fieldPath:'startDate'},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}], limit: 25 },
  { from: [{ collectionId: 'trips' }], where: and(field('ownerUid',{stringValue:'migration-test--explain'}), field('businessId',{stringValue:'migration-test--explain'}), field('isDeleted',{booleanValue:false}), field('status',{stringValue:'active'})), orderBy: [{field:{fieldPath:'startDate'},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}], limit: 25 },
  { from: [{ collectionId: 'tripInstallments' }], where: and(field('ownerUid',{stringValue:'migration-test--explain'}), field('businessId',{stringValue:'migration-test--explain'}), {fieldFilter:{field:{fieldPath:'status'},op:'IN',value:{arrayValue:{values:[{stringValue:'scheduled'},{stringValue:'partial'}]}}}}, {fieldFilter:{field:{fieldPath:'dueDate'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:'9999-12-31'}}}), orderBy: [{field:{fieldPath:'dueDate'},direction:'ASCENDING'}], limit: 100 },
];
async function explain(structuredQuery) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery, explainOptions: { analyze: false } }), signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) return { http: response.status, status: data.error?.status ?? data[0]?.error?.status ?? 'API_ERROR',
    message: data.error?.message ?? data[0]?.error?.message ?? 'UNSPECIFIED_API_ERROR' };
  const last = data.at(-1) ?? {};
  return { http: response.status, planSummary: last.explainMetrics?.planSummary ?? null };
}
const plans = [];
for (let i=0;i<queries.length;i+=1) plans.push(await explain(queries[i]));
const corpus = { trips: 99, tripInstallments: 37, maximumDocumentBytes: 4835 };
const fullScanUnits = (documents) => Math.ceil(documents * corpus.maximumDocumentBytes / 4096);
const classifications = specs.map((spec,index) => ({
  index: index + 1, collectionGroup: spec.collectionGroup, fields: spec.fields,
  query: spec['//'], state: 'MISSING', plan: plans[index],
  corpusDocuments: spec.collectionGroup === 'trips' ? corpus.trips : corpus.tripInstallments,
  conservativeUnindexedReadUnits: fullScanUnits(spec.collectionGroup === 'trips' ? corpus.trips : corpus.tripInstallments),
  classification: index < 2 ? 'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE' : 'COST_OPTIMIZATION',
  hardDryRunGate: index < 2,
  rationale: index < 2
    ? 'Common list query; full scans scale with the tenant collection and consume materially more read units than the 25-result page.'
    : 'Current 37-row collection remains bounded; index reduces scan cost but its absence does not block a no-customer-write dry-run.',
}));
const report = {
  generatedAt: new Date().toISOString(), project, database, edition: 'ENTERPRISE', mode: 'NATIVE', readOnly: true,
  productionMutations: 0, officialModel: { unindexedQueriesExecute: true, readUnitTrancheBytes: 4096, writeUnitTrancheBytes: 1024 },
  corpus, classifications, hardRequiredIndexes: classifications.filter((item)=>item.hardDryRunGate).length,
  hardRequiredReady: 0,
};
writeReport('migration/reports/firestore-enterprise-index-analysis.json', `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({plans:plans.map(p=>p.http),classifications:classifications.map(i=>i.classification),hardRequired:report.hardRequiredIndexes,ready:report.hardRequiredReady}));
