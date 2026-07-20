-- ============================================================================
-- FIX STORAGE POLICIES
-- This script drops old policies and recreates them to ensure permissions work.
-- ============================================================================

-- 1. Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-assets', 'restaurant-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop potential conflicting/old policies for this bucket
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Deletes" ON storage.objects;
DROP POLICY IF EXISTS "Give me access" ON storage.objects; -- Common default name

-- 3. Create permissive policies for this bucket

-- Allow Public Read
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'restaurant-assets' );

-- Allow Authenticated Uploads (Insert)
CREATE POLICY "Authenticated Uploads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'restaurant-assets' 
  AND auth.role() = 'authenticated'
);

-- Allow Updates (sometimes needed for upsert)
CREATE POLICY "Authenticated Updates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'restaurant-assets' 
  AND auth.role() = 'authenticated'
);

-- Allow Deletes
CREATE POLICY "Authenticated Deletes"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'restaurant-assets' 
  AND auth.role() = 'authenticated'
);
