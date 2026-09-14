#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { iamPlan } from '../lib/environment-readiness.mjs';

const inventory = JSON.parse(readFileSync('migration/reports/firebase-production-environment-inventory.json', 'utf8'));
const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const gcloud = args => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), ...args], { encoding: 'utf8', windowsHide: true });
const role = JSON.parse(gcloud(['iam', 'roles', 'describe', 'roles/datastore.user', '--format=json']));
const plan = iamPlan('migration-writer');
const quote = value => `'${value.replaceAll("'", "''")}'`;
const migrationMember = plan.binding.member;
const current = inventory.evidence.iamPolicy?.data?.bindings?.filter(binding =>
  binding.serviceAccounts?.includes(migrationMember)) ?? [];
const forbidden = [
  'resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.createBillingAssignment',
  'billing.accounts.update', 'iam.serviceAccounts.actAs', 'secretmanager.versions.access',
  'serviceusage.services.enable',
];
const report = {
  generatedAt: new Date().toISOString(), project: 'mydesckpro', database: 'projects/mydesckpro/databases/default',
  identity: migrationMember, productionMutations: 0, mode: 'plan',
  currentBindings: current.map(({ role, condition }) => ({ role, condition })),
  syntheticRead: inventory.evidence.migrationSyntheticRead,
  proposed: { ...plan.binding, approvalSha256: plan.approvalSha256,
    command: `node migration/firestore/tools/production-iam.mjs --mode=apply --binding=migration-writer --approval-sha256=${plan.approvalSha256}`,
    removalCommand: `gcloud ${plan.remove.map(quote).join(' ')}`,
    resourceScope: 'Project binding constrained to the default database and its document descendants by IAM Condition.' },
  roleDefinition: { name: role.name, title: role.title, stage: role.stage,
    permissionCount: role.includedPermissions.length,
    entityPermissions: role.includedPermissions.filter(p => p.startsWith('datastore.entities.')),
    databasePermissions: role.includedPermissions.filter(p => p.startsWith('datastore.databases.')),
    indexPermissions: role.includedPermissions.filter(p => p.startsWith('datastore.indexes.')),
    forbiddenPermissionsPresent: role.includedPermissions.filter(p => forbidden.includes(p)) },
  broadRoleCount: current.filter(binding => ['roles/owner','roles/editor','roles/firebase.admin'].includes(binding.role)).length,
  permissionAnalysis: 'FAIL',
  reason: 'The binding is not applied; the service account synthetic Firestore read is denied. Effective positive and negative tests remain NOT RUN.',
  operatorActionRequired: true,
};
writeFileSync('migration/reports/firestore-production-iam-analysis.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
