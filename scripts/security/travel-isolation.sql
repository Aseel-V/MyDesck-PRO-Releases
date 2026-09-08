BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('40000000-0000-4000-8000-000000000001','travel-a@example.invalid'),
 ('40000000-0000-4000-8000-000000000002','travel-b@example.invalid');
INSERT INTO public.trips(id,user_id,destination,client_name,start_date,end_date,sale_price) VALUES
 ('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Own trip','A',current_date,current_date+1,100),
 ('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','Private B','B',current_date,current_date+1,900);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE n integer; rejected boolean:=false; stats record;
BEGIN
 IF (SELECT count(*) FROM public.trips WHERE id='41000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Own trip unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.trips WHERE id='41000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Cross-tenant trip SELECT'; END IF;
 UPDATE public.trips SET client_name='attacker' WHERE id='41000000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant trip UPDATE'; END IF;
 BEGIN
  DELETE FROM public.trips WHERE id='41000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant trip DELETE'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
 INSERT INTO public.trips(user_id,destination,client_name,start_date,end_date) VALUES
 ('40000000-0000-4000-8000-000000000002','injected','attacker',current_date,current_date+1);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-tenant trip INSERT'; END IF;
 IF public.get_trip_details('41000000-0000-4000-8000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'Trip detail RPC leak'; END IF;
 IF public.get_trip_details('41000000-0000-4000-8000-000000000001') IS NULL THEN RAISE EXCEPTION 'Own trip RPC regressed'; END IF;
 SELECT * INTO stats FROM public.get_user_stats('40000000-0000-4000-8000-000000000002');
 IF stats.total_trips<>0 THEN RAISE EXCEPTION 'Legacy analytics RPC cross-tenant leak'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_monthly_stats('40000000-0000-4000-8000-000000000002')) OR
 EXISTS(SELECT 1 FROM public.get_yearly_stats('40000000-0000-4000-8000-000000000002')) OR
 EXISTS(SELECT 1 FROM public.get_top_destinations('40000000-0000-4000-8000-000000000002',5)) OR
 EXISTS(SELECT 1 FROM public.get_status_breakdown('40000000-0000-4000-8000-000000000002')) OR
 EXISTS(SELECT 1 FROM public.get_payment_status_breakdown('40000000-0000-4000-8000-000000000002')) THEN
  RAISE EXCEPTION 'Legacy analytics breakdown RPC leak';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'TRAVEL_ASSERTIONS_COMPLETED';
