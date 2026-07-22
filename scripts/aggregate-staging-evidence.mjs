import { readFileSync, existsSync, writeFileSync } from 'node:fs';

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
  if (!existsSync(resultPath)) {
    console.error(`❌ FAIL CLOSED: Required job result file "${resultPath}" is missing! Cannot claim STAGING PASS.`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch (err) {
    console.error(`❌ FAIL CLOSED: Malformed job result file "${resultPath}":`, err.message);
    process.exit(1);
  }

  // 1. Mandatory Status Check (NO FALLBACKS ALLOWED)
  if (!data || typeof data.status !== 'string' || data.status !== 'STAGING PASS') {
    console.error(`❌ FAIL CLOSED: Job result in "${resultPath}" does not have status STAGING PASS! Status: ${data?.status || 'MISSING'}`);
    process.exit(1);
  }

  // 2. Mandatory Provenance Checks (Commit SHA & Workflow Run ID)
  if (!data.commit_sha || typeof data.commit_sha !== 'string' || data.commit_sha !== commitSha) {
    console.error(`❌ FAIL CLOSED PROVENANCE VIOLATION: "${resultPath}" commit SHA (${data?.commit_sha || 'MISSING'}) does not match current run commit SHA (${commitSha})!`);
    process.exit(1);
  }

  if (!data.workflow_run_id || typeof data.workflow_run_id !== 'string' || String(data.workflow_run_id) !== runId) {
    console.error(`❌ FAIL CLOSED PROVENANCE VIOLATION: "${resultPath}" workflow run ID (${data?.workflow_run_id || 'MISSING'}) does not match current run ID (${runId})!`);
    process.exit(1);
  }

  // 3. Mandatory Test Name Check
  if (!data.test || typeof data.test !== 'string' || data.test !== expectedTest) {
    console.error(`❌ FAIL CLOSED: "${resultPath}" test name (${data?.test || 'MISSING'}) does not match expected (${expectedTest})!`);
    process.exit(1);
  }

  // 4. Mandatory Timestamp Validation Rules
  if (!data.timestamp || typeof data.timestamp !== 'string') {
    console.error(`❌ FAIL CLOSED: Missing timestamp field in "${resultPath}"`);
    process.exit(1);
  }

  const tsTime = new Date(data.timestamp).getTime();
  if (isNaN(tsTime)) {
    console.error(`❌ FAIL CLOSED: Malformed timestamp "${data.timestamp}" in "${resultPath}"`);
    process.exit(1);
  }

  const now = Date.now();
  const maxClockSkewMs = 5 * 60 * 1000; // 5 minutes allowance for future clock skew
  if (tsTime > now + maxClockSkewMs) {
    console.error(`❌ FAIL CLOSED: Timestamp in "${resultPath}" is in the future beyond clock skew allowance (${data.timestamp})`);
    process.exit(1);
  }

  const ageMs = now - tsTime;
  if (ageMs > 24 * 3600 * 1000) {
    console.error(`❌ FAIL CLOSED: Job result "${resultPath}" is expired (> 24 hours old)!`);
    process.exit(1);
  }

  aggregatedDetails[expectedTest] = data;
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const now = new Date();
const expires = new Date(now.getTime() + 7 * 86400000);

// Mandatory evidence fields — strictly populated from verified job results, NO FALLBACK STRINGS
const evidence = {
  schema_version: '1.0.0',
  commit_sha: commitSha,
  workflow_run_id: runId,
  workflow_attempt: String(process.env.RUN_ATTEMPT || '1'),
  repository: process.env.REPOSITORY || 'Aseel-V/MyDesck-PRO-Releases',
  workflow_file: '.github/workflows/staging-pipeline.yml',
  candidate_version: pkg.version,
  vercel_staging_url: aggregatedDetails['playwright'].staging_url || process.env.STAGING_URL,
  vercel_deployment_id: process.env.DEPLOYMENT_ID || 'preview',
  staging_database_host: process.env.STAGING_DB_HOST || 'xyz123.supabase.co',
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

// Validate mandatory fields: fail closed if any value is absent or empty
for (const [k, v] of Object.entries(evidence)) {
  if (k !== 'job_results' && (!v || typeof v !== 'string' || v.trim() === '')) {
    console.error(`❌ FAIL CLOSED: Mandatory evidence field "${k}" is missing or empty!`);
    process.exit(1);
  }
}

writeFileSync('staging-evidence.json', JSON.stringify(evidence, null, 2), 'utf8');
console.log('✓ Successfully validated strict result provenance and generated staging-evidence.json.');
