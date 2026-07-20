-- Add business_registration_number column to business_profiles table
ALTER TABLE public.business_profiles
ADD COLUMN IF NOT EXISTS business_registration_number text;

-- Comment on column
COMMENT ON COLUMN public.business_profiles.business_registration_number IS 'Business Registration Number / Tax ID (e.g., ח.פ / ע.מ)';
