#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { assertMode, assertReadOnlySource } from '../lib/production-guard.mjs';
import { authorize, STAGES } from '../lib/production-execution-authorization.mjs';

const value = (name, fallback) => process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'dry-run');
assertMode(mode, ['dry-run', 'rehearsal', 'production-copy', 'final-delta'], value('--ack', null));
const config = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const delta = JSON.parse(readFileSync('migration/firestore/config/production-delta-map.json', 'utf8'));
assertReadOnlySource({ readOnly: config.sourceSnapshot.readOnly,
  isolationLevel: config.sourceSnapshot.isolationLevel, writeAttemptRejected: true });
if (delta.tables !== 77 || delta.unknown !== 0) throw Error('DELTA_MAP_INCOMPLETE');
// The preparation-milestone refusal is replaced by the controlled authorization gate, not
// removed. Every condition in authorize() must hold; --mode=production-copy alone grants
// nothing, and there is no force/skip/env bypass. See production-execution-authorization.mjs.
if (mode === 'production-copy' || mode === 'final-delta') {
  const readinessPath = 'migration/reports/firestore-production-dry-run.json';
  const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, 'utf8')) : null;
  const decision = authorize({
    mode,
    stage: mode === 'final-delta' ? STAGES.firestoreFinalDelta : STAGES.firestoreBulkCopy,
    acknowledgement: value('--ack', null),
    goManifestPath: value('--go-manifest', null),
    config,
    readiness,
  });
  if (!decision.authorized) {
    console.error(JSON.stringify({ authorized: false, stage: mode, reasons: decision.reasons,
      checks: decision.checks, firestoreWrites: 0, authImports: 0, sourceWrites: 0 }, null, 2));
    throw Error(`PRODUCTION_EXECUTION_REFUSED:${decision.reasons.join(',')}`);
  }
  // Authorized. This is the last point before the first production write; --validate-only
  // stops here deliberately so the whole chain can be proven without mutating anything.
  console.log(JSON.stringify({ authorized: true, state: 'AUTHORIZED_TO_EXECUTE', stage: mode,
    checks: decision.checks, firestoreWrites: 0, authImports: 0, sourceWrites: 0 }, null, 2));
  if (process.argv.includes('--validate-only')) process.exit(0);
  throw Error('PRODUCTION_COPY_EXECUTION_NOT_IMPLEMENTED_IN_THIS_CHANGE');
}
console.log(JSON.stringify({ mode, sourceProject: config.supabaseProject, targetProject: config.firebaseProject,
  databaseId: config.firestoreDatabaseId, tables: delta.tables, unknown: delta.unknown,
  sourceWrites: 0, targetWrites: 0, status: 'DRY_RUN_READY' }));
