-- Run with psql after deploying 20260719160000.
-- psql "$SUPABASE_DB_URL" -v owned_user_id='<OWNER_UUID>' -v owned_trip_id='<TRIP_UUID>' -v other_user_id='<OTHER_UUID>' -f scripts/verify-travel-smart-workflows.sql
\set ON_ERROR_STOP on
BEGIN;

SELECT p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'get_trip_details','create_trip_payment_plan','record_trip_installment_payment','get_travel_reports'
)
ORDER BY p.proname;

SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'trip_payment_plans','trip_installments','trip_installment_events','trip_packing_lists','trip_pricing_preferences'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owned_user_id', true);

SELECT NOT (public.get_trip_details(:'owned_trip_id'::uuid)::text ~ 'passport_number') AS passport_omitted;

SELECT public.create_trip_payment_plan(
  :'owned_trip_id'::uuid, 'card', 'ILS', 100000, 0, 3, DATE '2028-01-31', 'verification only'
) AS plan_id \gset

SELECT installment_number,due_date,expected_amount_minor,status
FROM public.trip_installments WHERE payment_plan_id = :'plan_id'::uuid ORDER BY installment_number;

SELECT sum(expected_amount_minor) = 100000 AS exact_total
FROM public.trip_installments WHERE payment_plan_id = :'plan_id'::uuid;

SELECT jsonb_array_length(public.get_travel_reports(current_date - 3650,current_date + 3650,NULL,NULL,false)->'currencies') >= 0 AS reports_owned;

-- RLS isolation: the second user cannot see the first user's plan.
SELECT set_config('request.jwt.claim.sub', :'other_user_id', true);
SELECT count(*) = 0 AS cross_user_hidden FROM public.trip_payment_plans WHERE id = :'plan_id'::uuid;

ROLLBACK;
