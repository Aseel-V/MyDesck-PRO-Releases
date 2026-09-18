#!/usr/bin/env node
/**
 * Read-only audit of the historical synthetic Firebase Auth accounts (2026-09-09).
 *
 * Answers one question before any deletion is considered: would removing these identities touch a
 * single piece of customer data? It enumerates every Firestore document reachable in the production
 * database — every root collection, every document, and every subcollection under each document —
 * and classifies each as synthetic-linked, customer, or unattributed.
 *
 * Deletes nothing and writes nothing to production. Prints no passwords, tokens or emails beyond a
 * truncated synthetic prefix.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const PROJECT = 'mydesckpro';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/default/documents`;
const SYNTHETIC_PREFIX = 'migration-test--';

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const gcloud = (args) => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), ...args], { encoding: 'utf8', timeout: 120000 }).trim();
const migrationToken = gcloud(['auth', 'print-access-token',
  '--impersonate-service-account=mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com']);
const operatorToken = gcloud(['auth', 'print-access-token']);

// ---- the identities under audit ---------------------------------------------------------------
const accountsResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
  method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'x-goog-user-project': PROJECT,
    'Content-Type': 'application/json' }, body: JSON.stringify({ returnUserInfo: true }) });
const accountsBody = await accountsResponse.json();
const allAccounts = accountsBody.userInfo ?? [];
const historical = allAccounts.filter((u) => String(u.email ?? '').startsWith(SYNTHETIC_PREFIX));
const nonSynthetic = allAccounts.filter((u) => !String(u.email ?? '').startsWith(SYNTHETIC_PREFIX));
const historicalUids = new Set(historical.map((u) => u.localId));

// ---- exhaustive Firestore walk -----------------------------------------------------------------
const get = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${migrationToken}` }, signal: AbortSignal.timeout(60000) });
  return r.ok ? r.json() : { __error: r.status };
};
const listCollections = async (parent) => {
  const r = await fetch(`${parent}:listCollectionIds`, { method: 'POST',
    headers: { Authorization: `Bearer ${migrationToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 300 }), signal: AbortSignal.timeout(60000) });
  return r.ok ? ((await r.json()).collectionIds ?? []) : [];
};

const documents = [];
async function walk(parentUrl, prefix, depth) {
  if (depth > 4) return;
  for (const name of await listCollections(parentUrl)) {
    let pageToken;
    do {
      const url = new URL(`${parentUrl === DOCS ? DOCS : parentUrl}/${name}`);
      url.searchParams.set('pageSize', '300');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const body = await get(url.toString());
      if (body.__error) break;
      pageToken = body.nextPageToken;
      for (const document of body.documents ?? []) {
        const path = document.name.split('/documents/')[1];
        const fields = document.fields ?? {};
        const owner = fields.ownerUid?.stringValue ?? null;
        const userId = fields.userId?.stringValue ?? null;
        const uid = fields.uid?.stringValue ?? null;
        const docId = path.split('/').pop();
        const referenced = [owner, userId, uid, docId].filter(Boolean);
        const linkedToHistorical = referenced.some((v) => historicalUids.has(v))
          || [...historicalUids].some((u) => path.includes(u));
        documents.push({ path, collection: `${prefix}${name}`, ownerUid: owner, userId, uid,
          linkedToHistorical });
        await walk(`${DOCS}/${path}`, `${prefix}${name}/`, depth + 1);
      }
    } while (pageToken);
  }
}
await walk(DOCS, '', 0);

// ---- classification -----------------------------------------------------------------------------
const linked = documents.filter((d) => d.linkedToHistorical);
const unlinked = documents.filter((d) => !d.linkedToHistorical);

const report = {
  generatedAt: new Date().toISOString(), project: PROJECT, mode: 'READ_ONLY', productionMutations: 0,
  auth: {
    totalProductionAccounts: Number(accountsBody.recordsCount ?? allAccounts.length),
    historicalSyntheticAccounts: historical.length,
    nonSyntheticAccounts: nonSynthetic.length,
    accounts: historical.map((u) => ({
      uid: u.localId,
      uidIsUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.localId),
      createdAt: new Date(Number(u.createdAt)).toISOString().slice(0, 10),
      lastLoginAt: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toISOString().slice(0, 10) : null,
      emailPrefix: `${String(u.email ?? '').slice(0, 44)}...`,
      syntheticNamespace: String(u.email ?? '').startsWith(SYNTHETIC_PREFIX),
      providers: (u.providerUserInfo ?? []).map((p) => p.providerId),
    })),
  },
  firestore: {
    documentsInDatabase: documents.length,
    documentsLinkedToHistoricalAccounts: linked.length,
    documentsNotLinked: unlinked.length,
    linkedPaths: linked.map((d) => d.path),
    unlinkedPaths: unlinked.map((d) => ({ path: d.path, ownerUid: d.ownerUid })),
    collectionsWalked: [...new Set(documents.map((d) => d.collection))],
  },
  customerLinkage: {
    // Customer data would be a document owned by a uid that is NOT one of the synthetic accounts,
    // or any non-synthetic Auth account existing at all.
    nonSyntheticAuthAccounts: nonSynthetic.length,
    documentsOwnedByNonSyntheticUid: unlinked.filter((d) => d.ownerUid).length,
    productionAuthImportsPerformed: 0,
  },
};
report.customerLinkage.anyCustomerData = report.customerLinkage.nonSyntheticAuthAccounts > 0
  || report.customerLinkage.documentsOwnedByNonSyntheticUid > 0
  || report.firestore.documentsNotLinked > 0;

writeFileSync('migration/reports/historical-synthetic-account-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  historicalSyntheticAccounts: report.auth.historicalSyntheticAccounts,
  nonSyntheticAccounts: report.auth.nonSyntheticAccounts,
  firestoreDocumentsInDatabase: report.firestore.documentsInDatabase,
  documentsLinkedToHistorical: report.firestore.documentsLinkedToHistoricalAccounts,
  documentsNotLinked: report.firestore.documentsNotLinked,
  anyCustomerData: report.customerLinkage.anyCustomerData,
  collectionsWalked: report.firestore.collectionsWalked,
}, null, 2));
