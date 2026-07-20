/*
  # Elite Travels Business Profiles and Settings

  1. New Tables
    - `business_profiles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `business_name` (text)
      - `logo_url` (text, nullable)
      - `preferred_currency` (text, default 'USD')
      - `preferred_language` (text, default 'en')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `business_profiles` table
    - Add policies for authenticated users to:
      - Read their own profile
      - Insert their own profile
      - Update their own profile
      - Delete their own profile

  3. Notes
    - Each user can have one business profile
    - Logo URL can store external URLs or local file references
    - Supported currencies: USD, EUR, ILS
    - Supported languages: en (English), ar (Arabic), he (Hebrew)
*/

CREATE TABLE IF NOT EXISTS business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  business_name text NOT NULL DEFAULT 'Elite Travels',
  logo_url text,
  preferred_currency text NOT NULL DEFAULT 'USD',
  preferred_language text NOT NULL DEFAULT 'en',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON business_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON business_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON business_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON business_profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);