import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quotaBudget, ruleBudgetPass, RULE_ACCESS_BUDGET, runtimeProof } from '../lib/spark-readiness.mjs';

test('Firebase-mode import graph has no paid or privileged runtime dependency', () => {
  const proof = runtimeProof();
  assert.equal(proof.activeCallableFunctionCalls, 0);
  assert.equal(proof.activeStorageCalls, 0);
  assert.equal(proof.activeSupabaseCalls, 0);
  assert.equal(proof.activePrivilegedCredentials, 0);
  assert.equal(proof.activeFileUploadUi, 0);
});

test('Spark quota model is bounded and reports break-even instead of invented usage', () => {
  const budget = quotaBudget();
  assert.equal(budget.usageRateKnown, false);
  assert.ok(budget.storedQuotaUtilizationPercent < 3);
  assert.equal(budget.workflows.analyticsWorstBound.reads, 250);
  assert.equal(budget.breakEven.analyticsWorstBound, 200);
  assert.ok(budget.breakEven.payment >= 5000);
  assert.match(budget.conclusion, /^SAFE_/);
});

test('every critical atomic operation stays inside Security Rules access limits', () => {
  assert.equal(ruleBudgetPass(), true);
  for (const item of Object.values(RULE_ACCESS_BUDGET)) {
    assert.ok(item.perWriteMax <= 10);
    assert.ok(item.totalUnique <= 20);
  }
});

test('Spark financial operations use integer arithmetic and deterministic ids', () => {
  const source = readFileSync('src/data/SparkTransactionService.ts', 'utf8');
  assert.doesNotMatch(source, /parseFloat|toFixed|Math\.random/);
  assert.match(source, /SPARK_MONEY_SCALE = 2/);
  assert.match(source, /input\.clientRequestId/);
  assert.match(source, /sparkOperations/);
  assert.match(source, /amountPaidMinor: newPaid/);
});

test('billing guard and offline financial acknowledgement fail closed', () => {
  const backend = readFileSync('src/data/backendMode.ts', 'utf8');
  const repository = readFileSync('src/data/FirestoreTravelRepository.ts', 'utf8');
  assert.match(backend, /VITE_FIREBASE_EXPECTED_PLAN/);
  assert.match(backend, /SPARK/);
  assert.match(repository, /SERVER_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(repository, /supabase|httpsCallable|getFunctions|getStorage/);
});
