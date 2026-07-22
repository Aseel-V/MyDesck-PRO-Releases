import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

console.log('[verify-staging-database] Verifying live Supabase Staging database contracts...');

// HARD SAFETY ENFORCEMENT: Require explicit APP_ENV=staging
if (process.env.APP_ENV !== 'staging') {
  console.error('❌ FATAL: verify-staging-database.mjs requires explicit APP_ENV=staging environment marker.');
  process.exit(1);
}

const stagingUrl = process.env.STAGING_SUPABASE_URL;
const dbUrl = process.env.STAGING_DATABASE_URL;
const stagingKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_ANON_KEY;

const PRODUCTION_PROJECT_REF = 'pubugnfaqqukelvgckdr';

// Validate target hostname / project reference safety
if (stagingUrl) {
  try {
    const parsed = new URL(stagingUrl);
    if (parsed.hostname.includes(PRODUCTION_PROJECT_REF)) {
      console.error(`❌ FATAL SECURITY VIOLATION: Staging database verifier target matches production project reference (${PRODUCTION_PROJECT_REF})! Operation aborted.`);
      process.exit(1);
    }
    console.log(`[verify-staging-database] Target Staging Host: ${parsed.hostname}`);
  } catch (e) {
    console.error('❌ Invalid STAGING_SUPABASE_URL value.');
    process.exit(1);
  }
}

if (!stagingUrl || !stagingKey) {
  console.error('❌ FAIL CLOSED: Missing STAGING_SUPABASE_URL or STAGING_SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

// Live Supabase Staging Contract Checks
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(stagingUrl, stagingKey);

// 1. Live RPC Resolution Test
console.log('Testing live save_trip_transaction RPC resolution on Supabase Staging...');
const requestId = '99998888-7777-6666-5555-444433332222';
const sampleTripData = {
  destination: 'Staging Test City',
  client_name: 'Staging Verification User',
  client_phone: '0500000000',
  travelers: [],
  travelers_count: 1,
  start_date: '2026-12-01',
  end_date: '2026-12-05',
  currency: 'EUR',
  sale_price: 1000,
  wholesale_cost: 800,
  amount_paid: 1000,
  payment_method: 'cash',
  status: 'active',
};

const rpcRes = await supabase.rpc('save_trip_transaction', {
  p_trip_data: sampleTripData,
  p_payment_plan: null,
  p_client_request_id: requestId,
});

if (rpcRes.error) {
  console.error('❌ Staging RPC call failed:', rpcRes.error);
  process.exit(1);
}

console.log('✓ Staging RPC resolved successfully. Trip ID:', rpcRes.data?.id);

// 2. Transaction Rollback Verification (Deliberate failure test)
console.log('Testing transaction rollback on invalid payment plan...');
const invalidPlanCall = await supabase.rpc('save_trip_transaction', {
  p_trip_data: { ...sampleTripData, destination: 'Rollback Test' },
  p_payment_plan: { method: 'INVALID_METHOD_NAME', installmentCount: -1 },
  p_client_request_id: '88887777-6666-5555-4444-333322221111',
});

assert.ok(invalidPlanCall.error, 'Invalid payment plan RPC call must fail');

// Confirm no partial trip was saved
const checkTrip = await supabase.from('trips').select('id').eq('destination', 'Rollback Test');
assert.equal(checkTrip.data?.length || 0, 0, 'No partial trip must remain after failed transaction');
console.log('✓ Transaction rollback verified: No partial trip saved on failure');

mkdirSync('results', { recursive: true });
const result = {
  test: 'staging-database',
  status: 'STAGING PASS',
  timestamp: new Date().toISOString(),
  details: 'Live RPC resolution, parameters, and transaction rollback verified on Supabase Staging.'
};
writeFileSync('results/staging-database-result.json', JSON.stringify(result, null, 2), 'utf8');

console.log('✓ Live Supabase Staging Database Contract Verification PASSED.');
