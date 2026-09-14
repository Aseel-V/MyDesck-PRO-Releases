#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

if (process.argv.some(arg => arg.startsWith('--mode=') && arg !== '--mode=plan')) {
  throw Error('OPERATOR_RULES_DEPLOYMENT_REQUIRED');
}
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inventory = JSON.parse(readFileSync('migration/reports/firebase-production-environment-inventory.json', 'utf8'));
const current = inventory.evidence.currentRules;
const rollback = inventory.evidence.rollbackRules;
const candidateSha256 = sha('migration/firestore/rules/firestore.rules');
const currentSha256 = current?.files?.[0]?.sha256 ?? null;
const rollbackSha256 = sha('migration/firestore/release/rollback-production/source-0.rules');
const unchanged = currentSha256 === rollback?.files?.[0]?.sha256 && currentSha256 === rollbackSha256;
const report = {
  generatedAt: new Date().toISOString(), project: 'mydesckpro', database: 'default', mode: 'plan',
  productionMutations: 0, currentRelease: current?.release ?? null, currentRuleset: current?.ruleset ?? null,
  expectedCurrentSha256: rollbackSha256, currentSha256, candidateSha256, rollbackSha256,
  currentMatchesExpectedBaseline: unchanged, candidateDeployed: currentSha256 === candidateSha256,
  deployCommand: 'firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.production.json',
  verifyCommand: 'node migration/firestore/tools/inspect-production-environment.mjs',
  rollbackCommand: 'firebase deploy --only firestore:rules --project mydesckpro --config migration/firestore/firebase.rollback-rules.json',
  operatorActionRequired: currentSha256 !== candidateSha256,
  status: unchanged ? 'READY_FOR_OPERATOR_DEPLOYMENT' : 'STOP_BASELINE_CHANGED',
};
writeFileSync('migration/reports/firestore-production-rules-plan.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!unchanged) process.exitCode = 1;
