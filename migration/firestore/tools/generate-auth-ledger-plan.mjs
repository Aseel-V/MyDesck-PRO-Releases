#!/usr/bin/env node
/**
 * Derive the Auth import plan from the readiness report.
 *
 * The plan config used to be a standing file with no generator, which meant the classification the
 * importer enforced and the classification the ledger measured could drift apart silently. It is
 * now derived, so the only way to change who gets imported is to change the source data or the
 * operator's exclusion config — not the plan.
 *
 * Read-only with respect to production. Writes one config file.
 *
 *   node migration/firestore/tools/generate-auth-ledger-plan.mjs
 */
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const READINESS = 'migration/reports/firestore-auth-production-readiness.json';
const OUT = 'migration/firestore/config/production-auth-ledger-plan.json';

const readiness = JSON.parse(readFileSync(READINESS, 'utf8'));
if (readiness.unknown !== 0) throw Error('READINESS_HAS_UNKNOWN_CLASSIFICATIONS');
if (readiness.manualOrUnknownRemaining !== 0) {
  throw Error(`READINESS_HAS_UNRESOLVED_MANUAL_CLASSIFICATIONS:${readiness.manualOrUnknownRemaining}`);
}
if (readiness.totalUsers !== readiness.accounted) throw Error('READINESS_CONSERVATION_FAILED');
if (readiness.uidMismatches !== 0) throw Error('READINESS_UID_MISMATCHES');
if (readiness.toImport + readiness.excludedByOperator !== readiness.totalUsers) {
  throw Error('READINESS_IMPORT_SPLIT_DOES_NOT_ACCOUNT_FOR_EVERY_USER');
}

const plan = {
  generatedAt: new Date().toISOString(),
  derivedFrom: READINESS,
  mode: 'PLAN_ONLY',
  migrationRunId: 'ASSIGNED_AT_IMPORT',
  sourceUsers: readiness.totalUsers,
  accounted: readiness.totalUsers,
  unknown: 0,
  uidMismatches: 0,
  toImport: readiness.toImport,
  excludedByOperator: readiness.excludedByOperator,
  manualOrUnknownRemaining: 0,
  operatorExclusionDecision: readiness.operatorExclusionDecision,
  operatorExclusionDecidedAt: readiness.operatorExclusionDecidedAt,
  states: ['PENDING', 'IMPORTED', 'VERIFIED', 'EXCLUDED', 'FAILED'],
  users: readiness.users.map((user) => ({
    sourceUidFingerprint: user.uidFingerprint,
    // An excluded identity has no target uid, so it gets none here either. Repeating the source
    // fingerprint in the target column would read as "imported unchanged", which is the opposite
    // of what the operator decided.
    targetUidFingerprint: user.toImport ? user.uidFingerprint : null,
    uidPreserved: user.uidPreserved,
    toImport: user.toImport,
    classification: user.classification,
    requiredAction: user.requiredAction,
    emailVerified: user.emailVerified,
    disabled: user.status === 'DISABLED',
    plannedState: user.plannedState,
    postImportVerification: user.toImport
      ? ['UID_EQUAL', 'DISABLED_STATE_EQUAL', 'EMAIL_VERIFICATION_EQUAL', 'TOKEN_SIGN_IN_OR_RESET_FLOW']
      : ['ABSENT_FROM_FIREBASE_AUTH'],
  })),
};

writeReport(OUT, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ written: OUT, sourceUsers: plan.sourceUsers, toImport: plan.toImport,
  excludedByOperator: plan.excludedByOperator, unknown: plan.unknown,
  manualOrUnknownRemaining: plan.manualOrUnknownRemaining, uidMismatches: plan.uidMismatches }, null, 2));
