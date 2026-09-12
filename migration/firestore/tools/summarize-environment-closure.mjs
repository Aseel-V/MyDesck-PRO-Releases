#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hash } from '../lib/environment-readiness.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const root='migration/reports/';
const previous=read('migration/env-blocker-closure.local/previous-go.json');
const current=read(root+'firestore-production-dry-run.json');
const inv=read(root+'firebase-production-environment-inventory.json');
const indexes=read(root+'firebase-production-index-readiness.json');
const preservation=read(root+'firebase-env-staged-preservation.json');
const harness=read(root+'firestore-full-harness.json');
const regression=read(root+'firebase-environment-regression.json');
const e=inv.evidence;
const facts={
  environment:{rootCause:'approvedPreparationCommit remains PENDING_POST_REVIEW_PIN; actual project/database identity is confirmed',canCodexSafelyFix:'Prepare reviewed commit; operator approval required for pin',requiresOperator:true,requiresBilling:false,requiresIAM:false,requiresDeployment:false,productionMutationInvolved:false,action:'Kept commit gate intact; no self-approval',closureEvidence:'config/production-migration.json; current GO identityFailures'},
  secret:{rootCause:'Active source credential removed; provider revocation has not been confirmed',canCodexSafelyFix:'No; operator-only provider action',requiresOperator:true,requiresBilling:false,requiresIAM:false,requiresDeployment:false,productionMutationInvolved:true,action:'Safe scanner rerun; asked for confirmation without requesting token; no confirmation received',closureEvidence:'active-secret-regression.json; no revocation attestation'},
  iam:{rootCause:'Migration account has firebaseauth.admin only; datastore permissions absent; runtime/deployer identities absent; human Owner remains; full resource analysis blocked by disabled Troubleshooter',canCodexSafelyFix:'Read-only analysis and exact plan/apply tooling completed; no grant authorized',requiresOperator:true,requiresBilling:false,requiresIAM:true,requiresDeployment:false,productionMutationInvolved:true,action:'Project policy, role permissions and permission probes inspected; separate named identities and conditional datastore.user planned',closureEvidence:'firebase-production-environment-inventory.json; PRODUCTION_ENV_IAM_ANALYSIS.md; production-iam.mjs'},
  rules:{rootCause:'Human Rules API request lacked quota-project header; migration identity separately lacks firebaserules.releases.get',canCodexSafelyFix:'Yes, using already-authorized human read with quota project',requiresOperator:false,requiresBilling:false,requiresIAM:false,requiresDeployment:false,productionMutationInvolved:false,action:'Read release and source, captured deny-all rollback and source SHA-256; candidate emulator suite PASS; no deployment',closureEvidence:'release/current-production/manifest.json; source-0.rules; current GO rules evidence'},
  indexes:{rootCause:'Authenticated index listing succeeds and returns zero composites; three ordered repository queries require exact composites',canCodexSafelyFix:'Verified queries and prepared three creation commands; apply requires operator',requiresOperator:true,requiresBilling:false,requiresIAM:true,requiresDeployment:true,productionMutationInvolved:true,action:'Exact specification/state matcher added; no count-only PASS and no unrelated field override deployment',closureEvidence:'firebase-production-index-readiness.json; src/data/FirestoreTravelRepository.ts:27,48'},
  functions:{rootCause:'Billing disabled; Functions/Run/Build/Artifact Registry disabled; runtime identity absent; deployment and real Auth/App Check callable path unproven',canCodexSafelyFix:'Local v2 synthetic candidate and emulator proof prepared; capability actions require operator',requiresOperator:true,requiresBilling:true,requiresIAM:true,requiresDeployment:true,productionMutationInvolved:true,action:'Classified all callables, kept notifications quarantined; isolated synthetic candidate prepared; no API enablement/deployment',closureEvidence:'inventory APIs/billing; production-readiness-smoke.mjs; readiness-smoke.test.mjs; PRODUCTION_REAL_SMOKE_PLAN.md'},
  storage:{rootCause:'No project buckets; Firebase Storage API disabled; billing disabled; candidate Rules references nonexistent (default) database while production uses default',canCodexSafelyFix:'Inventory, target guard and private-smoke plan completed; provider capability confirmation needed before secure integration changes',requiresOperator:true,requiresBilling:true,requiresIAM:true,requiresDeployment:true,productionMutationInvolved:true,action:'Bucket pin intentionally empty; flagged database-reference mismatch; no guessed bucket or weakened Rules',closureEvidence:'inventory buckets/defaultBucket; production-storage-target.json; rules/storage.rules:40; PRODUCTION_REAL_SMOKE_PLAN.md'},
  electron:{rootCause:'Packaged Electron attestation provider and real token proof absent; production client has no initialized App Check provider',canCodexSafelyFix:'Proof design prepared; approved provider/configuration required before client integration',requiresOperator:true,requiresBilling:true,requiresIAM:true,requiresDeployment:true,productionMutationInvolved:true,action:'Read real App Check service configuration; documented provider-dependent integration; no debug-token or enforcement bypass',closureEvidence:'inventory appCheck; src/data/firebaseClient.ts; APP_CHECK_PLAN.md; PRODUCTION_REAL_SMOKE_PLAN.md'},
};
const matrix=previous.go.gates.filter(g=>['FAIL','NOT_RUN'].includes(g.status)).map(g=>{
  const now=current.go.gates.find(n=>n.name===g.name);
  if(!facts[g.name] || !now) throw Error('UNCLASSIFIED_PREVIOUS_GATE');
  return {gateId:g.name,previousStatus:g.status,currentStatus:now.status,closureStatus:now.status==='PASS'?'CLOSED':'OPERATOR_BLOCKED',
    transition:`${g.status} -> ${now.status}`,...facts[g.name]};
});
if(matrix.length!==8 || previous.go.fail!==6 || previous.go.notRun!==2) throw Error('PREVIOUS_EVIDENCE_MISMATCH');
copyFileSync('migration/env-blocker-closure.local/previous-go.json',root+'firebase-env-previous-go.json');
const smoke={firestore:'NOT_RUN',auth:'NOT_RUN',function:'NOT_RUN',storage:'NOT_RUN',rollback:'NOT_RUN',
  reason:'Prerequisite billing, IAM, indexes, Functions, Storage, App Check and secret gates unresolved',
  realResourcesCreated:0,cleanup:'NOT_APPLICABLE_ZERO_CREATED',localSyntheticCallableAndRollback:'PASS_EMULATOR_ONLY'};
write(root+'firebase-production-synthetic-cleanup.json',{generatedAt:new Date().toISOString(),migrationRunId:`migration-test--production-readiness-${randomUUID()}`,
  project:'mydesckpro',database:'projects/mydesckpro/databases/default',state:'NOT_RUN',resources:[],created:0,deleted:0,
  cleanupPolicy:'Exact created-by-run receipt, live run marker and version precondition; no wildcard deletion'});
const productionChanges={supabaseCustomerWrites:0,firebaseCustomerFirestoreWrites:0,firebaseCustomerAuthImports:0,customerStorageMigration:0,
  backendCutover:'NOT_STARTED',writeFreeze:'NOT_STARTED',supabaseDeletion:'NOT_STARTED',cloudSql:'NOT_USED',environmentMutations:0};
const report={generatedAt:new Date().toISOString(),phase:'4B',startingSha:preservation.startingSha,
  evidenceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),recovery:preservation,
  previousGo:previous.go,currentGo:current.go,matrix,billing:{...e.billing.data,pricingPlan:'SPARK_DERIVED_FROM_BILLING'},
  indexes:{required:indexes.required,ready:indexes.ready,creating:indexes.creating,missing:indexes.missing,error:indexes.error},
  realProof:smoke,harness:harness.totals,supplementary:{passed:regression.passed,failed:regression.failed},productionChanges,
  softwareReadiness:'Closure tooling and regression PASS; provider-dependent App Check integration and Storage database compatibility remain blocked',
  projectCapability:'BLOCKED',decision:'BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN'};
write(root+'firebase-production-env-blocker-closure.json',report);
const rows=matrix.map(m=>`| ${m.gateId} | ${m.previousStatus} → ${m.currentStatus} / ${m.closureStatus} | ${m.rootCause} | ${m.canCodexSafelyFix} | ${m.requiresOperator?'YES':'NO'} | ${m.requiresBilling?'YES':'NO'} | ${m.requiresIAM?'YES':'NO'} | ${m.requiresDeployment?'YES':'NO'} | ${m.productionMutationInvolved?'YES, closure action only':'NO'} | ${m.closureEvidence} |`).join('\n');
const transitions=matrix.map(m=>`### ${m.gateId}\n\nPrevious state: ${m.previousStatus}. Current state: ${m.currentStatus} (${m.closureStatus}).\n\nRoot cause: ${m.rootCause}.\n\nAction: ${m.action}.\n\nEvidence: ${m.closureEvidence}. Operator required: ${m.requiresOperator?'YES':'NO'}.`).join('\n\n');
const rules=e.currentRules;
writeFileSync(root+'FIREBASE_PRODUCTION_ENV_BLOCKER_CLOSURE.md',`# Firebase production environment blocker closure — Phase 4B

**BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN**

Software closure tooling and local regression are ready. Project capability remains blocked. Provider-dependent App Check integration and Storage database compatibility also require resolution; billing alone will not close every gate. No production environment mutation, customer migration, backend switch or write freeze occurred.

## Recovery

Starting SHA: ${preservation.startingSha}

Evidence executable HEAD: ${report.evidenceHead}

Ending SHA: resolve the report-bearing commit with \`git log -1 --format=%H -- migration/reports/FIREBASE_PRODUCTION_ENV_BLOCKER_CLOSURE.md\`. The final response records the exact ending SHA; a commit cannot embed its own content-derived SHA.

Branch: ${preservation.branch}

Recovery tag: ${preservation.recoveryTag}

Staged preserved: ${preservation.preserved}/${preservation.baselineCount}, byte-identical index blobs/modes/stages. Manifest SHA-256: \`${preservation.overallStagedManifestSha256}\`. Baseline path/hash inventory is in ignored \`migration/env-blocker-closure.local/staged-baseline.json\`; public verification is \`firebase-env-staged-preservation.json\`. No \`git add .\`, \`git commit -a\`, reset, or pre-existing staged content included in closure commits. Supplementary suites' historical staged report worktrees were restored.

## Previous GO state

PASS: ${previous.go.pass}; FAIL: ${previous.go.fail}; NOT RUN: ${previous.go.notRun}; Missing: ${previous.go.missing}. Decision: ${previous.go.decision}.

Authority: archived machine evidence [previous GO](firebase-env-previous-go.json), originally \`firestore-production-dry-run.json\`. Its exact FAIL gates are environment, secret, iam, indexes, functions, storage. NOT_RUN gates are rules and electron. Rollback was PASS for a plan/journal model; real rollback and synthetic smoke were not independent gates in that 22-gate engine. They are additional mandatory dry-run prerequisites here, all NOT_RUN in the real project.

## Exact blocker matrix

The mutation column describes an outstanding closure action, not an action taken. All actual production mutations remain zero. OPERATOR_BLOCKED is explanatory metadata; the engine retains FAIL/NOT_RUN semantics.

| Gate | Previous → current / closure | Root cause | Can Codex safely fix? | Operator? | Billing? | IAM? | Deploy? | Production mutation? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

${transitions}

## Billing

Billing account linked: NO. Billing enabled: NO (authenticated HTTP 200). Firebase plan: Spark, derived from account-unlinked/billing-disabled state using the same capability endpoint as Firebase CLI. Functions capable: NO. Storage capable: NO. Operator action: link an approved billing account / upgrade Blaze; then enable only required APIs. No account/payment details were retained. [Billing readiness](../firestore/PRODUCTION_BILLING_READINESS.md).

## Firestore IAM

Migration identity: \`${inv.migrationIdentity}\`. Database: \`${inv.database}\`; metadata read confirms Native Enterprise, nam5; \`(default)\` returns 404.

Bindings current: migration account only \`roles/firebaseauth.admin\`. Roles proposed: conditional \`roles/datastore.user\` for writer and separate runtime; bucket objectUser for separate Storage identity; Rules viewer / custom release deployer; indexAdmin for separate deployer. No grant applied.

Permission analysis: required datastore permissions FAIL (none returned at project scope; synthetic nonexistent read HTTP 403). Project-level prohibited-permission probes PASS for absence; complete resource-level analysis NOT_RUN because Troubleshooter is disabled and database testIamPermissions returns HTTP 500. Resource actAs tests are preserved in inventory. Broad role count: migration 0; human 1 pre-existing Owner; newly granted broad roles 0. [Detailed separation and exact plan/apply](../firestore/PRODUCTION_ENV_IAM_ANALYSIS.md).

## Rules

Current Rules retrievable: YES. Release: \`${rules?.release}\`. Version: \`${rules?.ruleset}\`.

Current hash: \`${rules?.files?.[0]?.sha256}\`. Current source denies all reads/writes.

Candidate hash: \`${hash(readFileSync('migration/firestore/rules/firestore.rules'))}\`.

Rollback available: YES, captured immutable [source](../firestore/release/rollback-production/source-0.rules) and [manifest](../firestore/release/rollback-production/manifest.json); rollback hash equals current hash. Candidate and current differ. Reader fix: explicit quota project on the human Rules request, no IAM grants. Migration principal still correctly lacks Rules read permission. Tests: complete candidate Rules emulator suite PASS, 25 tests; full security/transaction/application harness below. Deployed: NO. Hash availability is readiness evidence, not a claim of active candidate behavior.

## Indexes

Required: ${indexes.required}. Ready: ${indexes.ready}. Creating: ${indexes.creating}. Missing: ${indexes.missing}. Error: ${indexes.error}.

Three exact repository query shapes verified: tenant/deletion ordered startDate; tenant/deletion/status ordered startDate; tenant/status dueDate range. The first two use document-ID ASC cursor tie-breaking. Exact fields, orders and live states: [index readiness and commands](firebase-production-index-readiness.json). No indexes or field overrides were deployed. 3/3 READY is required.

## Functions

Required APIs: Cloud Functions, Cloud Run, Cloud Build, Artifact Registry DISABLED. Eventarc DISABLED and not required for current callables; Pub/Sub ENABLED. Billing: disabled. Deploy capability: FUNCTIONS DEPLOYMENT BLOCKED BY BILLING. Synthetic smoke: NOT_RUN in real project; isolated v2 candidate and emulator transaction/idempotency/journal proof prepared.

External-side-effect suppression: no Firestore event triggers in current candidate; all callable/legacy/notification functions classified in [smoke plan](../firestore/PRODUCTION_REAL_SMOKE_PLAN.md). WhatsApp remains NOTIFICATION_QUARANTINED. The four application mutators are ENABLE_AFTER_CUTOVER, not falsely described as dormant-safe without server suppression. No production Function was deployed.

## Storage

Target bucket: UNPROVISIONED (authenticated all-buckets list returned zero). Billing: disabled. Firebase Storage API: disabled; generic Storage API enabled. IAM: no bucket binding to plan/apply until a real target is discovered and pinned; object-only identity separated from clients. Rules: candidate kept private, not deployed. Synthetic checksum smoke: NOT_RUN.

Additional integration blocker: candidate cross-service Rules point to \`(default)\`; production database ID is \`default\`. Existing emulator tests exercise \`(default)\` and cannot prove that named-database integration. Official Storage documentation restricts cross-service database access. Resolve through platform confirmation and a secure synthetic test; no duplicate database or weakened tenant boundary. [Official Storage conditions](https://firebase.google.com/docs/storage/security/rules-conditions).

## Secret

Active source: REMOVED; fresh scanner active findings 0. Revocation confirmed: NO. Hard GO blocker: YES. Operator continuation is not revocation confirmation. No token displayed, used, authenticated with, or stored. Provider revocation/rotation must be confirmed separately.

## Real Firebase smoke

Firestore: NOT_RUN. Auth: NOT_RUN. Function: NOT_RUN. Storage: NOT_RUN. Prerequisites blocked. Cleanup: NOT_APPLICABLE, real resources created 0; [empty tracked cleanup manifest](firebase-production-synthetic-cleanup.json). Only a read of a nonexistent synthetic Firestore path was attempted for IAM diagnosis; HTTP 403, no customer data read/write.

## Rollback synthetic rehearsal

Real-project result: NOT_RUN, blocked by capabilities. Emulator result: PASS for isolated transactional synthetic payment/journal, idempotency, Firestore-only detection and exact cleanup plan. Backend remains Supabase; source customer writes 0. Existing GO rollback PASS remains a plan-level result and is not represented as a real rehearsal PASS.

## GO engine

Previous: ${previous.go.decision} — ${previous.go.pass} PASS / ${previous.go.fail} FAIL / ${previous.go.notRun} NOT RUN / ${previous.go.missing} missing.

Current: ${current.go.decision} — ${current.go.pass} PASS / ${current.go.fail} FAIL / ${current.go.notRun} NOT RUN / ${current.go.missing} missing.

Machine evidence: [current GO](firestore-production-dry-run.json), [closure matrix](firebase-production-env-blocker-closure.json). The 22 required gate identities and evaluateGo semantics are unchanged. Rules closure is source/release/hash capture plus existing emulator evidence. Index readiness now matches specifications and READY state rather than a count. Nothing absent was counted as PASS. Real smoke/rollback are additional blockers even though the legacy engine does not enumerate them independently.

## Harness

Steps: ${harness.totals.passed}/${harness.totals.steps}. Tests: ${harness.totals.nodeTestCases}. Assertion sites: ${harness.totals.assertionCallSites}. Failures: ${harness.totals.failed}.

Previous baseline retained: 19/19, 172 tests, 528 assertion sites. Added 14 environment/cleanup/Rules artifact guards and 3 isolated synthetic callable tests. Supplementary local regression: ${regression.passed}/${regression.results.length} PASS, ${regression.failed} failures, including the existing 10-step PostgreSQL migration/reconciliation harness and native PostgreSQL security plus application suites. [Main harness](firestore-full-harness.json), [supplementary regression](firebase-environment-regression.json). Corpus evidence from the prior migration phase is preserved, not presented as a fresh customer-corpus migration. A discarded run used the wrong emulator project; another lost the emulator and completed late. The final verified run replaces these failures; no test was removed or relaxed.

## Production changes

Supabase customer writes: 0. Firebase customer Firestore writes: 0. Firebase customer Auth imports: 0. Customer Storage migration: 0. Backend cutover: NOT STARTED. Write freeze: NOT STARTED. Supabase deletion: NOT STARTED. Cloud SQL: NOT USED. Production environment mutations: 0. Real synthetic resources created: 0.

## Remaining actions

[Short executable operator list](../firestore/OPERATOR_ACTIONS_BEFORE_DRY_RUN.md): revocation confirmation, approved commit pin, billing/Blaze, APIs, separated IAM, 3 indexes READY, private Storage provisioning/pin and database compatibility, App Check provider/client integration, separately approved candidate deployment and real synthetic smoke/rollback/cleanup. Do not run production-copy, final-delta, source Auth import, Storage corpus copy, write freeze or cutover.

BLOCKED — FIX BEFORE PRODUCTION MIGRATION DRY-RUN
`);
console.log(JSON.stringify({previous:previous.go.decision,current:current.go.decision,matrix:matrix.map(m=>({gate:m.gateId,transition:m.transition})),decision:report.decision}));
