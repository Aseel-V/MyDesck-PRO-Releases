#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertMode } from '../lib/production-guard.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
const acknowledgement = value('--ack', null);
assertMode(mode, ['dry-run', 'production-copy'], acknowledgement);
const plan = JSON.parse(readFileSync('migration/firestore/config/production-auth-ledger-plan.json', 'utf8'));
if (plan.unknown !== 0 || plan.sourceUsers !== plan.accounted || plan.uidMismatches !== 0) throw Error('AUTH_CONSERVATION_FAILED');
if (mode === 'production-copy') {
  if (value('--go-manifest', null) === null) throw Error('SIGNED_GO_MANIFEST_REQUIRED');
  throw Error('PRODUCTION_IMPORT_NOT_AUTHORIZED_IN_PREPARATION_MILESTONE');
}
console.log(JSON.stringify({ mode, users: plan.sourceUsers, accounted: plan.accounted, unknown: plan.unknown,
  manualAction: plan.users.filter((u) => u.classification === 'MANUAL_OPERATOR_ACTION').length,
  productionImports: 0, status: 'DRY_RUN_READY' }));
