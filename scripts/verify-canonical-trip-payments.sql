BEGIN;

DO $$
DECLARE
  v_contract_version integer;
BEGIN
  IF pg_catalog.to_regprocedure('public.get_travel_payment_contract_version()') IS NULL THEN
    RAISE EXCEPTION
      'CANONICAL_PAYMENT_VERIFICATION_BLOCKED: apply migrations 20260729110000 through 20260729130000 to this local/test database first';
  END IF;

  SELECT public.get_travel_payment_contract_version()
    INTO v_contract_version;

  IF v_contract_version < 3 OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.trip_payment_plans'::pg_catalog.regclass
       AND tgname = 'enforce_cash_payment_plan_row_trigger'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'CANONICAL_PAYMENT_VERIFICATION_BLOCKED: migrations through 20260729130000 are not active on this local/test database';
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid := '8a540b9c-a535-4df9-a108-c54b121f7c2f';
  v_cash_trip uuid;
  v_card_trip uuid;
  v_compat_trip uuid;
  v_mixed_trip uuid;
  v_installment uuid;
  v_summary jsonb;
  v_payload jsonb;
  v_item jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_user_id, 'authenticated', 'authenticated', 'canonical-payment-test@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Cash test','destination','Local','start_date','2026-01-01','end_date','2026-01-01',
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',5000,'payment_date','2026-01-01',
    'payment_method','cash','payment_status','paid','service_type','both'
  ), jsonb_build_object('method','cash','currency','ILS','cardTotalMinor',0,'cashTotalMinor',500000,
    'confirmedCashMinor',500000,'installmentCount',0,'firstDate','2026-01-01'), gen_random_uuid())->>'id')::uuid INTO v_cash_trip;
  v_summary := public.get_owned_trip_payment_summary(v_cash_trip);
  IF v_summary->>'payment_source' <> 'native' OR (v_summary->>'confirmed_total_minor')::bigint <> 500000
    OR (v_summary->>'total_unpaid_minor')::bigint <> 0 THEN RAISE EXCEPTION 'CASH_INSERT_RELOAD_FAILED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trip_payment_plans
    WHERE trip_id = v_cash_trip AND payment_method = 'cash' AND card_total_minor = 0
      AND cash_total_minor = 500000 AND card_paid_minor = 0 AND cash_paid_minor = 500000
      AND installment_count = 0 AND first_installment_date IS NULL
  ) OR EXISTS (SELECT 1 FROM public.trip_installments WHERE trip_id = v_cash_trip)
    THEN RAISE EXCEPTION 'CASH_PLAN_STORAGE_FAILED'; END IF;

  PERFORM public.save_trip_transaction(jsonb_build_object('id',v_cash_trip,'client_name','Cash test edited','destination','Local',
    'start_date','2026-01-01','end_date','2026-01-01','currency','ILS','sale_price',5000,'wholesale_cost',4000,
    'amount_paid',2500,'payment_date','2026-01-02','payment_method','cash','payment_status','partial','service_type','both'),
    jsonb_build_object('method','cash','currency','ILS','cardTotalMinor',0,'cashTotalMinor',500000,
    'confirmedCashMinor',250000,'installmentCount',0,'firstDate','2026-01-02'), gen_random_uuid());
  v_summary := public.get_owned_trip_payment_summary(v_cash_trip);
  IF (v_summary->>'confirmed_total_minor')::bigint <> 250000 OR (v_summary->>'total_unpaid_minor')::bigint <> 250000
    OR (SELECT payment_date FROM public.trips WHERE id = v_cash_trip) <> date '2026-01-02' THEN RAISE EXCEPTION 'CASH_UPDATE_RELOAD_FAILED'; END IF;

  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Compatibility test','destination','Local','start_date','2026-01-01','end_date','2026-01-02',
    'currency','ILS','sale_price',1000,'wholesale_cost',800,'amount_paid',0,'payment_date','2026-01-01',
    'payment_method','card','payment_status','unpaid','service_type','both'
  ), jsonb_build_object('method','card','currency','ILS','cardTotalMinor',100000,'cashTotalMinor',0,
    'confirmedCashMinor',0,'installmentCount',2,'firstDate','2026-01-01'), gen_random_uuid())->>'id')::uuid INTO v_compat_trip;
  UPDATE public.trip_payment_plans SET card_paid_minor = 50000 WHERE trip_id = v_compat_trip;
  PERFORM public.save_trip_transaction(jsonb_build_object('id',v_compat_trip,'client_name','Compatibility test','destination','Local',
    'start_date','2026-01-01','end_date','2026-01-02','currency','ILS','sale_price',1000,'wholesale_cost',800,
    'amount_paid',1000,'payment_date','2026-01-02','payment_method','cash','payment_status','paid','service_type','both'),
    jsonb_build_object('method','cash','currency','ILS','cardTotalMinor',0,'cashTotalMinor',100000,
    'confirmedCashMinor',100000,'installmentCount',0,'firstDate','2026-01-02'), gen_random_uuid());
  IF NOT EXISTS (
    SELECT 1 FROM public.trip_payment_plans
    WHERE trip_id = v_compat_trip AND payment_method = 'cash' AND card_total_minor = 0
      AND card_paid_minor = 0 AND cash_total_minor = 100000 AND cash_paid_minor = 100000
      AND installment_count = 0 AND first_installment_date IS NULL
  ) THEN RAISE EXCEPTION 'CASH_COMPATIBILITY_UPDATE_FAILED'; END IF;

  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Card test','destination','Local','start_date','2026-01-01','end_date','2026-01-02',
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',0,'payment_date','2026-01-01',
    'payment_method','card','payment_status','unpaid','service_type','both'
  ), jsonb_build_object('method','card','currency','ILS','cardTotalMinor',500000,'cashTotalMinor',0,
    'confirmedCashMinor',0,'installmentCount',5,'firstDate','2026-01-01'), gen_random_uuid())->>'id')::uuid INTO v_card_trip;
  SELECT id INTO v_installment FROM public.trip_installments WHERE trip_id = v_card_trip ORDER BY installment_number LIMIT 1;
  PERFORM public.record_trip_installment_payment(v_installment, 100000, '2026-01-01T12:00:00Z'::timestamptz, 'local test');
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'visa_confirmed_minor')::bigint <> 100000 OR (v_summary->>'confirmed_total_minor')::bigint <> 100000
    OR (v_summary->>'total_unpaid_minor')::bigint <> 400000 OR (v_summary->>'confirmed_installments')::integer <> 1
    OR (v_summary->>'partial_installments')::integer <> 0 THEN RAISE EXCEPTION 'CARD_RECEIPT_RELOAD_FAILED'; END IF;
  IF (SELECT count(*) FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed') <> 1
    THEN RAISE EXCEPTION 'VISA_NOTIFICATION_CREATE_FAILED'; END IF;
  PERFORM public.record_trip_installment_payment(v_installment, 100000, '2026-01-01T12:00:00Z'::timestamptz, 'idempotent retry');
  IF (SELECT count(*) FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed') <> 1
    THEN RAISE EXCEPTION 'VISA_NOTIFICATION_DUPLICATED'; END IF;
  UPDATE public.trip_notifications SET read_at = now()
  WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed' AND user_id = v_user_id;
  IF EXISTS (SELECT 1 FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed' AND read_at IS NULL)
    THEN RAISE EXCEPTION 'VISA_NOTIFICATION_SEEN_STATE_FAILED'; END IF;

  SELECT id INTO v_installment FROM public.trip_installments WHERE trip_id = v_card_trip ORDER BY installment_number OFFSET 1 LIMIT 1;
  PERFORM public.record_trip_installment_payment(v_installment, 50000, '2026-02-01T12:00:00Z'::timestamptz, 'partial local test');
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'visa_confirmed_minor')::bigint <> 150000 OR (v_summary->>'confirmed_installments')::integer <> 1
    OR (v_summary->>'partial_installments')::integer <> 1
    OR (SELECT count(*) FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed') <> 2
    THEN RAISE EXCEPTION 'PARTIAL_VISA_RECEIPT_FAILED'; END IF;
  PERFORM public.record_trip_installment_payment(v_installment, 100000, '2026-02-02T12:00:00Z'::timestamptz, 'partial completion');
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'visa_confirmed_minor')::bigint <> 200000 OR (v_summary->>'confirmed_installments')::integer <> 2
    OR (v_summary->>'partial_installments')::integer <> 0
    OR (SELECT count(*) FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed') <> 3
    THEN RAISE EXCEPTION 'SECOND_VISA_RECEIPT_EVENT_FAILED'; END IF;
  PERFORM public.record_trip_installment_payment(v_installment, 50000, '2026-02-01T12:00:00Z'::timestamptz, 'downward correction');
  IF (SELECT count(*) FROM public.trip_notifications WHERE trip_id = v_card_trip AND notification_type = 'visa_payment_confirmed') <> 3
    THEN RAISE EXCEPTION 'DOWNWARD_CORRECTION_NOTIFICATION_FAILED'; END IF;

  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Mixed test','destination','Local','start_date','2026-01-01','end_date','2026-01-02',
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',3000,'payment_date','2026-01-01',
    'payment_method','mixed','payment_status','partial','service_type','both','cash_paid_amount',3000,'card_paid_amount',0
  ), jsonb_build_object('method','mixed','currency','ILS','cardTotalMinor',200000,'cashTotalMinor',300000,
    'confirmedCashMinor',300000,'installmentCount',2,'firstDate','2026-01-01'), gen_random_uuid())->>'id')::uuid INTO v_mixed_trip;
  v_summary := public.get_owned_trip_payment_summary(v_mixed_trip);
  IF (v_summary->>'cash_confirmed_minor')::bigint <> 300000 OR (v_summary->>'visa_confirmed_minor')::bigint <> 0
    OR (v_summary->>'confirmed_total_minor')::bigint <> 300000 OR (v_summary->>'total_unpaid_minor')::bigint <> 200000
    THEN RAISE EXCEPTION 'MIXED_RELOAD_FAILED'; END IF;

  v_payload := public.get_trip_details(v_mixed_trip);
  IF (v_payload->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 300000
    OR (v_payload->'payment_plan_summary'->>'total_unpaid_minor')::bigint <> 200000
    THEN RAISE EXCEPTION 'DETAILS_RECONCILIATION_FAILED'; END IF;

  v_payload := public.get_trips_page('2026', 1, 100, 'Mixed test', NULL, NULL, NULL, NULL, 'updated_desc');
  SELECT value INTO v_item FROM jsonb_array_elements(v_payload->'items') WHERE value->>'id' = v_mixed_trip::text;
  IF v_item IS NULL OR (v_item->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 300000
    OR (v_item->'payment_plan_summary'->>'total_unpaid_minor')::bigint <> 200000
    THEN RAISE EXCEPTION 'LIST_RECONCILIATION_FAILED'; END IF;

  v_payload := public.get_trip_dashboard_items('2026');
  SELECT value INTO v_item FROM jsonb_array_elements(v_payload) WHERE value->>'id' = v_mixed_trip::text;
  IF v_item IS NULL OR (v_item->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 300000
    OR (v_item->'payment_plan_summary'->>'total_unpaid_minor')::bigint <> 200000
    THEN RAISE EXCEPTION 'DASHBOARD_RECONCILIATION_FAILED'; END IF;

  v_payload := public.get_travel_payment_analytics('2026', NULL, NULL, NULL, NULL, NULL, NULL);
  IF v_payload->>'currency_mode' <> 'single'
    OR (v_payload->'summary'->>'confirmed_total')::numeric <> 8000
    OR (v_payload->'summary'->>'total_unpaid')::numeric <> 8000
    THEN RAISE EXCEPTION 'ANALYTICS_RECONCILIATION_FAILED'; END IF;

  v_payload := public.get_travel_reports('2026-01-01', '2026-12-31', 'ILS', NULL, false);
  SELECT value INTO v_item FROM jsonb_array_elements(v_payload->'unpaid') WHERE value->>'id' = v_mixed_trip::text;
  IF v_item IS NULL OR (v_item->>'confirmed_received')::numeric <> 3000 OR (v_item->>'total_unpaid')::numeric <> 2000
    THEN RAISE EXCEPTION 'REPORT_RECONCILIATION_FAILED'; END IF;

  IF EXISTS (SELECT 1 FROM public.trips WHERE id IN (v_cash_trip,v_card_trip,v_mixed_trip,v_compat_trip) AND user_id <> v_user_id)
    THEN RAISE EXCEPTION 'TENANT_OWNERSHIP_FAILED'; END IF;
END;
$$;

ROLLBACK;
