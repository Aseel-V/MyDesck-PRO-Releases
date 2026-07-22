import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { validateResultFile } from './validate-result-schema.mjs';

console.log('[aggregate-staging-evidence] Aggregating machine-readable job outputs for Staging Evidence...');

const requiredResults = [
  { path: 'results/staging-database-result.json', expectedTest: 'staging-database' },
  { path: 'results/playwright-result.json', expectedTest: 'playwright' },
  { path: 'results/updater-metadata-result.json', expectedTest: 'desktop-updater-metadata' },
  { path: 'results/desktop-upgrade-result.json', expectedTest: 'desktop-upgrade' },
  { path: 'results/artifact-integrity-result.json', expectedTest: 'artifact-integrity' },
];

const commitSha = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
const runId = String(process.env.RUN_ID || process.env.GITHUB_RUN_ID || '');

if (!commitSha || typeof commitSha !== 'string' || commitSha.trim() === '') {
  console.error('❌ FAIL CLOSED: Missing required COMMIT_SHA environment variable');
  process.exit(1);
}

if (!runId || typeof runId !== 'string' || runId.trim() === '') {
  console.error('❌ FAIL CLOSED: Missing required RUN_ID environment variable');
  process.exit(1);
}

const aggregatedDetails = {};

for (const { path: resultPath, expectedTest } of requiredResults) {
  // Use shared result schema validator
  validateResultFile(resultPath, expectedTest, commitSha, runId);
  const data = JSON.parse(readFileSync(resultPath, 'utf8'));
  aggregatedDetails[expectedTest] = data;
}

// STRICT IDENTIFIERS: Zero placeholder defaults allowed!
const vercelStagingUrl = aggregatedDetails['playwright'].staging_url || process.env.STAGING_URL;
const vercelDeploymentId = process.env.DEPLOYMENT_ID || aggregatedDetails['playwright'].deployment_id;
const stagingDbHost = process.env.STAGING_DB_HOST || aggregatedDetails['staging-database'].db_host;

// Reject known placeholder string patterns
const forbiddenPlaceholders = ['preview', 'xyz123.supabase.co', 'https://mydesck-pro-staging.vercel.app', 'unbound', 'unknown'];

function assertRealIdentifier(name, val) {
  if (!val || typeof val !== 'string' || val.trim() === '') {
    console.error(`❌ FAIL CLOSED: Required identifier "${name}" is missing or empty!`);
    process.exit(1);
  }
  if (forbiddenPlaceholders.includes(val.toLowerCase().trim())) {
    console.error(`❌ FAIL CLOSED: Required identifier "${name}" contains forbidden placeholder string "${val}"! Real value required.`);
    process.exit(1);
  }
}

assertRealIdentifier('vercel_staging_url', vercelStagingUrl);
assertRealIdentifier('vercel_deployment_id', vercelDeploymentId);
assertRealIdentifier('staging_database_host', stagingDbHost);
assertRealIdentifier('installer_sha256', aggregatedDetails['artifact-integrity'].installer_sha256);
assertRealIdentifier('blockmap_sha256', aggregatedDetails['artifact-integrity'].blockmap_sha256);
assertRealIdentifier('latest_yml_sha256', aggregatedDetails['artifact-integrity'].latest_yml_sha256);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const now = new Date();
const expires = new Date(now.getTime() + 7 * 86400000);

const evidence = {
  schema_version: '1.0.0',
  commit_sha: commitSha,
  workflow_run_id: runId,
  workflow_attempt: String(process.env.RUN_ATTEMPT || '1'),
  repository: process.env.REPOSITORY || 'Aseel-V/MyDesck-PRO-Releases',
  workflow_file: '.github/workflows/staging-pipeline.yml',
  candidate_version: pkg.version,
  vercel_staging_url: vercelStagingUrl,
  vercel_deployment_id: vercelDeploymentId,
  staging_database_host: stagingDbHost,
  database_verification_status: aggregatedDetails['staging-database'].status,
  playwright_e2e_status: aggregatedDetails['playwright'].status,
  updater_test_status: aggregatedDetails['desktop-upgrade'].status,
  installer_sha256: aggregatedDetails['artifact-integrity'].installer_sha256,
  blockmap_sha256: aggregatedDetails['artifact-integrity'].blockmap_sha256,
  latest_yml_sha256: aggregatedDetails['artifact-integrity'].latest_yml_sha256,
  timestamp: now.toISOString(),
  expiration_timestamp: expires.toISOString(),
  job_results: aggregatedDetails,
};

writeFileSync('staging-evidence.json', JSON.stringify(evidence, null, 2), 'utf8');
console.log('✓ Successfully validated real identifiers with shared result schema and generated staging-evidence.json.');
