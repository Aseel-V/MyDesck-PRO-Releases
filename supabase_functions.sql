-- Run this in your Supabase SQL Editor to enable secure email checking

create or replace function check_email_exists(email_input text)
returns boolean
language plpgsql
security definer -- Allows this function to run with admin privileges (to check auth.users)
as $$
begin
  return exists (
    select 1 
    from auth.users 
    where email = email_input
  );
end;
$$;

-- Grant access to this function for anonymous and authenticated users
grant execute on function check_email_exists(text) to anon, authenticated;

-- MIGRATION: Multi-Business Type & Subscription Updates
-- Run these commands in your Supabase SQL Editor

-- 1. Add columns to business_profiles
ALTER TABLE business_profiles 
ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'tourism',
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_start_date timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;

-- 2. Add validation check for business_type (Optional but recommended)
ALTER TABLE business_profiles 
ADD CONSTRAINT check_business_type 
CHECK (business_type IN ('tourism', 'restaurant', 'supermarket', 'phone_shop', 'car_parts', 'clothes_shop', 'furniture_store'));

-- 3. Add validation for subscription_status
ALTER TABLE business_profiles 
ADD CONSTRAINT check_subscription_status 
CHECK (subscription_status IN ('active', 'past_due', 'trial'));

-- 4. Update RLS Policies (example - adjust based on your actual policy names)
-- Ensure Admins can update suspension status
-- (Assuming you have a 'profiles' or 'users' table approach for admin role checks)
-- This is a conceptual policy update:
-- CREATE POLICY "Admins can update everything in business_profiles" 
-- ON business_profiles FOR UPDATE 
-- USING (auth.uid() IN (SELECT user_id FROM user_profiles WHERE role = 'admin'));
