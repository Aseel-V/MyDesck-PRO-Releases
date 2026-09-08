BEGIN;
-- Existing signatures remain at their physical object keys; privatizing the
-- entire legacy bucket closes old public URLs without unsafe SQL object moves.
UPDATE storage.buckets SET public=false, file_size_limit=2097152,
 allowed_mime_types=ARRAY['image/png','image/jpeg'] WHERE id='logos';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('business-signatures','business-signatures',false,2097152,ARRAY['image/png','image/jpeg']),
 ('business-logos','business-logos',true,2097152,ARRAY['image/png','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "Give public access to logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own files" ON storage.objects;
CREATE POLICY "Legacy business images private read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='logos' AND (owner=auth.uid() OR
 name LIKE 'business-logos/' || auth.uid()::text || '-%' OR
 name LIKE 'business-signatures/sig-' || auth.uid()::text || '-%'));
CREATE POLICY "Business image tenant access" ON storage.objects FOR ALL TO authenticated
USING (bucket_id IN ('business-logos','business-signatures') AND (storage.foldername(name))[1]=auth.uid()::text)
WITH CHECK (bucket_id IN ('business-logos','business-signatures') AND (storage.foldername(name))[1]=auth.uid()::text);
-- Restrictive policies also constrain any unrelated legacy permissive policies.
CREATE POLICY "Business image boundary" ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
USING (bucket_id NOT IN ('logos','business-logos','business-signatures') OR
 (auth.uid() IS NOT NULL AND (
  (bucket_id IN ('business-logos','business-signatures') AND (storage.foldername(name))[1]=auth.uid()::text) OR
  (bucket_id='logos' AND (owner=auth.uid() OR name LIKE 'business-logos/' || auth.uid()::text || '-%' OR name LIKE 'business-signatures/sig-' || auth.uid()::text || '-%'))
 )))
WITH CHECK (bucket_id NOT IN ('logos','business-logos','business-signatures') OR
 (bucket_id IN ('business-logos','business-signatures') AND auth.uid() IS NOT NULL AND (storage.foldername(name))[1]=auth.uid()::text));
COMMIT;
