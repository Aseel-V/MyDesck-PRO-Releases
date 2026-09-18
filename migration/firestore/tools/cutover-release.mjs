#!/usr/bin/env node
/**
 * One-shot Firebase/Firestore cutover release.
 *
 * Eight phases, in order, each refusing to let the next one start:
 *
 *   A  production gates          CUTOVER_GO, BULK_COPY_GO, DRY_RUN_GO, plus the underlying evidence
 *   B  Firebase web config       resolved from the project, never typed in by hand
 *   C  environment assembly      in memory only; nothing is written to .env or anywhere else
 *   D  build-config validation   the same gate CI uses, with --require-firestore
 *   E  production build          tsc + vite, with the assembled environment
 *   F  artifact verification     the built bundle must actually select Firestore
 *   G  GitHub CLI authentication checked only when publishing
 *   H  publish                   electron-builder, token supplied in memory
 *
 * Two outcomes are reported distinctly and never conflated. BUILD_COMPLETE means an artifact exists
 * and was verified; RELEASE_PUBLISHED means customers can receive it. A build failure never reaches
 * publish, and a publish failure never reports a cutover.
 *
 * Secrets: the GitHub token is read from `gh auth token` into a variable, handed to the child
 * process environment, and never logged, echoed or written to disk. The revoked PAT must not return
 * to .env and this script gives it no way back in. The Firebase Web API key is a public client
 * identifier and is deliberately still not printed.
 *
 *   node migration/firestore/tools/cutover-release.mjs --build-only
 *   node migration/firestore/tools/cutover-release.mjs --publish
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { writeReport } from '../../tools/lib/write-report.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const RELEASE_MARKER = 'mydesck-firestore-v1';
const EXPECTED_AUTH_USERS = 7;
const EXPECTED_FIRESTORE_DOCS = 1474;
const REPORT_PATH = 'migration/reports/cutover-release.json';

const publish = process.argv.includes('--publish');
const buildOnly = process.argv.includes('--build-only') || !publish;
const shell = process.env.ComSpec || 'cmd.exe';
const fail = (phase, message) => {
  console.error(JSON.stringify({ phase, state: 'CUTOVER_RELEASE_REFUSED', reason: message,
    buildComplete: false, releasePublished: false }, null, 2));
  process.exit(1);
};
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const run = (command, options = {}) => execFileSync(shell, ['/c', command],
  { encoding: 'utf8', stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env, timeout: options.timeout ?? 1_800_000, maxBuffer: 64 * 1024 * 1024 });

const evidence = {};

// ============================ A. production gates ===============================================
const staged = readJson('migration/reports/staged-go.json');
const reconciliation = readJson('migration/reports/firestore-production-reconciliation.json');
const finalDelta = readJson('migration/reports/firestore-production-final-delta.json');
const authImport = readJson('migration/reports/firestore-production-auth-import.json');
const dryRun = readJson('migration/reports/firestore-production-dry-run.json');
if (!staged || !reconciliation || !finalDelta || !authImport || !dryRun) {
  fail('A', 'PRODUCTION_EVIDENCE_MISSING');
}

const gateByName = new Map((dryRun.go?.gates ?? []).map((gate) => [gate.name, gate.status]));
const gates = {
  CUTOVER_GO: staged.stages?.CUTOVER_GO?.decision ?? null,
  BULK_COPY_GO: staged.stages?.BULK_COPY_GO?.decision ?? null,
  DRY_RUN_GO: staged.stages?.DRY_RUN_GO?.decision ?? null,
  reconciliation: reconciliation.status,
  finalDelta: finalDelta.decision,
  authImport: authImport.decision,
  indexes: gateByName.get('indexes') ?? 'MISSING',
  rules: gateByName.get('rules') ?? dryRun.go?.gates?.find((g) => g.name === 'rules')?.status ?? 'MISSING',
};
const measured = {
  firestoreDocuments: reconciliation.coverage?.firestoreDocuments ?? null,
  documentsFoundInTarget: reconciliation.coverage?.documentsFoundInTarget ?? null,
  missingDocuments: reconciliation.coverage?.missingDocuments ?? null,
  unexpectedDocuments: reconciliation.coverage?.unexpectedDocuments ?? null,
  firebaseAuthAccounts: reconciliation.untouched?.firebaseAuthAccounts ?? null,
  sourceDrift: (finalDelta.delta?.newDocuments ?? 1) + (finalDelta.delta?.changedDocuments ?? 1)
    + (finalDelta.delta?.deletedDocuments ?? 1) + (finalDelta.delta?.sourceTableRowDrift?.length ?? 1),
  customerSignatureUnchanged: reconciliation.untouched?.customerSignature?.unchanged ?? false,
  supabaseStorageDrift: reconciliation.untouched?.supabaseStorageDrift?.length ?? null,
  supabaseSourceRowDrift: reconciliation.untouched?.supabaseSourceRowDrift?.length ?? null,
  syntheticResidue: reconciliation.coverage?.unexpectedDocuments ?? null,
};
const blockers = [];
if (gates.CUTOVER_GO !== 'GO') blockers.push(`CUTOVER_GO:${gates.CUTOVER_GO}`);
if (gates.BULK_COPY_GO !== 'GO') blockers.push(`BULK_COPY_GO:${gates.BULK_COPY_GO}`);
if (gates.DRY_RUN_GO !== 'GO') blockers.push(`DRY_RUN_GO:${gates.DRY_RUN_GO}`);
if (gates.reconciliation !== 'RECONCILED') blockers.push(`RECONCILIATION:${gates.reconciliation}`);
if (gates.finalDelta !== 'NO_DELTA_REQUIRED' && gates.finalDelta !== 'DELTA_APPLIED') {
  blockers.push(`FINAL_DELTA:${gates.finalDelta}`);
}
if (gates.authImport !== 'AUTH_IMPORT_GO') blockers.push(`AUTH_IMPORT:${gates.authImport}`);
if (gates.indexes !== 'PASS') blockers.push(`INDEXES:${gates.indexes}`);
if (gates.rules !== 'PASS') blockers.push(`RULES:${gates.rules}`);
if (measured.firestoreDocuments !== EXPECTED_FIRESTORE_DOCS) blockers.push(`FIRESTORE_DOCS:${measured.firestoreDocuments}`);
if (measured.documentsFoundInTarget !== EXPECTED_FIRESTORE_DOCS) blockers.push(`DOCS_PRESENT:${measured.documentsFoundInTarget}`);
if (measured.missingDocuments !== 0) blockers.push(`MISSING_DOCS:${measured.missingDocuments}`);
if (measured.unexpectedDocuments !== 0) blockers.push(`UNEXPECTED_DOCS:${measured.unexpectedDocuments}`);
if (measured.firebaseAuthAccounts !== EXPECTED_AUTH_USERS) blockers.push(`AUTH_USERS:${measured.firebaseAuthAccounts}`);
// A stale build is worse than a late one: if the source moved since the delta, stop.
if (measured.sourceDrift !== 0) blockers.push(`SOURCE_DRIFT:${measured.sourceDrift}`);
if (!measured.customerSignatureUnchanged) blockers.push('CUSTOMER_SIGNATURE_CHANGED');
if (measured.supabaseStorageDrift !== 0) blockers.push(`STORAGE_DRIFT:${measured.supabaseStorageDrift}`);
if (measured.supabaseSourceRowDrift !== 0) blockers.push(`SOURCE_ROW_DRIFT:${measured.supabaseSourceRowDrift}`);
if (blockers.length) fail('A', `PRODUCTION_GATES_NOT_SATISFIED:${blockers.join(',')}`);
evidence.gates = gates;
evidence.measured = measured;
console.log('[A] production gates satisfied');

// ============================ version and tag safety ============================================
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail('A', `INVALID_VERSION:${version}`);
for (const file of ['package-lock.json', 'public/version.json', 'public/release-notes.json']) {
  const other = readJson(file)?.version;
  if (other !== version) fail('A', `VERSION_DESYNC:${file}:${other}`);
}
const publishConfig = pkg.build?.publish ?? {};
if (publishConfig.provider !== 'github' || publishConfig.owner !== 'Aseel-V'
  || publishConfig.repo !== 'MyDesck-PRO-Releases') {
  fail('A', 'PUBLISH_TARGET_UNEXPECTED');
}
if (pkg.build?.nsis?.artifactName !== 'MyDesck-PRO-Setup.exe') fail('A', 'ARTIFACT_NAME_UNEXPECTED');
// The tag must not already exist, or the updater would be pointed at a release that is not this one.
let existingTags = [];
try {
  // Node's fetch rather than a shelled-out curl: no quoting to get wrong, and the failure mode is
  // an exception here instead of an empty string that parses into a misleading "no releases".
  const response = await fetch(
    `https://api.github.com/repos/${publishConfig.owner}/${publishConfig.repo}/releases?per_page=100`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mydesck-cutover' },
      signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`http ${response.status}`);
  const listed = await response.json();
  if (!Array.isArray(listed)) throw new Error('unexpected payload');
  existingTags = listed.map((release) => release.tag_name);
} catch (error) { fail('A', `RELEASE_LIST_UNAVAILABLE:${error?.message ?? 'unknown'}`); }
if (existingTags.includes(tag)) fail('A', `TAG_ALREADY_PUBLISHED:${tag}`);
evidence.release = { version, tag, owner: publishConfig.owner, repo: publishConfig.repo,
  artifact: pkg.build.nsis.artifactName, channel: 'latest', target: 'nsis',
  existingReleaseCount: existingTags.length, previousTag: existingTags[0] ?? null };
console.log(`[A] release ${tag} is free on ${publishConfig.owner}/${publishConfig.repo}`);

// ============================ B. Firebase web config ============================================
// The Firebase CLI's JS entry point, run directly with Node.
//
// Not firebase.cmd: Node refuses to spawn a .cmd without a shell, and going through cmd.exe means
// hand-quoting a path that cmd and Node escape differently — which fails on the quoting, not on
// anything real. Invoking the entry point skips the wrapper and the shell entirely.
const firebaseEntry = process.env.FIREBASE_CLI_ENTRY
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(firebaseEntry)) fail('B', 'FIREBASE_CLI_NOT_FOUND');
/**
 * The Firebase CLI writes its progress spinner to stdout ahead of the JSON payload, so the output
 * cannot be handed straight to JSON.parse. Everything before the first brace is progress chatter.
 */
const firebaseJson = (args, phase, code) => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [firebaseEntry, ...args, '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
  } catch { return fail(phase, code); }
  const start = raw.indexOf('{');
  if (start < 0) return fail(phase, `${code}:NO_JSON_IN_OUTPUT`);
  try { return JSON.parse(raw.slice(start)); }
  catch { return fail(phase, `${code}:UNPARSEABLE`); }
};

// `apps:list WEB` is already scoped to web apps and the entries carry no platform field, so the
// result is taken as-is; anything without an appId would be a malformed entry, not another platform.
const listed = firebaseJson(['apps:list', 'WEB', '--project', PROJECT], 'B', 'FIREBASE_APPS_LIST_FAILED');
const webApps = (listed.result ?? []).filter((app) => typeof app.appId === 'string'
  && app.projectId === PROJECT && app.state !== 'DELETED');
if (webApps.length !== 1) fail('B', `WEB_APP_NOT_UNIQUE:${webApps.length}`);
const configPayload = firebaseJson(
  ['apps:sdkconfig', 'WEB', webApps[0].appId, '--project', PROJECT], 'B', 'FIREBASE_SDKCONFIG_FAILED');
const sdkConfig = configPayload.result?.sdkConfig ?? configPayload.result ?? configPayload;
if (sdkConfig.projectId !== PROJECT) fail('B', `SDKCONFIG_PROJECT_MISMATCH:${sdkConfig.projectId}`);
if (!sdkConfig.apiKey || !sdkConfig.authDomain) fail('B', 'SDKCONFIG_INCOMPLETE');
evidence.firebaseWebApp = { appId: webApps[0].appId, projectId: sdkConfig.projectId,
  authDomain: sdkConfig.authDomain,
  apiKeyFingerprint: createHash('sha256').update(sdkConfig.apiKey).digest('hex').slice(0, 12),
  apiKeyLength: sdkConfig.apiKey.length };
console.log(`[B] firebase web app ${webApps[0].appId} resolved for ${sdkConfig.projectId}`);

// ============================ C. environment assembly ===========================================
// In memory only. Nothing here is written to .env, .env.local, .env.production or any file.
const dotenv = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
  .map((line) => { const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
if (!dotenv.VITE_SUPABASE_URL || !dotenv.VITE_SUPABASE_ANON_KEY) fail('C', 'SUPABASE_STORAGE_CONFIG_MISSING');

const cutoverEnv = {
  ...process.env,
  // Selector — src/data/backendMode.ts
  VITE_DATA_BACKEND: 'firestore',
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIRESTORE_DATABASE_ID: DATABASE,
  VITE_FIRESTORE_PRODUCTION_RELEASE: RELEASE_MARKER,
  VITE_SUPABASE_FALLBACK_DISABLED: 'true',
  VITE_FIREBASE_EXPECTED_PLAN: 'SPARK',
  VITE_FIREBASE_BILLING_ENABLED: 'false',
  // Firebase client — src/data/firebaseClient.ts
  VITE_FIREBASE_API_KEY: sdkConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: sdkConfig.authDomain,
  // Supabase Storage, intentionally retained
  VITE_SUPABASE_URL: dotenv.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: dotenv.VITE_SUPABASE_ANON_KEY,
  // Maintenance stays off: the cutover build is the one customers use.
  VITE_MIGRATION_MAINTENANCE: 'false',
};
evidence.environment = {
  variables: 11,
  selector: 7, firebaseWeb: 2, supabaseStorage: 2,
  writtenToDisk: false,
  values: {
    VITE_DATA_BACKEND: 'firestore', VITE_FIREBASE_PROJECT_ID: PROJECT,
    VITE_FIRESTORE_DATABASE_ID: DATABASE, VITE_FIRESTORE_PRODUCTION_RELEASE: RELEASE_MARKER,
    VITE_SUPABASE_FALLBACK_DISABLED: 'true', VITE_FIREBASE_EXPECTED_PLAN: 'SPARK',
    VITE_FIREBASE_BILLING_ENABLED: 'false',
    VITE_FIREBASE_AUTH_DOMAIN: sdkConfig.authDomain,
    VITE_FIREBASE_API_KEY: '<resolved from firebase project, not printed>',
    VITE_SUPABASE_URL: dotenv.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: '<public anon key from .env, not printed>',
  },
};
console.log('[C] cutover environment assembled in memory (11 variables)');

// ============================ D. build-config validation ========================================
try {
  run('node scripts/check-auth-build-config.mjs --env --require-firestore',
    { env: cutoverEnv, quiet: true });
} catch (error) {
  fail('D', `BUILD_CONFIG_GATE_FAILED:${String(error?.stderr ?? error?.message).slice(0, 300)}`);
}
console.log('[D] build-config gate passed with --require-firestore');

// ============================ E. production build ===============================================
try {
  run('npm run build', { env: cutoverEnv });
} catch { fail('E', 'PRODUCTION_BUILD_FAILED'); }
if (!existsSync('dist/index.html')) fail('E', 'BUILD_OUTPUT_MISSING');
console.log('[E] production build complete');

// ============================ F. artifact verification ==========================================
try {
  run('node scripts/check-auth-build-config.mjs --dist --require-firestore',
    { env: cutoverEnv, quiet: true });
} catch (error) {
  fail('F', `BUNDLE_VERIFICATION_FAILED:${String(error?.stderr ?? error?.message).slice(0, 300)}`);
}
// Listed with Node rather than `dir`: this repository lives under a Hebrew directory name and the
// console codepage mangles it into paths that no longer exist on disk.
const collectJs = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  return statSync(path).isDirectory() ? collectJs(path) : (path.endsWith('.js') ? [path] : []);
});
const bundleFiles = collectJs(join('dist', 'assets'));
const bundle = bundleFiles.map((file) => readFileSync(file, 'utf8')).join(String.fromCharCode(10));
const occurrences = (needle) => bundle.split(needle).length - 1;
evidence.bundle = {
  chunks: bundleFiles.length,
  bytes: bundleFiles.reduce((sum, file) => sum + statSync(file).size, 0),
  firebaseAuthReferences: occurrences('identitytoolkit') + occurrences('firebase/auth')
    + occurrences('signInWithPassword'),
  firestoreReferences: occurrences('firestore.googleapis.com') + occurrences('Firestore'),
  firestoreReleaseMarker: occurrences(RELEASE_MARKER),
  firebaseProjectReferences: occurrences(PROJECT),
  supabaseStorageReferences: occurrences('/storage/v1/'),
  // Present by construction: the emulator guards name this project while refusing to run in a
  // production build. Recorded as a count rather than asserted to zero, because zero would mean
  // the guards had been stripped, not that the build was safe.
  emulatorProjectReferences: occurrences('mydesck-migration-proof'),
  emulatorProjectSelected: bundle.includes('VITE_FIREBASE_PROJECT_ID:"mydesck-migration-proof"'),
  inlinedBackend: bundle.includes('VITE_DATA_BACKEND:"firestore"'),
  inlinedProject: bundle.includes(`VITE_FIREBASE_PROJECT_ID:"${PROJECT}"`),
  inlinedDatabase: bundle.includes(`VITE_FIRESTORE_DATABASE_ID:"${DATABASE}"`),
  inlinedFallbackDisabled: bundle.includes('VITE_SUPABASE_FALLBACK_DISABLED:"true"'),
  productionMode: bundle.includes('PROD:!0'),
};
if (evidence.bundle.firebaseAuthReferences === 0) fail('F', 'BUNDLE_HAS_NO_FIREBASE_AUTH');
if (evidence.bundle.firestoreReferences === 0) fail('F', 'BUNDLE_HAS_NO_FIRESTORE');
if (evidence.bundle.firestoreReleaseMarker === 0) fail('F', 'BUNDLE_MISSING_RELEASE_MARKER');
if (evidence.bundle.emulatorProjectSelected) fail('F', 'BUNDLE_SELECTS_EMULATOR_PROJECT');
if (!evidence.bundle.inlinedBackend) fail('F', 'BUNDLE_DOES_NOT_SELECT_FIRESTORE');
if (!evidence.bundle.inlinedProject) fail('F', 'BUNDLE_PROJECT_NOT_INLINED');
if (!evidence.bundle.inlinedDatabase) fail('F', 'BUNDLE_DATABASE_NOT_INLINED');
if (!evidence.bundle.inlinedFallbackDisabled) fail('F', 'BUNDLE_FALLBACK_NOT_DISABLED');
if (!evidence.bundle.productionMode) fail('F', 'BUNDLE_NOT_PRODUCTION_MODE');
if (evidence.bundle.supabaseStorageReferences === 0) fail('F', 'BUNDLE_LOST_SUPABASE_STORAGE');
console.log('[F] bundle verified: Firestore selected, Storage retained');

evidence.buildComplete = true;
const writeEvidence = (state, extra = {}) => writeReport(REPORT_PATH,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), artifact: 'cutover-release',
    state, ...evidence, ...extra }, null, 2)}\n`);

if (buildOnly) {
  writeEvidence('BUILD_COMPLETE', { releasePublished: false, publishAttempted: false });
  console.log(JSON.stringify({ state: 'BUILD_COMPLETE', releasePublished: false,
    version, tag, report: REPORT_PATH,
    next: 'rerun with --publish to build and publish the release' }, null, 2));
  process.exit(0);
}

// ============================ G. GitHub CLI authentication ======================================
const ghCandidates = [process.env.GH_CLI,
  join(process.env.ProgramFiles ?? '', 'GitHub CLI', 'gh.exe'),
  join(process.env['ProgramFiles(x86)'] ?? '', 'GitHub CLI', 'gh.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GitHub CLI', 'gh.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'gh.exe')].filter(Boolean);
const gh = ghCandidates.find((candidate) => existsSync(candidate));
if (!gh) {
  console.error('MANUAL ACTION REQUIRED: authenticate GitHub CLI with `gh auth login`');
  writeEvidence('BUILD_COMPLETE', { releasePublished: false, publishAttempted: false,
    publishBlocker: 'GITHUB_CLI_NOT_AVAILABLE' });
  process.exit(2);
}
try {
  execFileSync(gh, ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
} catch {
  console.error('MANUAL ACTION REQUIRED: authenticate GitHub CLI with `gh auth login`');
  writeEvidence('BUILD_COMPLETE', { releasePublished: false, publishAttempted: false,
    publishBlocker: 'GITHUB_CLI_NOT_AUTHENTICATED' });
  process.exit(2);
}
let token;
try {
  token = execFileSync(gh, ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000 }).trim();
} catch { token = null; }
if (!token) {
  console.error('MANUAL ACTION REQUIRED: authenticate GitHub CLI with `gh auth login`');
  writeEvidence('BUILD_COMPLETE', { releasePublished: false, publishAttempted: false,
    publishBlocker: 'GITHUB_CLI_TOKEN_UNAVAILABLE' });
  process.exit(2);
}
evidence.github = { cli: gh, authenticated: true, tokenSource: 'gh auth token (memory only)',
  tokenPersisted: false };
console.log('[G] GitHub CLI authenticated; token held in memory only');

// ============================ H. publish ========================================================
// The token exists only in this child environment. It is never echoed and never written to disk.
const publishEnv = { ...cutoverEnv, GH_TOKEN: token, GITHUB_TOKEN: token };
try {
  run('npx electron-builder --win --publish always', { env: publishEnv });
} catch {
  writeEvidence('PUBLISH_FAILED', { releasePublished: false, publishAttempted: true });
  console.error(JSON.stringify({ state: 'PUBLISH_FAILED', buildComplete: true,
    releasePublished: false, version, tag,
    note: 'the build succeeded; the release was not published, so no cutover occurred' }, null, 2));
  process.exit(1);
}
for (const asset of ['release/MyDesck-PRO-Setup.exe', 'release/MyDesck-PRO-Setup.exe.blockmap',
  'release/latest.yml']) {
  if (!existsSync(asset)) fail('H', `RELEASE_ASSET_MISSING:${asset}`);
}
const latestYml = readFileSync('release/latest.yml', 'utf8');
if (!latestYml.includes(`version: ${version}`)) fail('H', 'LATEST_YML_VERSION_MISMATCH');
if (!latestYml.includes('MyDesck-PRO-Setup.exe')) fail('H', 'LATEST_YML_ARTIFACT_MISMATCH');

evidence.releasePublished = true;
writeEvidence('RELEASE_PUBLISHED', { releasePublished: true, publishAttempted: true });
console.log(JSON.stringify({ state: 'RELEASE_PUBLISHED', buildComplete: true, releasePublished: true,
  version, tag, owner: publishConfig.owner, repo: publishConfig.repo,
  assets: ['MyDesck-PRO-Setup.exe', 'MyDesck-PRO-Setup.exe.blockmap', 'latest.yml'],
  report: REPORT_PATH }, null, 2));
