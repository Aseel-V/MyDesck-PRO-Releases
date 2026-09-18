#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { assertMode } from '../lib/production-guard.mjs';
import { authorize, STAGES } from '../lib/production-execution-authorization.mjs';
import { openAuthorizedAuthImportTarget } from '../lib/authorized-auth-import-target.mjs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const REPORT_PATH = 'migration/reports/firestore-production-auth-import.json';
const fingerprint = (uid) => createHash('sha256').update(uid).digest('hex').slice(0, 12);

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
const acknowledgement = value('--ack', null);
assertMode(mode, ['dry-run', 'production-copy'], acknowledgement);
const plan = JSON.parse(readFileSync('migration/firestore/config/production-auth-ledger-plan.json', 'utf8'));
if (plan.unknown !== 0 || plan.sourceUsers !== plan.accounted || plan.uidMismatches !== 0) throw Error('AUTH_CONSERVATION_FAILED');
// An unresolved MANUAL_OPERATOR_ACTION means the plan is still asking a question nobody answered;
// importing under it would answer that question by default, in production.
if ((plan.manualOrUnknownRemaining ?? 0) !== 0) throw Error('AUTH_MANUAL_CLASSIFICATIONS_UNRESOLVED');
if (plan.toImport + plan.excludedByOperator !== plan.sourceUsers) throw Error('AUTH_IMPORT_SPLIT_UNACCOUNTED');
const importFingerprints = new Set(plan.users.filter((user) => user.toImport)
  .map((user) => user.sourceUidFingerprint));
const excludedFingerprints = new Set(plan.users.filter((user) => !user.toImport)
  .map((user) => user.sourceUidFingerprint));
// Same controlled gate as the data migration, bound to its own stage so a Firestore manifest
// can never authorize an Auth import. Auth import is a SEPARATE operator stage and never
// follows the bulk copy automatically.
if (mode === 'production-copy') {
  const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
  const readinessPath = 'migration/reports/firestore-production-dry-run.json';
  const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, 'utf8')) : null;
  const decision = authorize({ mode, stage: STAGES.authImport, acknowledgement: acknowledgement,
    goManifestPath: value('--go-manifest', null), config, readiness });
  if (!decision.authorized) {
    console.error(JSON.stringify({ authorized: false, stage: 'auth-import', reasons: decision.reasons,
      checks: decision.checks, authImports: 0, firestoreWrites: 0, sourceWrites: 0 }, null, 2));
    throw Error(`PRODUCTION_EXECUTION_REFUSED:${decision.reasons.join(',')}`);
  }
  console.log(JSON.stringify({ authorized: true, state: 'AUTHORIZED_TO_EXECUTE', stage: 'auth-import',
    checks: decision.checks, authImports: 0, firestoreWrites: 0, sourceWrites: 0 }, null, 2));
  const validateOnly = process.argv.includes('--validate-only');

  // ---- source credentials, read inside one READ ONLY snapshot ---------------------------------
  // The bcrypt hash is the only secret on this path. It is read here, handed to the import call,
  // and never logged, reported or retained.
  const snapshotEvidence = {};
  const rows = await withSourceSnapshot(localConfig(), async (select) => (await select(`
    SELECT u.id::text AS uid, u.email AS email,
      (u.email_confirmed_at IS NOT NULL) AS email_verified,
      (u.banned_until IS NOT NULL AND u.banned_until > now()) AS disabled,
      u.encrypted_password AS password_hash
    FROM auth.users u ORDER BY u.id`)).rows, snapshotEvidence);
  if (snapshotEvidence.rejectedWriteSqlState !== '25006' || snapshotEvidence.successfulWrites !== 0) {
    throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
  }
  if (rows.length !== plan.sourceUsers) throw Error(`SOURCE_USER_COUNT_DRIFT:${rows.length}`);

  const selected = rows.filter((row) => importFingerprints.has(fingerprint(row.uid)));
  const skipped = rows.filter((row) => excludedFingerprints.has(fingerprint(row.uid)));
  if (selected.length !== plan.toImport) throw Error(`IMPORT_SELECTION_MISMATCH:${selected.length}`);
  if (selected.length + skipped.length !== rows.length) throw Error('IMPORT_SELECTION_UNACCOUNTED');
  const BCRYPT_SHAPE = /^[$]2[aby][$]/;
  if (!selected.every((row) => BCRYPT_SHAPE.test(row.password_hash ?? ''))) {
    throw Error('IMPORT_PASSWORD_HASH_NOT_BCRYPT');
  }

  const importPlan = selected.map((row) => ({
    uid: row.uid, email: row.email, emailVerified: row.email_verified === true,
    disabled: row.disabled === true, passwordHash: row.password_hash,
  }));

  // ---- the operator token. Identity Toolkit administration is not on the migration role. -------
  const sdk = process.env.GCLOUD_SDK_ROOT
    ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
  const tokenFactory = () => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
    [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }).trim();

  const target = await openAuthorizedAuthImportTarget({
    capability: decision.capability, importPlan,
    projectId: config.firebaseProject, databaseId: config.firestoreDatabaseId,
    sourceProject: config.supabaseProject, stage: STAGES.authImport,
    expectedCount: plan.toImport, tokenFactory,
  });

  try {
    const emptiness = await target.assertAuthEmpty();
    const migrationRunId = `authimport-${randomUUID()}`;
    const preview = {
      generatedAt: new Date().toISOString(),
      artifact: 'firestore-production-auth-import',
      migrationRunId,
      projectId: target.projectId,
      sourceUsers: rows.length,
      toImport: importPlan.length,
      excludedByOperator: skipped.length,
      excludedFingerprints: [...excludedFingerprints].sort(),
      importFingerprints: [...importFingerprints].sort(),
      firebaseAccountsBefore: emptiness.existingAccounts,
      uidPreservation: 'SOURCE_UUID_USED_AS_FIREBASE_UID_VERBATIM',
      uidRemappingTable: 'NONE',
      passwordHandling: 'BCRYPT_PASSED_THROUGH_NEVER_RECORDED',
      snapshot: {
        isolationLevel: snapshotEvidence.start?.isolation ?? null,
        readOnly: snapshotEvidence.start?.read_only ?? null,
        rejectedWriteSqlState: snapshotEvidence.rejectedWriteSqlState,
        successfulWrites: snapshotEvidence.successfulWrites,
      },
    };

    if (validateOnly) {
      const report = { ...preview, state: 'AUTHORIZED_TO_EXECUTE', validateOnly: true,
        imported: 0, uidMismatches: 0, decision: 'VALIDATE_ONLY',
        stoppedBefore: 'importPlannedUsers - no account was created',
        mutations: { authImports: 0, firestoreWrites: 0, storageMutations: 0, sourceMutations: 0 } };
      writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
      await target.close();
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    const result = await target.importPlannedUsers();
    const verification = await target.verifyImportedUsers();
    const passed = verification.uidMismatches === 0 && verification.missing.length === 0
      && verification.unexpected.length === 0 && verification.attributeMismatches.length === 0
      && verification.accounts === importPlan.length
      && result.imported === importPlan.length;

    const report = { ...preview,
      state: 'AUTH_IMPORT_COMPLETE',
      imported: result.imported,
      firebaseAccountsAfter: verification.accounts,
      missingUsers: verification.missing.length,
      unexpectedUsers: verification.unexpected.length,
      uidMismatches: verification.uidMismatches,
      nonUuidUids: verification.nonUuidUids.length,
      attributeMismatches: verification.attributeMismatches,
      passwordsPresent: verification.passwordsPresent,
      importedUidFingerprints: result.uids.map(fingerprint).sort(),
      decision: passed ? 'AUTH_IMPORT_GO' : 'AUTH_IMPORT_NO_GO',
      mutations: { authImports: result.imported, firestoreWrites: 0, storageMutations: 0,
        sourceMutations: 0 } };
    writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await target.close();
    console.log(JSON.stringify(report, null, 2));
    process.exit(passed ? 0 : 1);
  } catch (error) {
    await target.close().catch(() => undefined);
    throw error;
  }
}
console.log(JSON.stringify({ mode, users: plan.sourceUsers, accounted: plan.accounted, unknown: plan.unknown,
  manualAction: plan.users.filter((u) => u.classification === 'MANUAL_OPERATOR_ACTION').length,
  productionImports: 0, status: 'DRY_RUN_READY' }));
