#!/usr/bin/env node
/**
 * Staged GO evaluation for the hybrid Firebase + Supabase-Storage architecture.
 *
 * Reads existing machine evidence and produces the six staged decisions. Evidence that
 * has never been generated stays MISSING; nothing here manufactures a PASS.
 *
 * Read-only. No network, no production mutation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { evaluateStagedGo } from '../lib/production-guard.mjs';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const parity = read('migration/reports/active-product-parity.json');
const storageAuth = read('migration/reports/hybrid-storage-auth-probe.json');
const inventory = read('migration/reports/live-vertical-inventory.json');
const dryRun = read('migration/reports/firestore-production-dry-run.json');
const harness = read('migration/reports/firestore-full-harness.json');
const isolation = read('migration/reports/storage-isolation-guard.json');
const rlsAudit = read('migration/reports/storage-rls-audit.json');
const roleClaim = read('migration/reports/supabase-role-claim.json');
const staff = read('migration/reports/restaurant-staff-inventory.json');

// Gates already decided by the existing single-stage engine are carried across verbatim.
const carried = Object.fromEntries((dryRun?.go?.gates ?? [])
  .map((gate) => [gate.name, { status: gate.status }]));

const firebaseRoot = parity?.firebaseRootActual ?? null;
const databaseRuntimeZero = firebaseRoot
  && firebaseRoot.supabaseDatabase === 0 && firebaseRoot.supabaseRpc === 0
  && firebaseRoot.supabaseAuth === 0 && firebaseRoot.supabaseRealtime === 0;

const evidence = {
  ...carried,

  // PRODUCT_PARITY_GO
  activeProductParity: { status: parity?.decision === 'PRODUCT_PARITY_GO' ? 'PASS' : 'FAIL',
    evidence: parity ? { verticalsSupported: parity.verticalsSupported, verticalsBlocking: parity.verticalsBlocking,
      shippedRoot: parity.compositionRoots.shippedProduct.reachableFiles } : 'not generated' },
  supabaseDatabaseRuntimeZero: { status: databaseRuntimeZero ? 'PASS' : 'FAIL',
    evidence: firebaseRoot ?? 'not generated',
    note: 'Measured on the Firebase production root. Supabase Storage is excluded by policy.' },
  storageIsolation: { status: isolation?.decision === 'STORAGE_ISOLATION_GO' ? 'PASS' : 'FAIL',
    evidence: isolation ? { outsideAllowlist: isolation.storageCallsOutsideAllowlist,
      violations: isolation.violations, rules: isolation.rules } : 'not generated' },
  storageRlsAudit: { status: rlsAudit?.decision === 'STORAGE_SECURITY_OK' ? 'PASS' : 'FAIL',
    evidence: rlsAudit ? { findings: rlsAudit.findings,
      publiclyReadablePrivateObjects: rlsAudit.publiclyReadablePrivateObjects,
      restrictivePolicyCount: rlsAudit.restrictivePolicyCount,
      bucketsReferencedInCodeButMissing: rlsAudit.bucketsReferencedInCodeButMissing } : 'not generated' },
  supabaseRoleClaim: { status: roleClaim?.decision === 'ROLE_CLAIM_READY' ? 'PASS' : 'FAIL',
    evidence: roleClaim ? { totalUsers: roleClaim.totalUsers, byScope: roleClaim.byScope,
      withRequiredClaim: roleClaim.withRequiredClaimAfter,
      productionClaimWrites: roleClaim.productionClaimWrites } : 'not generated' },
  restaurantStaffInventory: { status: staff ? 'PASS' : 'MISSING',
    evidence: staff ? { staffCount: staff.staffCount, unknown: staff.counts?.UNKNOWN ?? 0 } : 'not generated' },
  restaurantStaffIdentityModel: { status: staff?.identityModelDecided ? 'PASS' : 'NOT_RUN',
    evidence: 'Firebase Auth identities plus Firestore membership documents; requires owner approval for reprovisioning.' },
  restaurantStaffRules: { status: 'NOT_RUN',
    evidence: 'Membership Rules and the malicious-client suite are not authored yet.' },
  authenticateStaffReplaced: { status: 'NOT_RUN',
    evidence: 'authenticate_staff / authorize_staff_action still live in Postgres.' },
  analytics: carried.search ?? { status: 'MISSING' },

  // HYBRID_STORAGE_GO
  hybridStorageAuth: { status: storageAuth?.decision === 'HYBRID_STORAGE_AUTH_POSSIBLE' ? 'PASS' : 'FAIL',
    evidence: storageAuth ? { acceptedAlgorithms: storageAuth.acceptedAlgorithms,
      firebaseThirdPartyAuthEnabled: storageAuth.firebaseThirdPartyAuthEnabled,
      reason: storageAuth.reason } : 'not generated' },
  storageTenantIsolation: { status: 'NOT_RUN',
    evidence: 'Requires a real Firebase identity reaching Supabase Storage; blocked by hybridStorageAuth.' },
  storageAnonymousDenied: { status: storageAuth?.anonymousPrivateRead?.denied ? 'PASS' : 'NOT_RUN',
    evidence: storageAuth?.anonymousPrivateRead ?? 'not generated' },
};

const stages = evaluateStagedGo(evidence);
const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  productionMutations: 0,
  architecture: 'FIREBASE_AUTH_FIRESTORE_PLUS_SUPABASE_STORAGE_ONLY',
  inputs: {
    activeProductParity: parity?.generatedAt ?? null,
    hybridStorageAuthProbe: storageAuth?.generatedAt ?? null,
    liveVerticalInventory: inventory?.generatedAt ?? null,
    dryRun: dryRun?.generatedAt ?? null,
    harness: harness ? `${harness.status} ${harness.totals.passed}/${harness.totals.steps}` : null,
  },
  verticals: inventory?.verticals?.map((v) => ({ vertical: v.vertical, classification: v.classification,
    tenants: v.tenants, rows: v.rows, firestoreMigrated: false })) ?? [],
  supabaseRuntime: parity ? {
    shippedProduct: {
      database: parity.compositionRoots.shippedProduct.supabaseDatabase,
      rpc: parity.compositionRoots.shippedProduct.supabaseRpc,
      auth: parity.compositionRoots.shippedProduct.supabaseAuth,
      databaseRealtime: parity.compositionRoots.shippedProduct.supabaseRealtime,
      storage: parity.compositionRoots.shippedProduct.supabaseStorage,
    },
    firebaseRoot: firebaseRoot,
    targets: { database: 0, rpc: 0, auth: 0, databaseRealtime: 0, storage: 'INTENTIONAL' },
  } : null,
  stages,
  overallDecision: Object.values(stages).every((s) => s.decision === 'GO') ? 'GO' : 'NO_GO',
};
writeFileSync('migration/reports/staged-go.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(stages)
  .map(([name, s]) => [name, `${s.decision} (pass ${s.pass}/${s.evaluatedGates}, fail ${s.fail}, notRun ${s.notRun}, missing ${s.missing})`])), null, 2));
if (report.overallDecision !== 'GO') process.exitCode = 2;
