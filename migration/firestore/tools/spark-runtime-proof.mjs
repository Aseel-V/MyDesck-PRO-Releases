#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runtimeProof, sourceReferenceInventory, quotaBudget, RULE_ACCESS_BUDGET, ruleBudgetPass } from '../lib/spark-readiness.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const runtime = runtimeProof();
const historical = sourceReferenceInventory();
const quota = quotaBudget();
const storage = JSON.parse(readFileSync('migration/reports/firestore-full-storage.json', 'utf8')).storage;
const proof = {
  generatedAt: new Date().toISOString(),
  architecture: { plan: 'SPARK', billingExpected: false, functions: 'NOT_USED_IN_SPARK_ARCHITECTURE',
    storage: 'NOT_USED_IN_SPARK_ARCHITECTURE', cloudRun: 'NOT_USED', cloudSql: 'NOT_USED' },
  runtime,
  historicalSourceReferences: historical,
  storageArchive: { objects: storage.sourceObjects, bytes: storage.bytesRehearsed,
    signatures: storage.signatureObjects, manifestComplete: storage.manifested === storage.sourceObjects,
    action: 'PRESERVE_IN_SUPABASE_READ_ONLY_ARCHIVE_DURING_ROLLBACK_WINDOW' },
  quota,
  rulesAccessBudget: RULE_ACCESS_BUDGET,
  rulesAccessBudgetPass: ruleBudgetPass(),
  status: runtime.activeCallableFunctionCalls === 0 && runtime.activeStorageCalls === 0
    && runtime.activeSupabaseCalls === 0 && runtime.activePrivilegedCredentials === 0
    && runtime.activeFileUploadUi === 0 && ruleBudgetPass() && quota.conclusion.startsWith('SAFE')
    ? 'PASS' : 'FAIL',
};
writeReport('migration/reports/firebase-spark-runtime-proof.json', `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ status: proof.status, activeFunctions: runtime.activeCallableFunctionCalls,
  activeStorage: runtime.activeStorageCalls, activeSupabase: runtime.activeSupabaseCalls,
  activePrivilegedCredentials: runtime.activePrivilegedCredentials, activeFileUploadUi: runtime.activeFileUploadUi,
  ruleBudget: proof.rulesAccessBudgetPass, quota: quota.conclusion }));
if (proof.status !== 'PASS') process.exitCode = 1;
