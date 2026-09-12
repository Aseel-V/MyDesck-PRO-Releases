#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { iamPlan, assertIamApply, IAM_BINDINGS } from '../lib/environment-readiness.mjs';
const value = (name, fallback) => process.argv.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = value('--mode', 'plan');
const selected = value('--binding', null);
if (mode === 'apply' && !selected) throw Error('ONE_EXACT_BINDING_REQUIRED');
const quote = s => `'${s.replaceAll("'", "''")}'`;
for (const id of selected ? [selected] : Object.keys(IAM_BINDINGS)) {
  const plan = iamPlan(id);
  const apply = assertIamApply({ mode, approval: value('--approval-sha256', null) }, plan);
  console.log(JSON.stringify({ ...plan, command: `gcloud ${plan.args.map(quote).join(' ')}`,
    removalCommand: `gcloud ${plan.remove.map(quote).join(' ')}`, mode, operatorActionRequired: true }));
  if (apply) {
    const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
    // No shell interpretation; the approval covers every argument including condition and identity.
    execFileSync(join(sdk, 'platform/bundledpython/python.exe'), [join(sdk, 'lib/gcloud.py'), ...plan.args], { stdio: 'inherit' });
  }
}
