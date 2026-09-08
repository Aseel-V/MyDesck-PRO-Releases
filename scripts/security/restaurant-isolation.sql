BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('20000000-0000-4000-8000-000000000001','restaurant-a@example.invalid'),
 ('20000000-0000-4000-8000-000000000002','restaurant-b@example.invalid');
INSERT INTO public.restaurant_orders(id,business_id,status) VALUES
 ('21000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','draft'),
 ('21000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','draft');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE n integer; rejected boolean := false;
BEGIN
 IF (SELECT count(*) FROM public.restaurant_orders WHERE id='21000000-0000-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'Own order unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurant_orders WHERE id='21000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Cross-tenant order SELECT'; END IF;
 UPDATE public.restaurant_orders SET total_amount=100 WHERE id='21000000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant order UPDATE'; END IF;
 DELETE FROM public.restaurant_orders WHERE id='21000000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant draft DELETE'; END IF;
 BEGIN
 INSERT INTO public.restaurant_orders(business_id,status) VALUES ('20000000-0000-4000-8000-000000000002','draft');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-tenant order INSERT'; END IF;
 DELETE FROM public.restaurant_orders WHERE id='21000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Own draft DELETE regressed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'RESTAURANT_ASSERTIONS_COMPLETED';
