-- Add signature_url column to business_profiles table
ALTER TABLE public.business_profiles
ADD COLUMN IF NOT EXISTS signature_url text;

-- Comment on column
COMMENT ON COLUMN public.business_profiles.signature_url IS 'URL of the digital signature/stamp image';
