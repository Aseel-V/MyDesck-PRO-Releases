#!/usr/bin/env node
// Read-only Google API inventory. OAuth tokens stay in memory; no credential files/logs.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const project = 'mydesckpro';
const database = `projects/${project}/databases/default`;
const migrationIdentity = `mydesck-migration@${project}.iam.gserviceaccount.com`;
const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
function gcloud(args) {
  try { return execFileSync(join(sdk, 'platform/bundledpython/python.exe'), [join(sdk, 'lib/gcloud.py'), ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 8e6 }).trim(); }
  catch { throw Error('GCLOUD_READ_FAILED_NO_CREDENTIAL_OUTPUT'); }
}
let operatorToken = gcloud(['auth', 'print-access-token']);
let migrationToken;
try { migrationToken = gcloud(['auth', 'print-access-token', `--impersonate-service-account=${migrationIdentity}`]); } catch {}
const allowedHosts = ['cloudbilling', 'cloudresourcemanager', 'serviceusage', 'iam', 'firestore',
  'firebaserules', 'firebase', 'firebasestorage', 'storage', 'cloudfunctions', 'firebaseappcheck', 'policytroubleshooter'];
async function request(url, { token = operatorToken, body } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !allowedHosts.some(h => u.hostname === `${h}.googleapis.com`)) throw Error('HOST_REFUSED');
  // Only these POST endpoints are read-only permission introspection.
  if (body && !/:(testIamPermissions|troubleshoot)$/.test(u.pathname)) throw Error('MUTATION_REFUSED');
  if (!token) return { http: 0, status: 'NOT_RUN_IMPERSONATION_UNAVAILABLE' };
  try {
    const quotaRequired = ['firebase.googleapis.com', 'firebaserules.googleapis.com', 'firebaseappcheck.googleapis.com', 'policytroubleshooter.googleapis.com'].includes(u.hostname);
    const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(token === operatorToken && quotaRequired ? { 'x-goog-user-project': project } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
    const data = await r.json();
    if (!r.ok) return { http: r.status, status: data.error?.status ?? 'API_ERROR',
      reasons: (data.error?.details ?? []).filter(d => d.reason).map(d => ({ reason: d.reason, service: d.metadata?.service, permission: d.metadata?.permission })),
      message: data.error?.message?.replace(/[\w.+-]+@[\w.-]+/g, '[principal]') };
    return { http: r.status, data };
  } catch { return { http: 0, status: 'NOT_RUN_NETWORK_ERROR' }; }
}
async function pages(url, key, opts) {
  const result = []; let next;
  do {
    const r = await request(url + (next ? `${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(next)}` : ''), opts);
    if (r.http !== 200) return r;
    result.push(...(r.data[key] ?? [])); next = r.data.nextPageToken;
  } while (next);
  return { http: 200, data: { [key]: result } };
}
const urls = {
  billing: `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
  project: `https://cloudresourcemanager.googleapis.com/v3/projects/${project}`,
  firebase: `https://firebase.googleapis.com/v1beta1/projects/${project}`,
  databases: `https://firestore.googleapis.com/v1/projects/${project}/databases`,
  defaultDatabase: `https://firestore.googleapis.com/v1/${database}`,
  parenthesizedDatabase: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`,
  defaultBucket: `https://firebasestorage.googleapis.com/v1alpha/projects/${project}/defaultBucket`,
  appCheck: `https://firebaseappcheck.googleapis.com/v1/projects/816880250172/services`,
};
const evidence = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([k, url]) => [k, await request(url)])));
// Never retain billing account ID or payment information.
if (evidence.billing.http === 200) evidence.billing.data = {
  billingEnabled: evidence.billing.data.billingEnabled === true,
  accountLinked: Boolean(evidence.billing.data.billingAccountName),
};
Object.assign(evidence, Object.fromEntries(await Promise.all([
  ['services', 'https://serviceusage.googleapis.com/v1/projects/816880250172/services?filter=state:ENABLED&pageSize=200', 'services'],
  ['buckets', `https://storage.googleapis.com/storage/v1/b?project=${project}&projection=noAcl`, 'items'],
  ['firebaseBuckets', `https://firebasestorage.googleapis.com/v1beta/projects/${project}/buckets`, 'buckets'],
  ['indexes', `https://firestore.googleapis.com/v1/${database}/collectionGroups/-/indexes`, 'indexes'],
  ['releases', `https://firebaserules.googleapis.com/v1/projects/${project}/releases`, 'releases'],
  ['functions', `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`, 'functions'],
  ['serviceAccounts', `https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`, 'accounts'],
].map(async ([k,url,key]) => [k, await pages(url,key)]))));
// gcloud policy inspection is explicit; retain service identities and anonymized human counts.
let policy;
try { policy = JSON.parse(gcloud(['projects', 'get-iam-policy', project, '--format=json'])); }
catch { policy = null; }
evidence.iamPolicy = policy ? { status: 'PASS', version: policy.version,
  bindings: policy.bindings.map(b => ({ role: b.role, condition: b.condition ?? null,
    serviceAccounts: b.members.filter(m => m.startsWith('serviceAccount:')),
    humanCount: b.members.filter(m => m.startsWith('user:')).length,
    groupCount: b.members.filter(m => m.startsWith('group:')).length,
    publicMembers: b.members.filter(m => ['allUsers', 'allAuthenticatedUsers'].includes(m)) })) } : { status: 'NOT_RUN_POLICY_READ_FAILED' };
if (evidence.serviceAccounts.http === 200) evidence.serviceAccounts.data = {
  accounts: evidence.serviceAccounts.data.accounts.map(a => ({ email: a.email, disabled: a.disabled === true })) };
evidence.migrationBoundRole = await request('https://iam.googleapis.com/v1/roles/firebaseauth.admin');
evidence.serviceAccountActAs = await Promise.all((evidence.serviceAccounts.data?.accounts ?? []).map(async a => ({
  resource:a.email, result:await request(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts/${a.email}:testIamPermissions`,
    { token:migrationToken ?? '', body:{permissions:['iam.serviceAccounts.actAs','iam.serviceAccounts.getAccessToken','iam.serviceAccounts.setIamPolicy']} }),
})));
const required = ['datastore.databases.get', 'datastore.databases.getMetadata', 'datastore.entities.get',
  'datastore.entities.list', 'datastore.entities.create', 'datastore.entities.update', 'datastore.entities.delete'];
const prohibited = ['resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.createBillingAssignment', 'iam.serviceAccounts.actAs',
  'secretmanager.versions.access'];
evidence.migrationProjectPermissions = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,
  { token: migrationToken ?? '', body: { permissions: [...required, ...prohibited, 'firebaserules.releases.get', 'firebaserules.rulesets.get'] } });
evidence.migrationDatabasePermissions = await request(`https://firestore.googleapis.com/v1/${database}:testIamPermissions`,
  { token: migrationToken ?? '', body: { permissions: required } });
evidence.migrationRules = await request(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore/default`, { token: migrationToken ?? '' });
// Nonexistent synthetic document read is sufficient to distinguish IAM 403 from document 404; no customer read.
evidence.migrationSyntheticRead = await request(`https://firestore.googleapis.com/v1/${database}/documents/migration-test--permission-probe/never-created`, { token: migrationToken ?? '' });
evidence.troubleshooter = await request('https://policytroubleshooter.googleapis.com/v1/iam:troubleshoot', { body: {
  accessTuple: { principal: migrationIdentity, fullResourceName: `//firestore.googleapis.com/${database}`, permission: 'datastore.entities.create' },
} });
if (evidence.services.http === 200) evidence.services.data.services = evidence.services.data.services.map(s => ({ name: s.config.name, state: s.state }));
const release = evidence.releases.data?.releases?.find(r => r.name === `projects/${project}/releases/cloud.firestore/default`);
const captureRoot = 'migration/firestore/release/current-production';
if (release) {
  evidence.currentRelease = await request(`https://firebaserules.googleapis.com/v1/${release.name}`);
  evidence.currentRuleset = await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  if (evidence.currentRuleset.http === 200) {
    const version = release.rulesetName.split('/').at(-1);
    if (!/^[a-zA-Z0-9-]+$/.test(version)) throw Error('RULESET_VERSION_REFUSED');
    const dir = `${captureRoot}/${version}`;
    mkdirSync(dir, { recursive: true });
    const files = evidence.currentRuleset.data.source?.files ?? [];
    evidence.currentRules = { release: release.name, ruleset: release.rulesetName, updateTime: release.updateTime,
      files: files.map((f,i) => {
        const path = `${dir}/source-${i}.rules`;
        writeFileSync(path, f.content);
        return { name: f.name, path, sha256: createHash('sha256').update(f.content).digest('hex') };
      }) };
    writeFileSync(`${dir}/manifest.json`, JSON.stringify(evidence.currentRules, null, 2) + '\n');
    writeFileSync(`${captureRoot}/manifest.json`, JSON.stringify(evidence.currentRules, null, 2) + '\n');
    const rollbackRoot = 'migration/firestore/release/rollback-production';
    if (!existsSync(`${rollbackRoot}/manifest.json`)) {
      mkdirSync(rollbackRoot, { recursive:true });
      const rollback = {...evidence.currentRules,files:evidence.currentRules.files.map((f,i)=>{
        const path=`${rollbackRoot}/source-${i}.rules`;
        writeFileSync(path,readFileSync(f.path),{flag:'wx'});
        return {...f,path};
      })};
      writeFileSync(`${rollbackRoot}/manifest.json`,JSON.stringify(rollback,null,2)+'\n',{flag:'wx'});
    }
    evidence.rollbackRules = JSON.parse(readFileSync(`${rollbackRoot}/manifest.json`,'utf8'));
    // Only hashes/source artifact paths retained in inventory.
    delete evidence.currentRuleset;
  }
}
const report = { generatedAt: new Date().toISOString(), project, database, migrationIdentity,
  readOnly: true, productionMutations: 0, impersonation: migrationToken ? 'PASS' : 'NOT_RUN', evidence };
writeFileSync('migration/reports/firebase-production-environment-inventory.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ generatedAt: report.generatedAt, checks: Object.fromEntries(Object.entries(evidence).map(([k,v]) => [k, v.http ?? v.status ?? 'CAPTURED'])), billing: evidence.billing, productionMutations: 0 }));
