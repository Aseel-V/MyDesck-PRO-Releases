-- ============================================================================
-- REPLAY HARNESS STUB — NOT A PRODUCTION DESIGN.
--
-- The 7 BLOCKED migrations depend on Supabase-managed infrastructure that does
-- not exist on Cloud SQL: the storage.objects/storage.buckets catalogue and the
-- supabase_realtime publication.
--
-- This file creates the minimum shape needed for those migrations to REPLAY, so
-- the harness can answer a narrow question:
--
--     "does this migration's SQL execute, or does it have other problems too?"
--
-- It answers nothing about whether the resulting security model is correct.
-- On Cloud SQL, storage authorisation is NOT a Postgres table with RLS — it is
-- Cloud Storage IAM plus Firebase Security Rules plus backend-signed URLs, and
-- the 45 storage.objects policy references must be REWRITTEN, not ported.
--
-- Migrations that only pass because of this file are reported as
-- SKIP_WITH_JUSTIFICATION, never as PASS.
--
-- Never install this in a real target.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  owner              uuid,
  public             boolean NOT NULL DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id      text REFERENCES storage.buckets(id),
  name           text NOT NULL,
  owner          uuid,
  metadata       jsonb,
  path_tokens    text[],
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Supabase's helper: splits an object name into path segments, 1-indexed.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT string_to_array(name, '/') $$;

-- Two migrations run ALTER PUBLICATION supabase_realtime ADD TABLE ...
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

COMMIT;
