BEGIN;

DO $$
DECLARE
  v_user_id uuid := '8a540b9c-a535-4df9-a108-c54b121f7c2f';
  v_today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_cash_trip uuid;
  v_card_trip uuid;
  v_mixed_trip uuid;
  v_installment uuid;
  v_summary jsonb;
  v_payload jsonb;
  v_item jsonb;
  v_created integer;
BEGIN
  IF public.get_travel_payment_contract_version() < 4 THEN
    RAISE EXCEPTION 'AUTOMATIC_VISA_CONTRACT_V4_REQUIRED';
  END IF;

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_user_id, 'authenticated', 'authenticated', 'visa-date-test@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- Cash stays receipt-based and never advances from a date.
  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Cash date test','destination','Local','start_date',v_today+30,'end_date',v_today+31,
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',3000,'payment_date',v_today,
    'payment_method','cash','payment_status','partial','service_type','both'
  ), jsonb_build_object('method','cash','currency','ILS','cardTotalMinor',0,'cashTotalMinor',500000,
    'confirmedCashMinor',300000,'installmentCount',0,'firstDate',v_today), gen_random_uuid())->>'id')::uuid INTO v_cash_trip;
  v_summary := public.get_owned_trip_payment_summary(v_cash_trip);
  IF (v_summary->>'cash_confirmed_minor')::bigint <> 300000
    OR (v_summary->>'confirmed_total_minor')::bigint <> 300000
    OR (v_summary->>'total_unpaid_minor')::bigint <> 200000
  THEN RAISE EXCEPTION 'CASH_SEMANTICS_CHANGED'; END IF;

  -- Visa: 0/5 before first date, 1/5 on first date, and 5/5 after all dates.
  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Visa date test','destination','Local','start_date',v_today+30,'end_date',v_today+31,
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',0,'payment_date',v_today,
    'payment_method','card','payment_status','unpaid','service_type','both'
  ), jsonb_build_object('method','card','currency','ILS','cardTotalMinor',500000,'cashTotalMinor',0,
    'confirmedCashMinor',0,'installmentCount',5,'firstDate',v_today+1), gen_random_uuid())->>'id')::uuid INTO v_card_trip;
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'effective_visa_paid_minor')::bigint <> 0
    OR (v_summary->>'effective_paid_installment_count')::integer <> 0
  THEN RAISE EXCEPTION 'VISA_BEFORE_FIRST_DATE_FAILED'; END IF;

  SELECT id INTO v_installment FROM public.trip_installments
  WHERE trip_id=v_card_trip ORDER BY installment_number LIMIT 1;
  UPDATE public.trip_installments SET due_date=v_today WHERE id=v_installment;
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'effective_visa_paid_minor')::bigint <> 100000
    OR (v_summary->>'effective_paid_installment_count')::integer <> 1
    OR (v_summary->>'visa_future_scheduled_minor')::bigint <> 400000
  THEN RAISE EXCEPTION 'VISA_FIRST_DATE_FAILED'; END IF;

  -- Manual receipt audit fields never double-count the elapsed installment.
  PERFORM public.record_trip_installment_payment(v_installment, 50000, now(), 'audit only');
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'effective_visa_paid_minor')::bigint <> 100000
    OR (v_summary->>'manual_visa_received_minor')::bigint <> 50000
  THEN RAISE EXCEPTION 'VISA_RECEIPT_AUDIT_DOUBLE_COUNTED'; END IF;

  UPDATE public.trip_installments SET due_date=v_today WHERE trip_id=v_card_trip AND status<>'cancelled';
  v_summary := public.get_owned_trip_payment_summary(v_card_trip);
  IF (v_summary->>'effective_visa_paid_minor')::bigint <> 500000
    OR (v_summary->>'effective_paid_installment_count')::integer <> 5
    OR (v_summary->>'total_unpaid_minor')::bigint <> 0
    OR v_summary->>'derived_payment_status' <> 'paid'
  THEN RAISE EXCEPTION 'VISA_FINAL_DATE_FAILED'; END IF;

  -- Mixed: Cash 3,000 plus schedule-derived Visa 0 -> 1,000 -> 2,000.
  SELECT (public.save_trip_transaction(jsonb_build_object(
    'client_name','Mixed date test','destination','Local','start_date',v_today+30,'end_date',v_today+31,
    'currency','ILS','sale_price',5000,'wholesale_cost',4000,'amount_paid',3000,'payment_date',v_today,
    'payment_method','mixed','payment_status','partial','service_type','both','cash_paid_amount',3000,'card_paid_amount',0
  ), jsonb_build_object('method','mixed','currency','ILS','cardTotalMinor',200000,'cashTotalMinor',300000,
    'confirmedCashMinor',300000,'installmentCount',2,'firstDate',v_today+1), gen_random_uuid())->>'id')::uuid INTO v_mixed_trip;
  v_summary := public.get_owned_trip_payment_summary(v_mixed_trip);
  IF (v_summary->>'confirmed_total_minor')::bigint <> 300000 OR (v_summary->>'total_unpaid_minor')::bigint <> 200000
  THEN RAISE EXCEPTION 'MIXED_BEFORE_DATE_FAILED'; END IF;

  SELECT id INTO v_installment FROM public.trip_installments
  WHERE trip_id=v_mixed_trip ORDER BY installment_number LIMIT 1;
  UPDATE public.trip_installments SET due_date=v_today WHERE id=v_installment;
  v_summary := public.get_owned_trip_payment_summary(v_mixed_trip);
  IF (v_summary->>'confirmed_total_minor')::bigint <> 400000 OR (v_summary->>'total_unpaid_minor')::bigint <> 100000
  THEN RAISE EXCEPTION 'MIXED_FIRST_DATE_FAILED'; END IF;

  UPDATE public.trip_installments SET due_date=v_today WHERE trip_id=v_mixed_trip AND status<>'cancelled';
  v_summary := public.get_owned_trip_payment_summary(v_mixed_trip);
  IF (v_summary->>'confirmed_total_minor')::bigint <> 500000 OR (v_summary->>'total_unpaid_minor')::bigint <> 0
  THEN RAISE EXCEPTION 'MIXED_FINAL_DATE_FAILED'; END IF;

  -- Rollout baseline suppresses already elapsed installments.
  DELETE FROM public.trip_notifications WHERE user_id=v_user_id AND notification_type='visa_schedule_collected';
  UPDATE public.travel_payment_feature_rollouts SET installed_at=now() WHERE feature_key='visa-date-collection-v1';
  v_created := public.materialize_due_visa_progress_events();
  IF v_created <> 0 THEN RAISE EXCEPTION 'HISTORICAL_ROLLOUT_FLOOD'; END IF;

  -- A post-baseline transition has one deterministic event across retries/restarts.
  UPDATE public.travel_payment_feature_rollouts SET installed_at=now()-interval '2 days' WHERE feature_key='visa-date-collection-v1';
  PERFORM public.materialize_due_visa_progress_events();
  PERFORM public.materialize_due_visa_progress_events();
  IF (SELECT count(*) FROM public.trip_notifications
      WHERE user_id=v_user_id AND notification_type='visa_schedule_collected'
        AND params->>'installmentId'=v_installment::text) <> 1
  THEN RAISE EXCEPTION 'VISA_EVENT_NOT_IDEMPOTENT'; END IF;

  -- Card/details/Dashboard/list/Analysis/reports share the same canonical summary.
  v_payload := public.get_trip_details(v_mixed_trip);
  IF (v_payload->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 500000 THEN RAISE EXCEPTION 'DETAILS_MISMATCH'; END IF;
  v_payload := public.get_trips_page(extract(year from v_today)::text,1,100,'Mixed date test',NULL,NULL,NULL,NULL,'updated_desc');
  SELECT value INTO v_item FROM jsonb_array_elements(v_payload->'items') WHERE value->>'id'=v_mixed_trip::text;
  IF (v_item->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 500000 THEN RAISE EXCEPTION 'CARD_LIST_MISMATCH'; END IF;
  v_payload := public.get_trip_dashboard_items(extract(year from v_today)::text);
  SELECT value INTO v_item FROM jsonb_array_elements(v_payload) WHERE value->>'id'=v_mixed_trip::text;
  IF (v_item->'payment_plan_summary'->>'confirmed_total_minor')::bigint <> 500000 THEN RAISE EXCEPTION 'DASHBOARD_MISMATCH'; END IF;
  v_payload := public.get_travel_payment_analytics(extract(year from v_today)::text,NULL,NULL,NULL,NULL,NULL,NULL);
  IF (v_payload->'summary'->>'confirmed_total')::numeric < 5000 THEN RAISE EXCEPTION 'ANALYTICS_MISMATCH'; END IF;
  v_payload := public.get_travel_reports(v_today-1,v_today+365,'ILS',NULL,false);
  IF (SELECT (value->>'paid')::numeric FROM jsonb_array_elements(v_payload->'currencies') WHERE value->>'currency'='ILS') < 5000
  THEN RAISE EXCEPTION 'REPORT_MISMATCH'; END IF;
END;
$$;

ROLLBACK;
