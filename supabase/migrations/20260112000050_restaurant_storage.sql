-- ============================================================================
-- RESTAURANT MODE - STORAGE SETUP
-- Version: 1.0.0 | Apply via Supabase SQL Editor
-- ============================================================================

-- 1. Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-assets', 'restaurant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable public read access to all files in the bucket
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'restaurant-assets' );

-- 3. Allow authenticated users to upload files
CREATE POLICY "Authenticated Uploads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'restaurant-assets' 
  AND auth.role() = 'authenticated'
);

-- 4. Allow users to delete their own uploads (optional, but good for management)
-- Note: Simplified for now to allow authenticated users to manage files
CREATE POLICY "Authenticated Deletes"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'restaurant-assets' 
  AND auth.role() = 'authenticated'
);

-- ============================================================================
-- NOTE: If you get "policy exists" errors, you can ignore them or drop old ones safely.
-- ============================================================================
