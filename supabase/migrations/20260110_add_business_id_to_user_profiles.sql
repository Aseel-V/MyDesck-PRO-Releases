-- Add business_id column to user_profiles table
-- This allows staff members to be linked to a specific business

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES business_profiles(id) ON DELETE SET NULL;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_business_id ON user_profiles(business_id);

-- Optionally, update existing owners to have their business_id set
-- (This links owner user_profiles to their business)
UPDATE user_profiles up
SET business_id = bp.id
FROM business_profiles bp
WHERE bp.user_id = up.user_id
AND up.business_id IS NULL;
