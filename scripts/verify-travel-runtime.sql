-- Run with psql after replacing both UUIDs. Every data change is rolled back.
-- psql "$SUPABASE_DB_URL" -v owner_user_id='<AUTH_USER_UUID>' -v trip_id='<OWNED_TRIP_UUID>' -f scripts/verify-travel-runtime.sql
\set ON_ERROR_STOP on

SELECT
  p.oid::regprocedure AS signature,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_trip_details';

SELECT
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'trips'
ORDER BY trigger_name, event_manipulation;

SELECT
  e.extname,
  n.nspname AS extension_schema,
  to_regprocedure(format('%I.pgp_sym_encrypt(text,text,text)', n.nspname)) AS encrypt_signature,
  to_regprocedure(format('%I.pgp_sym_decrypt(bytea,text)', n.nspname)) AS decrypt_signature
FROM pg_extension AS e
JOIN pg_namespace AS n ON n.oid = e.extnamespace
WHERE e.extname = 'pgcrypto';

BEGIN;
SELECT set_config('request.jwt.claim.sub', :'owner_user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT public.get_trip_details(:'trip_id'::uuid) IS NOT NULL AS owned_detail_found;

-- Assigning travelers to itself deliberately exercises encrypt_trip_travelers_trigger.
-- ON_ERROR_STOP makes an unresolved function (42883) fail this script immediately.
UPDATE public.trips
SET travelers = travelers,
    updated_at = clock_timestamp()
WHERE id = :'trip_id'::uuid
  AND user_id = :'owner_user_id'::uuid
RETURNING id, updated_at;

ROLLBACK;
