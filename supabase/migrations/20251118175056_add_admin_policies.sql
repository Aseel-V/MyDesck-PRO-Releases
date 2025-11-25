/*
  # Add Admin Role Support

  1. Changes
    - Add admin-specific RLS policies for viewing all trips and users
    - Allow admins to view all data while maintaining user data isolation

  2. Security
    - Admin users can view all trips
    - Admin users can view all profiles
    - Normal users can only see their own data (existing policies remain)
*/

-- Create admin policies for trips table
CREATE POLICY "Admins can view all trips"
  ON trips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create admin policies for user_profiles table
CREATE POLICY "Admins can view all user profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.role = 'admin'
    )
  );

-- Create admin policies for business_profiles table
CREATE POLICY "Admins can view all business profiles"
  ON business_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );
