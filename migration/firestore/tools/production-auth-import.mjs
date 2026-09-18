#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { assertMode } from '../lib/production-guard.mjs';
import { authorize, STAGES } from '../lib/production-execution-authorization.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
const acknowledgement = value('--ack', null);
assertMode(mode, ['dry-run', 'production-copy'], acknowledgement);
const plan = JSON.parse(readFileSync('migration/firestore/config/production-auth-ledger-plan.json', 'utf8'));
if (plan.unknown !== 0 || plan.sourceUsers !== plan.accounted || plan.uidMismatches !== 0) throw Error('AUTH_CONSERVATION_FAILED');
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
  if (process.argv.includes('--validate-only')) process.exit(0);
  throw Error('PRODUCTION_AUTH_IMPORT_EXECUTION_NOT_IMPLEMENTED_IN_THIS_CHANGE');
}
console.log(JSON.stringify({ mode, users: plan.sourceUsers, accounted: plan.accounted, unknown: plan.unknown,
  manualAction: plan.users.filter((u) => u.classification === 'MANUAL_OPERATOR_ACTION').length,
  productionImports: 0, status: 'DRY_RUN_READY' }));
