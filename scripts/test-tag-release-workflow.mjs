import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const workflowPath = '.github/workflows/build-release.yml';
const workflowText = readFileSync(workflowPath, 'utf8');
const workflow = yaml.load(workflowText);
const jobs = workflow.jobs ?? {};
const tagCondition = "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')";

assert.ok(workflow.on?.push?.tags?.includes('v*.*.*'), 'workflow must run for stable v*.*.* tags');
assert.ok(workflow.on?.workflow_dispatch, 'manual workflow dispatch must remain available');

const chain = [
  'tag-release-validation',
  'tag-build-desktop',
  'tag-verify-desktop-assets',
  'publish-desktop-release',
];

for (const jobName of chain) {
  const job = jobs[jobName];
  assert.ok(job, `missing tag release job: ${jobName}`);
  assert.equal(job.if, tagCondition, `${jobName} must be runnable only for a pushed v tag`);
  assert.doesNotMatch(job.if, /always\s*\(/, `${jobName} must not bypass failed or skipped dependencies`);
}

assert.equal(jobs['tag-release-validation'].needs, 'phase1-security', 'tag validation must require the security gate');
assert.equal(jobs['tag-build-desktop'].needs, 'tag-release-validation');
assert.equal(jobs['tag-verify-desktop-assets'].needs, 'tag-build-desktop');
assert.equal(jobs['publish-desktop-release'].needs, 'tag-verify-desktop-assets');
assert.equal(jobs['publish-desktop-release'].permissions?.contents, 'write');

const tagBuild = jobs['tag-build-desktop'];
assert.equal(tagBuild.env?.VITE_SUPABASE_URL, '${{ secrets.VITE_SUPABASE_URL }}');
assert.equal(tagBuild.env?.VITE_SUPABASE_ANON_KEY, '${{ secrets.VITE_SUPABASE_ANON_KEY }}');
assert.equal(tagBuild.env?.VITE_DATA_BACKEND, 'firestore');
assert.equal(tagBuild.env?.VITE_FIREBASE_PROJECT_ID, 'mydesckpro');
assert.equal(tagBuild.env?.VITE_FIRESTORE_DATABASE_ID, 'default');
assert.equal(tagBuild.env?.VITE_FIRESTORE_PRODUCTION_RELEASE, 'mydesck-firestore-v1');
assert.equal(tagBuild.env?.VITE_SUPABASE_FALLBACK_DISABLED, 'true');
assert.equal(tagBuild.env?.VITE_FIREBASE_EXPECTED_PLAN, 'SPARK');
assert.equal(tagBuild.env?.VITE_FIREBASE_BILLING_ENABLED, 'false');
assert.equal(tagBuild.env?.VITE_FIREBASE_API_KEY, '${{ secrets.VITE_FIREBASE_API_KEY }}');
assert.equal(tagBuild.env?.VITE_FIREBASE_AUTH_DOMAIN, 'mydesckpro.firebaseapp.com');

const authPreflight = tagBuild.steps?.find(
  (step) => step.name === 'Require Production Firebase and Storage Configuration',
);
assert.ok(authPreflight, 'tag Windows build must check Firebase and Storage configuration');
assert.equal(authPreflight.shell, 'pwsh');
assert.match(authPreflight.run, /IsNullOrWhiteSpace\(\$env:VITE_FIREBASE_API_KEY\)/);
assert.match(authPreflight.run, /IsNullOrWhiteSpace\(\$env:VITE_SUPABASE_URL\)/);
assert.match(authPreflight.run, /IsNullOrWhiteSpace\(\$env:VITE_SUPABASE_ANON_KEY\)/);
assert.match(authPreflight.run, /check-auth-build-config\.mjs --env --require-firestore/);
assert.doesNotMatch(authPreflight.run, /(?:echo|Write-(?:Host|Output|Verbose|Debug)).*\$env:VITE_SUPABASE_/i);
assert.doesNotMatch(authPreflight.run, /(?:Out-File|Set-Content|Add-Content|>).*\.env/i);

const stepsText = (jobName) => JSON.stringify(jobs[jobName].steps ?? []);
assert.match(stepsText('tag-release-validation'), /npm run test:updater/);
assert.match(stepsText('tag-release-validation'), /npm run test:release-version/);
assert.match(stepsText('tag-release-validation'), /package-lock\.json/);
assert.match(stepsText('tag-release-validation'), /public\/version\.json/);
assert.match(stepsText('tag-release-validation'), /public\/release-notes\.json/);
assert.match(stepsText('tag-build-desktop'), /npm run dist:win/);
assert.match(stepsText('tag-verify-desktop-assets'), /verify-desktop-release-assets\.mjs/);
assert.match(stepsText('tag-verify-desktop-assets'), /verify-desktop-updater-metadata\.mjs/);
assert.match(stepsText('tag-verify-desktop-assets'), /Installer SHA-512 matches latest\.yml/);

const publishSteps = stepsText('publish-desktop-release');
assert.match(publishSteps, /gh release create/);
for (const asset of ['MyDesck-PRO-Setup.exe', 'MyDesck-PRO-Setup.exe.blockmap', 'latest.yml']) {
  assert.match(publishSteps, new RegExp(asset.replaceAll('.', '\\.')));
}
assert.doesNotMatch(publishSteps, /--draft|--prerelease/);

const manualJob = jobs['manual-desktop-dry-run'];
assert.equal(manualJob.if, "github.event_name == 'workflow_dispatch'");
assert.match(stepsText('manual-desktop-dry-run'), /npm run dist:win/);

console.log('[test-tag-release-workflow] Tag validation, build, verification, and publication graph PASSED.');
