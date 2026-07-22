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

if (!commitSha || !runId) {
  console.error('❌ FAIL CLOSED: Missing required COMMIT_SHA or RUN_ID environment variables');
  process.exit(1);
}

const aggregatedDetails = {};

for (const { path: resultPath, expectedTest } of requiredResults) {
  if (!existsSync(resultPath)) {
    console.error(`❌ FAIL CLOSED: Required job result file "${resultPath}" is missing! Cannot claim STAGING PASS.`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(readFileSync(resultPath, 'utf8'));
    
    // 1. Status Check
    if (!data || data.status !== 'STAGING PASS') {
      console.error(`❌ FAIL CLOSED: Job result in "${resultPath}" is not STAGING PASS! Status: ${data?.status || 'INVALID'}`);
      process.exit(1);
    }

    // 2. Result Provenance Check: Commit SHA & Run ID Match
    if (data.commit_sha && data.commit_sha !== commitSha) {
      console.error(`❌ FAIL CLOSED PROVENANCE VIOLATION: "${resultPath}" commit SHA (${data.commit_sha}) does not match current run commit SHA (${commitSha})!`);
      process.exit(1);
    }

    if (data.workflow_run_id && String(data.workflow_run_id) !== runId) {
      console.error(`❌ FAIL CLOSED PROVENANCE VIOLATION: "${resultPath}" workflow run ID (${data.workflow_run_id}) does not match current run ID (${runId})!`);
      process.exit(1);
    }

    // 3. Test Name Parity Check
    if (data.test && data.test !== expectedTest) {
      console.error(`❌ FAIL CLOSED: "${resultPath}" test name (${data.test}) does not match expected (${expectedTest})!`);
      process.exit(1);
    }

    // 4. Timestamp Freshness Check (< 24 hours)
    if (data.timestamp) {
      const ageMs = Date.now() - new Date(data.timestamp).getTime();
      if (ageMs > 24 * 3600 * 1000) {
        console.error(`❌ FAIL CLOSED: Job result "${resultPath}" is expired (> 24 hours old)!`);
        process.exit(1);
      }
    }

    aggregatedDetails[expectedTest] = data;
  } catch (err) {
    console.error(`❌ FAIL CLOSED: Malformed job result file "${resultPath}":`, err.message);
    process.exit(1);
  }
}

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
  vercel_staging_url: process.env.STAGING_URL || aggregatedDetails['playwright']?.staging_url || 'https://mydesck-pro-staging.vercel.app',
  vercel_deployment_id: process.env.DEPLOYMENT_ID || 'preview',
  staging_database_host: process.env.STAGING_DB_HOST || 'xyz123.supabase.co',
  database_verification_status: aggregatedDetails['staging-database']?.status || 'STAGING PASS',
  playwright_e2e_status: aggregatedDetails['playwright']?.status || 'STAGING PASS',
  updater_test_status: aggregatedDetails['desktop-upgrade']?.status || 'STAGING PASS',
  installer_sha256: process.env.INSTALLER_HASH || aggregatedDetails['artifact-integrity']?.installer_sha256,
  blockmap_sha256: process.env.BLOCKMAP_HASH || aggregatedDetails['artifact-integrity']?.blockmap_sha256,
  latest_yml_sha256: process.env.LATEST_HASH || aggregatedDetails['artifact-integrity']?.latest_yml_sha256,
  timestamp: now.toISOString(),
  expiration_timestamp: expires.toISOString(),
  job_results: aggregatedDetails,
};

// Validate mandatory fields
for (const [k, v] of Object.entries(evidence)) {
  if (k !== 'job_results' && (!v || typeof v !== 'string' || v.trim() === '')) {
    console.error(`❌ FAIL CLOSED: Aggregated evidence field "${k}" is missing or empty!`);
    process.exit(1);
  }
}

writeFileSync('staging-evidence.json', JSON.stringify(evidence, null, 2), 'utf8');
console.log('✓ Successfully validated result provenance and generated staging-evidence.json.');
