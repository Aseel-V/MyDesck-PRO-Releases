BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('30000000-0000-4000-8000-000000000001','storage-a@example.invalid'),
 ('30000000-0000-4000-8000-000000000002','storage-b@example.invalid');
INSERT INTO storage.objects(bucket_id,name,owner) VALUES
 ('business-signatures','30000000-0000-4000-8000-000000000001/signature.png','30000000-0000-4000-8000-000000000001'),
 ('business-signatures','30000000-0000-4000-8000-000000000002/signature.png','30000000-0000-4000-8000-000000000002'),
 ('logos','business-signatures/sig-30000000-0000-4000-8000-000000000002-legacy.png','30000000-0000-4000-8000-000000000002');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id IN ('logos','business-signatures') AND public) THEN RAISE EXCEPTION 'Signature bucket is public'; END IF;
 IF (SELECT count(*) FROM storage.buckets WHERE id IN ('logos','business-signatures','business-logos') AND file_size_limit=2097152 AND allowed_mime_types=ARRAY['image/png','image/jpeg'])<>3 THEN RAISE EXCEPTION 'Image size/MIME constraints absent'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id IN ('logos','business-signatures')) THEN RAISE EXCEPTION 'Anonymous signature enumeration'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE n integer; rejected boolean:=false;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='business-signatures')<>1 THEN RAISE EXCEPTION 'Signature read boundary or own read failed'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='logos') THEN RAISE EXCEPTION 'Legacy signature leak'; END IF;
 BEGIN
 INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('business-signatures','30000000-0000-4000-8000-000000000002/injected.png',auth.uid());
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-tenant upload'; END IF;
 UPDATE storage.objects SET metadata='{"attacker":true}' WHERE name='30000000-0000-4000-8000-000000000002/signature.png';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant storage UPDATE'; END IF;
 DELETE FROM storage.objects WHERE name='30000000-0000-4000-8000-000000000002/signature.png';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant storage DELETE'; END IF;
 INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('business-signatures',auth.uid()::text||'/own.png',auth.uid());
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='business-signatures')<>2 THEN RAISE EXCEPTION 'Own upload regressed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'STORAGE_ASSERTIONS_COMPLETED';
