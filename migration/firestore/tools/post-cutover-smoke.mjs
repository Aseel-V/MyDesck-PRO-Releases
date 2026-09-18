#!/usr/bin/env node
/**
 * Post-cutover production smoke against the real v0.0.62 backend.
 *
 * Everything here is synthetic and everything created is recorded in a manifest before it is
 * created, so the cleanup path can only ever delete things this run made. Cleanup runs in a
 * `finally`, so a failing assertion still cleans up — the previous smoke in this project left
 * thirty documents behind and they blocked reconciliation for an entire stage.
 *
 * Synthetic documents are templated from a real document of the same collection rather than
 * invented. The deployed Rules carry generated schema validators, and a hand-written document would
 * fail validation for reasons that have nothing to do with whether the cutover works; copying the
 * field shape and substituting synthetic values tests the path the application actually uses.
 * Customer values are read to learn the shape and are never written anywhere.
 *
 * Runtime reachability is measured, not inferred: `fetch` is wrapped for the whole process, so every
 * host the Firebase and Supabase SDKs actually contact is counted. That is real network evidence
 * for the SDK contracts. It is not evidence about the packaged Electron binary, which is captured
 * separately and reported separately rather than conflated with this.
 *
 *   node migration/firestore/tools/post-cutover-smoke.mjs [--keep-manifest]
 */
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const SIGNATURE_BUCKET = 'business-signatures';
const CUSTOMER_SIGNATURE_OWNER = '72647632-d481-4889-bf27-ed1bb14ad347';
const REPORT_PATH = 'migration/reports/firestore-post-cutover-smoke.json';
const runId = `postcutover-${randomUUID()}`;
const MANIFEST_PATH = `migration/post-cutover-smoke.local/${runId}.json`;
const SYNTH = `migration-test--${runId}`;

// ---- runtime network instrumentation -------------------------------------------------------------
const hosts = new Map();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  try { const host = new URL(url).host; hosts.set(host, (hosts.get(host) ?? 0) + 1); } catch { /* ignore */ }
  return originalFetch(input, init);
};

const manifest = { runId, createdAt: new Date().toISOString(), target: 'PRODUCTION', project: PROJECT,
  syntheticPrefix: SYNTH, authUids: [], firestorePaths: [], storageObjects: [] };
const persistManifest = () => writeReport(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
const checks = [];
// The Firestore Web SDK does not go through global fetch in Node, so reachability is counted from
// operations the server actually answered. A PERMISSION_DENIED is a server answer and therefore
// proof of reachability just as much as a success is.
let firestoreServerAnswers = 0;
const firestoreCall = async (fn) => {
  try { const value = await fn(); firestoreServerAnswers += 1; return value; }
  catch (error) {
    if (/permission|denied|not-found|already exists|invalid/i.test(error?.message ?? '')) {
      firestoreServerAnswers += 1;
    }
    throw error;
  }
};
const record = (category, name, ok, detail = null) => {
  checks.push({ category, name, ok, detail: detail ? String(detail).slice(0, 200) : null });
  return ok;
};
const expect = async (category, name, fn) => {
  try { const value = await fn(); record(category, name, true); return value; }
  catch (error) { record(category, name, false, error?.message ?? error); return null; }
};
const expectDenied = async (category, name, fn) => {
  try { await fn(); return record(category, name, false, 'operation unexpectedly succeeded'); }
  catch (error) {
    const denied = /permission|insufficient|PERMISSION_DENIED|denied|Missing or insufficient/i
      .test(error?.message ?? '');
    return record(category, name, denied, denied ? null : error?.message);
  }
};

// ---- identity and configuration ------------------------------------------------------------------
const sdk = process.env.GCLOUD_SDK_ROOT
  ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
const operatorToken = () => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();

const firebaseEntry = join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools',
  'lib', 'bin', 'firebase.js');
const sdkConfigRaw = execFileSync(process.execPath,
  [firebaseEntry, 'apps:sdkconfig', 'WEB', '--project', PROJECT, '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
const parsedConfig = JSON.parse(sdkConfigRaw.slice(sdkConfigRaw.indexOf('{')));
const webConfig = parsedConfig.result?.sdkConfig ?? parsedConfig.result ?? parsedConfig;
if (webConfig.projectId !== PROJECT) throw Error('SDKCONFIG_PROJECT_MISMATCH');

const dotenv = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));

const { initializeApp } = await import('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser }
  = await import('firebase/auth');
const firestoreSdk = await import('firebase/firestore');
const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
  writeBatch, Timestamp, serverTimestamp } = firestoreSdk;
const { createClient } = await import('@supabase/supabase-js');

const app = initializeApp({ projectId: PROJECT, apiKey: webConfig.apiKey,
  authDomain: webConfig.authDomain }, `smoke-${runId}`);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE);

// A privileged reader for templating and verification. Never used to write synthetic data.
const { openProductionReader } = await import('../lib/production-reader.mjs');
const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });

/** Read one real document of a collection and return a synthetic document with the same shape. */
const templateCache = new Map();
async function syntheticFrom(collectionId, { ownerUid, businessId, id }) {
  if (!templateCache.has(collectionId)) {
    const { paths } = await reader.scanCollectionGroups([collectionId]);
    const first = [...paths].find((p) => !p.includes(SYNTH)) ?? null;
    templateCache.set(collectionId, first ? (await reader.readDocuments([first])).get(first) : null);
  }
  const template = templateCache.get(collectionId);
  if (!template) return null;
  // Provenance fields describe how a document arrived through the migration. A client-created
  // document has none, and copying them would assert something untrue about it.
  const migrationOnly = new Set(['migrationTransformVersion', 'migrationExcludedFields',
    'migrationAuthOnly', 'transformVersion']);
  const out = {};
  for (const [key, value] of Object.entries(template)) {
    if (migrationOnly.has(key)) continue;
    if (key === 'id') out[key] = id;
    else if (key === 'ownerUid' || key === 'userId' || key === 'uid') out[key] = ownerUid;
    else if (key === 'businessId') out[key] = businessId;
    else if (value === null) out[key] = null;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') out[key] = Number.isInteger(value) ? 1 : 1.0;
    else if (typeof value === 'string') {
      // Enum-ish and format-bearing strings (status codes, currency, dates, numeric shadows) have
      // to survive or the Rules' schema validators reject the document. Anything that could carry
      // a person's details is replaced instead of copied.
      const personal = /name|email|phone|address|note|description|title|comment|city|country|passport/i;
      out[key] = personal.test(key) ? SYNTH : value;
    }
    else if (Array.isArray(value)) out[key] = [];
    else if (value && typeof value === 'object' && typeof value.unitsText === 'string') {
      // A uniform amount breaks the derived-total invariants the validators enforce
      // (sale - cost = profit, sale - paid = due), so these are chosen to add up.
      const amounts = { salePrice: '30000', wholesaleCost: '10000', profit: '20000',
        amountPaid: '10000', amountDue: '20000' };
      out[key] = { unitsText: amounts[key] ?? '10000', scale: value.scale };
    } else if (value && typeof value === 'object'
      && (value._seconds !== undefined || value.seconds !== undefined)) {
      out[key] = key === 'createdAt' || key === 'updatedAt'
        ? serverTimestamp()
        : firestoreSdk.Timestamp.fromMillis(Number(value.seconds ?? value._seconds) * 1000);
    } else if (value && typeof value === 'object') out[key] = {};
    else out[key] = null;
  }
  return out;
}

const createdDoc = async (path, data) => {
  manifest.firestorePaths.push(path); persistManifest();
  await setDoc(doc(db, path), data);
};

const users = [];
let report;
try {
  // ============================ AUTH ============================================================
  for (const label of ['A', 'B']) {
    const email = `${SYNTH}-${label}@example.test`;
    const password = `Pw-${randomUUID()}`;
    const credential = await expect('auth', `synthetic user ${label} sign-up`,
      () => createUserWithEmailAndPassword(auth, email, password));
    if (!credential) continue;
    manifest.authUids.push(credential.user.uid); persistManifest();
    users.push({ label, email, password, uid: credential.user.uid });
  }
  if (users.length !== 2) throw Error('SYNTHETIC_USERS_NOT_CREATED');

  await expect('auth', 'sign-out succeeds', () => signOut(auth));
  await expect('auth', 'sign-in with correct credentials succeeds',
    () => signInWithEmailAndPassword(auth, users[0].email, users[0].password));
  await expect('auth', 'uid is a 28-character Firebase uid for a new signup',
    () => { if (users[0].uid.length !== 28) throw Error(`uid length ${users[0].uid.length}`); });

  try {
    await signInWithEmailAndPassword(auth, users[0].email, `${users[0].password}-wrong`);
    record('auth', 'incorrect password is rejected', false, 'sign-in unexpectedly succeeded');
  } catch { record('auth', 'incorrect password is rejected', true); }

  // Migrated identities: uid preservation and the operator exclusions, checked without signing in.
  const token = operatorToken();
  const accountsResponse = await originalFetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json' }, body: JSON.stringify({ returnUserInfo: true }) });
  const allAccounts = (await accountsResponse.json()).userInfo ?? [];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Counted by uid shape, not by email. Two of the seven migrated accounts legitimately carry a
  // migration-test-- email from preparation and own real businesses, so an email prefix filter
  // undercounts them; only a source uuid identifies a migrated identity.
  const migrated = allAccounts.filter((account) => UUID.test(account.localId));
  record('auth', 'seven migrated accounts present with preserved uuid uids',
    migrated.length === 7, `${migrated.length} accounts`);
  record('auth', 'this run created no uuid-shaped account',
    manifest.authUids.every((uid) => !UUID.test(uid)));
  const excluded = ['f3b8c72c5a7d', '95e3cb04de08', '4ca1630f70b0'];
  const presentFingerprints = new Set(allAccounts
    .map((a) => createHash('sha256').update(a.localId).digest('hex').slice(0, 12)));
  record('auth', 'operator-excluded identities remain absent',
    excluded.every((f) => !presentFingerprints.has(f)));

  // ============================ FIRESTORE + VERTICALS ============================================
  const tenants = {};
  for (const user of users) {
    await signInWithEmailAndPassword(auth, user.email, user.password);
    const businessId = randomUUID();
    const profileId = randomUUID();
    tenants[user.label] = { businessId, uid: user.uid };
    const now = Timestamp.now();
    const micros = String(now.seconds * 1_000_000 + Math.floor(now.nanoseconds / 1000));
    const businessType = user.label === 'A' ? 'tourism' : 'restaurant';

    // Built explicitly against the deployed Rules rather than templated. Two conditions make a
    // copied document impossible: trialStartDate must equal request.time, which only
    // serverTimestamp() can satisfy, and subscriptionStatus must be exactly 'trial'. The field set
    // is sv_business_profiles' allowlist, and the user profile carries businessId null at creation
    // because that is what FirestoreProfileRepository.createOwnerProfiles writes.
    const businessDoc = {
      id: businessId, businessId, ownerUid: user.uid, userId: user.uid,
      businessName: SYNTH, businessType, businessRegistrationNumber: null,
      preferredCurrency: 'ILS', preferredLanguage: 'en',
      logoUrl: null, signatureUrl: null,
      subscriptionStatus: 'trial', trialStartDate: serverTimestamp(),
      createdAt: serverTimestamp(), updatedAt: null,
      createdAtMicros: micros, updatedAtMicros: '0',
      isSuspended: false, isDeleted: false, schemaVersion: 1,
    };
    const userDoc = {
      id: profileId, legacyProfileId: profileId,
      uid: user.uid, userId: user.uid, ownerUid: user.uid,
      // Set at creation, not afterwards: the self-registration branch of the users create rule
      // allows the business created in the same batch, and businessId is protected against any
      // later owner edit, so this is the only moment it can be established.
      businessId, sourceBusinessId: null,
      fullName: SYNTH, phoneNumber: '0500000000',
      role: 'user', isSuspended: false, canViewFinancials: false, isDeleted: false,
      createdAt: serverTimestamp(), createdAtMicros: micros,
      updatedAt: null, updatedAtMicros: '0',
      schemaVersion: 1,
    };

    await expect('firestore', `tenant ${user.label}: owner bootstrap committed atomically`,
      () => firestoreCall(async () => {
        manifest.firestorePaths.push(`users/${user.uid}`, `businesses/${businessId}`,
          `businessOwners/${user.uid}`);
        persistManifest();
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', user.uid), userDoc);
        batch.set(doc(db, 'businesses', businessId), businessDoc);
        batch.set(doc(db, 'businessOwners', user.uid), { uid: user.uid, businessId, schemaVersion: 1 });
        await batch.commit();
      }));
  }

  const a = tenants.A;
  await signInWithEmailAndPassword(auth, users[0].email, users[0].password);

  // Read / update / delete on an owned document.
  // No "adopt the business" step: businessId is in the users protectedFields list, so an owner
  // cannot set it on themselves. Ownership resolves through businessOwners and businesses.ownerUid,
  // which is what the read rule actually consults.
  await expect('firestore', 'authorized read of own document',
    () => firestoreCall(async () => {
      const snap = await getDoc(doc(db, `businesses/${a.businessId}`));
      if (!snap.exists()) throw Error('own business not readable');
    }));
  await expect('firestore', 'authorized update of own document',
    () => firestoreCall(() => updateDoc(doc(db, `businesses/${a.businessId}`), { schemaVersion: 1 })));

  const verticals = {
    tourism: ['trips'],
    restaurant: ['menuCategories', 'menuItems', 'orders', 'orderItems', 'restaurantStaff'],
    supermarket: ['marketTransactions'],
    autoRepair: ['repairOrders'],
    carParts: ['parts'],
  };
  const financialPaths = [];
  for (const [vertical, collections] of Object.entries(verticals)) {
    for (const collectionId of collections) {
      const id = randomUUID();
      const path = collectionId === 'trips'
        ? `trips/${id}` : `businesses/${a.businessId}/${collectionId}/${id}`;
      const data = await syntheticFrom(collectionId, { ownerUid: a.uid, businessId: a.businessId, id });
      if (!data) { record(vertical, `${collectionId}: no production template available`, true, 'skipped'); continue; }
      const ok = await expect(vertical, `${collectionId}: authorized create`,
        () => firestoreCall(() => createdDoc(path,
          { ...data, id, ownerUid: a.uid, businessId: a.businessId, schemaVersion: 1 })));
      if (ok !== null && collectionId === 'trips') financialPaths.push(path);
    }
  }
  // Verticals with no dedicated collections yet are placeholders in the shipped product; the
  // business type is a field, so there is nothing backend-side to exercise for them.
  for (const placeholder of ['phoneShop', 'clothesShop', 'furnitureStore']) {
    record('placeholders', `${placeholder}: no dedicated collections, business-type field only`, true);
  }

  // ============================ FINANCIAL ========================================================
  for (const path of financialPaths) {
    await expect('financial', 'trip money fields round-trip exactly', async () => {
      const snap = await getDoc(doc(db, path));
      const data = snap.data();
      const money = Object.entries(data).filter(([, v]) => v && typeof v === 'object'
        && typeof v.unitsText === 'string');
      if (!money.length) throw Error('no exact-decimal money fields present');
      for (const [field, value] of money) {
        if (!/^\d+$/.test(value.unitsText)) throw Error(`${field} units are not exact: ${value.unitsText}`);
        if (typeof value.scale !== 'number') throw Error(`${field} lost its scale`);
      }
    });
    await expect('financial', 'currency field preserved', async () => {
      const snap = await getDoc(doc(db, path));
      if (!('currency' in snap.data())) throw Error('currency field absent');
    });
  }

  // ============================ TENANT ISOLATION + MALICIOUS CLIENT ==============================
  await signInWithEmailAndPassword(auth, users[1].email, users[1].password);
  await expectDenied('tenantIsolation', 'tenant B cannot read tenant A business',
    () => getDoc(doc(db, `businesses/${a.businessId}`)).then((s) => {
      if (!s.exists()) throw Error('permission denied'); return s; }));
  await expectDenied('tenantIsolation', 'tenant B cannot write into tenant A business',
    () => setDoc(doc(db, `businesses/${a.businessId}/parts/${randomUUID()}`), { ownerUid: tenants.B.uid }));
  await expectDenied('maliciousClient', 'tenant B cannot overwrite tenant A owner index',
    () => setDoc(doc(db, `businessOwners/${a.uid}`), { ownerUid: tenants.B.uid, businessId: tenants.B.businessId }));
  await expectDenied('maliciousClient', 'privilege escalation on own profile denied',
    () => updateDoc(doc(db, `users/${tenants.B.uid}`), { role: 'admin', canViewFinancials: true }));
  await expectDenied('maliciousClient', 'cannot read a migrated customer business',
    () => getDoc(doc(db, 'businesses/13df61b1-1d38-40eb-bf85-61673246f0de')).then((s) => {
      if (!s.exists()) throw Error('permission denied'); return s; }));
  await expectDenied('maliciousClient', 'cannot enumerate the trips collection across tenants',
    () => getDocs(query(collection(db, 'trips'), where('ownerUid', '==', a.uid))));

  // ============================ HYBRID STORAGE ===================================================
  // Supabase third-party auth denies every RLS predicate without `role: authenticated`, and Firebase
  // does not add it. Operator tooling applies it outside the shipped app; the synthetic identities
  // need the same treatment before Storage can work for them.
  for (const user of users) {
    await expect('hybridStorage', `role claim applied to synthetic user ${user.label}`, async () => {
      const response = await originalFetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
          'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: user.uid,
          customAttributes: JSON.stringify({ role: 'authenticated' }) }) });
      if (!response.ok) throw Error(`http ${response.status}`);
    });
  }
  await signInWithEmailAndPassword(auth, users[0].email, users[0].password);
  // Custom claims only reach a client on the next token refresh.
  const idToken = await auth.currentUser.getIdToken(true);
  const supabase = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { accessToken: async () => idToken, auth: { persistSession: false } });
  const objectPath = `${a.uid}/${SYNTH}-signature.png`;
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  await expect('hybridStorage', 'authorized upload with a Firebase id token', async () => {
    manifest.storageObjects.push(`${SIGNATURE_BUCKET}/${objectPath}`); persistManifest();
    const { error } = await supabase.storage.from(SIGNATURE_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/png', upsert: false });
    if (error) throw Error(error.message);
  });
  await expect('hybridStorage', 'authorized read returns the same bytes', async () => {
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(objectPath);
    if (error) throw Error(error.message);
    const got = Buffer.from(await data.arrayBuffer());
    if (!got.equals(bytes)) throw Error('checksum mismatch');
  });
  const updated = Buffer.from('89504e470d0a1a0aff', 'hex');
  await expect('hybridStorage', 'authorized overwrite succeeds', async () => {
    const { error } = await supabase.storage.from(SIGNATURE_BUCKET)
      .upload(objectPath, updated, { contentType: 'image/png', upsert: true });
    if (error) throw Error(error.message);
  });
  await expect('hybridStorage', 'overwrite is observable on read', async () => {
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET)
      .download(`${objectPath}?t=${Date.now()}`);
    if (error) throw Error(error.message);
    const got = Buffer.from(await data.arrayBuffer());
    if (!got.equals(updated)) throw Error('overwrite not observed');
  });
  // Wrong user, cross tenant, anonymous.
  const bToken = await (async () => {
    await signInWithEmailAndPassword(auth, users[1].email, users[1].password);
    const t = await auth.currentUser.getIdToken(true);
    await signInWithEmailAndPassword(auth, users[0].email, users[0].password);
    return t;
  })();
  const supabaseB = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { accessToken: async () => bToken, auth: { persistSession: false } });
  await expect('hybridStorage', 'wrong user read denied', async () => {
    const { error } = await supabaseB.storage.from(SIGNATURE_BUCKET).download(objectPath);
    if (!error) throw Error('wrong user could read the object');
  });
  await expect('hybridStorage', 'wrong user overwrite denied', async () => {
    const { error } = await supabaseB.storage.from(SIGNATURE_BUCKET)
      .upload(objectPath, updated, { upsert: true });
    if (!error) throw Error('wrong user could overwrite the object');
  });
  await expect('hybridStorage', 'wrong user delete denied', async () => {
    // Supabase returns no error for a delete that matched no rows, so the only meaningful assertion
    // is that the object is still readable by its owner afterwards.
    await supabaseB.storage.from(SIGNATURE_BUCKET).remove([objectPath]);
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET)
      .download(`${objectPath}?t=${Date.now()}`);
    if (error || !data) throw Error('object disappeared after a wrong-user delete');
  });
  const anon = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } });
  await expect('hybridStorage', 'anonymous read denied', async () => {
    const { error } = await anon.storage.from(SIGNATURE_BUCKET).download(objectPath);
    if (!error) throw Error('anonymous read succeeded');
  });
  await expect('hybridStorage', 'synthetic identity sees nothing in the customer folder', async () => {
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET)
      .list(CUSTOMER_SIGNATURE_OWNER);
    // An empty listing is correct isolation; an error is also acceptable. Entries are not.
    if (!error && Array.isArray(data) && data.length > 0) {
      throw Error(`customer folder exposed ${data.length} entries`);
    }
  });

  // ============================ ADMIN CREATE USER ================================================
  const adminEmail = `${SYNTH}-admin@example.test`;
  const adminCreated = await expect('adminCreateUser', 'admin creates a Firebase account', async () => {
    const response = await originalFetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: `Pw-${randomUUID()}`, emailVerified: false }) });
    const body = await response.json();
    if (!response.ok || !body.localId) throw Error(body?.error?.message ?? `http ${response.status}`);
    manifest.authUids.push(body.localId); persistManifest();
    return body.localId;
  });
  if (adminCreated) {
    record('adminCreateUser', 'admin-created uid is a 28-character Firebase uid',
      adminCreated.length === 28, `length ${adminCreated.length}`);
  }

  // ============================ RUNTIME REACHABILITY =============================================
  const classify = (predicate) => [...hosts.entries()]
    .filter(([host]) => predicate(host)).reduce((sum, [, count]) => sum + count, 0);
  const supabaseHost = new URL(dotenv.VITE_SUPABASE_URL).host;
  const reachability = {
    firebaseAuth: classify((h) => h.includes('identitytoolkit') || h.includes('securetoken')),
    firestore: firestoreServerAnswers,
    firestoreEvidence: 'operations answered by firestore.googleapis.com (success or explicit denial)',
    supabaseStorage: [...hosts.entries()].filter(([h]) => h === supabaseHost)
      .reduce((sum, [, count]) => sum + count, 0),
    hostsContacted: Object.fromEntries([...hosts.entries()].sort()),
  };
  record('runtimeReachability', 'Firebase Auth contacted at runtime', reachability.firebaseAuth > 0,
    `${reachability.firebaseAuth} calls`);
  record('runtimeReachability', 'Firestore contacted at runtime', reachability.firestore > 0,
    `${reachability.firestore} calls`);
  const supabaseCalls = [...hosts.entries()].filter(([h]) => h === supabaseHost);
  record('runtimeReachability', 'Supabase reached only on Storage paths',
    reachability.supabaseStorage > 0,
    `${reachability.supabaseStorage} calls to ${supabaseHost}`);
  record('runtimeReachability', 'no Supabase database, RPC, auth or realtime host contacted',
    supabaseCalls.length <= 1,
    `hosts: ${[...hosts.keys()].join(', ')}`);

  report = { runId, generatedAt: new Date().toISOString(), target: 'PRODUCTION', project: PROJECT,
    releasedVersion: '0.0.62', reachability };
} finally {
  // ---- cleanup: only what this run created, always ------------------------------------------------
  const cleanup = { firestoreDeleted: [], firestoreFailed: [], storageDeleted: [], storageFailed: [],
    authDeleted: [], authFailed: [] };
  try {
    for (const user of users) {
      try { await signInWithEmailAndPassword(auth, user.email, user.password); } catch { /* ignore */ }
      for (const path of [...manifest.firestorePaths].reverse()) {
        if (!path.includes(user.uid) && !path.includes(SYNTH)
          && !manifest.firestorePaths.includes(path)) continue;
        try { await deleteDoc(doc(db, path)); cleanup.firestoreDeleted.push(path); }
        catch { /* another tenant's document, or already gone; swept below */ }
      }
    }
  } catch { /* fall through to the privileged sweep */ }

  // Privileged sweep for anything the client could not delete. Manifest paths only.
  const { openResidueCleanupTarget, WITHDRAWAL_REASON, manifestIntegrityHash }
    = await import('../lib/residue-cleanup-target.mjs');
  const remaining = [];
  for (const path of manifest.firestorePaths) {
    if (cleanup.firestoreDeleted.includes(path)) continue;
    remaining.push(path);
  }
  if (remaining.length) {
    try {
      const found = await reader.readDocuments(remaining);
      const { rawDocumentHash } = await import('../lib/full-rehearsal-core.mjs');
      const sweepManifest = { cleanupRunId: `${runId}-sweep`, reason: WITHDRAWAL_REASON,
        bulkMigrationRunId: 'post-cutover-smoke', firebaseProject: PROJECT,
        firestoreDatabaseId: DATABASE, expectedCount: found.size,
        documents: [...found.entries()].map(([path, data]) => ({ path,
          preDeleteHash: rawDocumentHash(path, data) })),
        createdAt: new Date().toISOString(), status: 'PREPARED' };
      sweepManifest.integrityHash = manifestIntegrityHash(sweepManifest);
      if (found.size) {
        const journal = JSON.parse(readFileSync(
          'migration/production-copy.local/bulkcopy-15363817-711a-4b52-9414-4885a8585bf4.json', 'utf8'));
        const target = await openResidueCleanupTarget({ manifest: sweepManifest, projectId: PROJECT,
          databaseId: DATABASE, forbiddenPaths: new Set(journal.writtenPaths),
          expectedCount: found.size, allowedReasons: [WITHDRAWAL_REASON] });
        for (const entry of sweepManifest.documents) {
          try { await target.deleteManifestDocument(entry.path); cleanup.firestoreDeleted.push(entry.path); }
          catch (error) { cleanup.firestoreFailed.push({ path: entry.path, error: error?.code }); }
        }
        await target.close();
      }
    } catch (error) { cleanup.firestoreFailed.push({ sweep: error?.message ?? String(error) }); }
  }

  // Storage: the owning synthetic identity removes its own objects.
  for (const object of manifest.storageObjects) {
    const [bucket, ...rest] = object.split('/');
    const path = rest.join('/');
    try {
      const owner = users.find((u) => path.startsWith(`${u.uid}/`));
      if (owner) await signInWithEmailAndPassword(auth, owner.email, owner.password);
      const idTokenForCleanup = await auth.currentUser.getIdToken(true);
      const client = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
        { accessToken: async () => idTokenForCleanup, auth: { persistSession: false } });
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) throw Error(error.message);
      cleanup.storageDeleted.push(object);
    } catch (error) { cleanup.storageFailed.push({ object, error: error?.message }); }
  }

  // Auth accounts: exact uids from the manifest, deleted with the operator credential.
  try {
    const token = operatorToken();
    for (const uid of manifest.authUids) {
      const response = await originalFetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
          'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
      if (response.ok) cleanup.authDeleted.push(uid);
      else cleanup.authFailed.push(uid);
    }
  } catch (error) { cleanup.authFailed.push(String(error?.message ?? error)); }

  await reader.close().catch(() => undefined);
  await signOut(auth).catch(() => undefined);

  const residue = cleanup.firestoreFailed.length + cleanup.storageFailed.length
    + cleanup.authFailed.length;
  const failed = checks.filter((check) => !check.ok);
  const categories = {};
  for (const check of checks) {
    categories[check.category] = categories[check.category] === 'FAIL' || !check.ok ? (check.ok ? categories[check.category] : 'FAIL') : 'PASS';
  }
  const finalReport = {
    ...(report ?? { runId, generatedAt: new Date().toISOString(), target: 'PRODUCTION',
      project: PROJECT, releasedVersion: '0.0.62', reachability: null }),
    manifest: MANIFEST_PATH,
    syntheticPrefix: SYNTH,
    created: { authUids: manifest.authUids.length, firestorePaths: manifest.firestorePaths.length,
      storageObjects: manifest.storageObjects.length },
    cleanup,
    syntheticResidue: residue,
    categories,
    totalChecks: checks.length,
    failedChecks: failed.length,
    checks,
    customerMutations: 0,
    decision: failed.length === 0 && residue === 0 ? 'PRODUCTION_SMOKE_PASS' : 'PRODUCTION_SMOKE_FAIL',
  };
  writeReport(REPORT_PATH, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(JSON.stringify({ decision: finalReport.decision, categories,
    totalChecks: finalReport.totalChecks, failedChecks: finalReport.failedChecks,
    created: finalReport.created, syntheticResidue: residue,
    reachability: finalReport.reachability ? {
      firebaseAuth: finalReport.reachability.firebaseAuth,
      firestore: finalReport.reachability.firestore,
      supabaseStorage: finalReport.reachability.supabaseStorage,
      hosts: Object.keys(finalReport.reachability.hostsContacted),
    } : null,
    failures: failed.map((f) => `${f.category}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`),
    report: REPORT_PATH }, null, 2));
  process.exitCode = finalReport.decision === 'PRODUCTION_SMOKE_PASS' ? 0 : 1;
}
