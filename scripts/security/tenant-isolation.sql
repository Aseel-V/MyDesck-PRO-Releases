BEGIN;
INSERT INTO auth.users (id, email) VALUES
 ('10000000-0000-4000-8000-000000000001', 'security-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002', 'security-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000003', 'security-admin@example.invalid');
INSERT INTO public.user_profiles(user_id, role) VALUES
 ('10000000-0000-4000-8000-000000000001','user'),
 ('10000000-0000-4000-8000-000000000002','user'),
 ('10000000-0000-4000-8000-000000000003','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.user_profiles WHERE user_id=auth.uid();
 IF n <> 1 THEN RAISE EXCEPTION 'Own profile must be readable'; END IF;
 SELECT count(*) INTO n FROM public.user_profiles WHERE user_id='10000000-0000-4000-8000-000000000002';
 IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant profile SELECT'; END IF;
 BEGIN
   UPDATE public.user_profiles SET role='admin' WHERE user_id=auth.uid();
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id=auth.uid() AND role='admin') THEN
   RAISE EXCEPTION 'Self-promotion succeeded';
 END IF;
 UPDATE public.user_profiles SET full_name='attacker' WHERE user_id='10000000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant profile UPDATE'; END IF;
 DELETE FROM public.user_profiles WHERE user_id='10000000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant profile DELETE'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.user_profiles WHERE user_id='10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
  INSERT INTO public.user_profiles(user_id,role) VALUES (auth.uid(),'admin');
 EXCEPTION WHEN insufficient_privilege THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'INSERT self-promotion succeeded'; END IF;
 INSERT INTO public.user_profiles(user_id,role) VALUES (auth.uid(),'user');
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
DO $$ BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform admin not recognized'; END IF;
 IF (SELECT count(*) FROM public.user_profiles WHERE user_id IN ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) <> 2 THEN
  RAISE EXCEPTION 'Admin profile read regressed';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'SECURITY_ASSERTIONS_COMPLETED';
