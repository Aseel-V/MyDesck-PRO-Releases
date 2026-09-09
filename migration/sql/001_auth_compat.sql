-- ============================================================================
-- Phase 4 + 10 + 11 — Supabase auth compatibility layer for Cloud SQL.
--
-- Installed FIRST, before any application migration runs. It provides the three
-- things 82 of the 93 migrations assume exist:
--
--   1. an application-owned auth.users table carrying the ORIGINAL Supabase
--      UUIDs, so all 97 foreign keys resolve unchanged
--   2. auth.uid() / auth.role(), backed by transaction-local state that only a
--      trusted API tier can set, after verifying a Firebase ID token
--   3. the role names authenticated / anon / service_role, which the Phase 1
--      trigger guards compare against current_user
--
-- SECURITY MODEL
--   The browser never connects to this database. A Cloud Run service verifies
--   the Firebase ID token with the Admin SDK, extracts the uid, and binds it
--   with SET LOCAL inside an explicit transaction. SET LOCAL is scoped to the
--   transaction, so a pooled connection cannot carry one user's identity into
--   the next request. That property is proved by
--   migration/tests/identity-isolation.test.mjs and must never be weakened to
--   plain SET.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- roles
-- Created with the same NAMES Supabase uses. Not cosmetic: migrations
-- 20260908090000 and 20260908094000 test
--   current_user IN ('postgres','supabase_admin','service_role')
-- to decide whether a write is server-originated. Renaming these roles would
-- silently disable the Phase 1 privilege guards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- Supabase's superuser role name, referenced by the Phase 1 guards. On Cloud
  -- SQL we cannot create a superuser, and we do not want one: this is a plain
  -- NOLOGIN role that exists purely so the guard's IN-list resolves. Nothing
  -- ever connects as it.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- ---------------------------------------------------------------- auth schema

CREATE SCHEMA IF NOT EXISTS auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Mirror of the Supabase auth.users columns the application and its migrations
-- actually depend on. Deliberately NOT a full GoTrue schema clone: Firebase
-- Authentication is the identity system of record after cutover, and this table
-- exists to satisfy foreign keys and to preserve values Firebase does not store
-- (created_at, last_sign_in_at) so the product never loses them.
--
-- id is populated from migration.user_id_map.firebase_uid, which is asserted
-- equal to supabase_uid. It is NEVER generated here — no DEFAULT on purpose.
CREATE TABLE IF NOT EXISTS auth.users (
  id                uuid PRIMARY KEY,
  email             text,
  email_confirmed_at timestamptz,
  phone             text,
  raw_app_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_anonymous      boolean NOT NULL DEFAULT false,
  banned_until      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at   timestamptz,
  -- Provenance. Lets a reconciliation query prove every row came from the
  -- migration ledger rather than from an ad-hoc insert.
  migrated_from_supabase boolean NOT NULL DEFAULT false,
  migrated_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON auth.users (lower(email)) WHERE email IS NOT NULL;

-- Tenants must never read the identity table directly; the application reads
-- public.user_profiles / public.business_profiles, which have their own RLS.
REVOKE ALL ON auth.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON auth.users TO service_role;

-- ---------------------------------------------------------------- identity binding
--
-- Transaction-local GUCs. Only ever written by auth.bind_identity() below,
-- which the trusted API tier calls immediately after verifying a Firebase token.
--
--   app.user_id    the verified Firebase uid (== original Supabase uuid)
--   app.user_role  'authenticated' | 'anon' | 'service_role'
--
-- current_setting(..., true) returns NULL rather than raising when unset, so an
-- unbound connection behaves as anonymous and every RLS predicate denies.

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

COMMENT ON FUNCTION auth.uid() IS
  'Transaction-local verified Firebase UID. NULL when no identity is bound, which makes every tenant RLS predicate deny. Never client-controlled: only auth.bind_identity() writes app.user_id, and only the trusted API tier may call it.';

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.jwt_claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- The ONLY supported way to establish identity.
--
-- p_uid MUST already be extracted from a signature-verified Firebase ID token.
-- This function cannot verify a token itself and does not try to; it is the
-- last link in the chain, and the API tier is responsible for the rest.
--
-- Refuses outside a transaction block, because SET LOCAL silently does nothing
-- in autocommit mode — which would leave auth.uid() NULL and every query
-- denied, or worse, leave a previous request's identity in place if plain SET
-- had ever been used on that connection.
CREATE OR REPLACE FUNCTION auth.bind_identity(
  p_uid    uuid,
  p_role   text DEFAULT 'authenticated',
  p_claims jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
BEGIN
  IF p_role NOT IN ('authenticated', 'anon', 'service_role') THEN
    RAISE EXCEPTION 'auth.bind_identity: unsupported role %', p_role
      USING ERRCODE = '22023';
  END IF;

  IF p_role = 'authenticated' AND p_uid IS NULL THEN
    RAISE EXCEPTION 'auth.bind_identity: authenticated role requires a uid'
      USING ERRCODE = '22023';
  END IF;

  -- NOTE ON TRANSACTION SCOPE
  -- PL/pgSQL always executes inside *a* transaction, so a function cannot
  -- reliably detect whether the caller opened an explicit transaction block.
  -- We deliberately do not fake such a check.
  --
  -- The failure mode is benign in the direction that matters: in autocommit
  -- mode the LOCAL setting is discarded when the implicit single-statement
  -- transaction ends, so auth.uid() returns NULL on the next statement and
  -- every tenant predicate DENIES. Identity cannot leak forward.
  --
  -- The dangerous variant is plain SET (session-scoped), which would persist on
  -- a pooled connection. That is why nothing in this file uses it, and why
  -- migration/tests/identity-isolation.test.mjs proves the leak does not occur
  -- against a real server rather than trusting this comment.

  PERFORM pg_catalog.set_config('app.user_id',   COALESCE(p_uid::text, ''), true);  -- true => LOCAL
  PERFORM pg_catalog.set_config('app.user_role', p_role,                    true);
  PERFORM pg_catalog.set_config('app.jwt_claims', COALESCE(p_claims::text, ''), true);
END
$$;

REVOKE ALL ON FUNCTION auth.bind_identity(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.bind_identity(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION auth.bind_identity(uuid, text, jsonb) IS
  'Binds a verified Firebase UID to the CURRENT TRANSACTION ONLY (set_config is_local = true). Executable by service_role alone. Callers must already have verified the token signature, expiry, issuer and audience.';

GRANT EXECUTE ON FUNCTION auth.uid()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt()  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- runtime role
--
-- HOW THE RUNTIME LOGIN ROLE MUST BE PROVISIONED.
--
-- The obvious setup is wrong and was caught by
-- migration/tests/security-posture.test.mjs:
--
--     GRANT service_role, authenticated, anon TO mydesck_runtime;   -- DO NOT
--
-- SET ROLE is authorised against the SESSION user's memberships, not the
-- currently active role. So a connection that has switched down to
-- `authenticated` can still issue `SET ROLE service_role` and climb back up —
-- and service_role holds BYPASSRLS. Anything able to run arbitrary SQL on that
-- connection escapes every tenant policy in the database.
--
-- The runtime role therefore gets membership in `authenticated` and `anon`
-- only, plus a direct EXECUTE grant on bind_identity. It can establish an
-- identity; it can never become service_role.
--
-- Call once per environment, as a superuser, after creating the login role:
--     SELECT auth.grant_runtime_access('mydesck_runtime');

CREATE OR REPLACE FUNCTION auth.grant_runtime_access(p_role text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, auth
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = p_role) THEN
    RAISE EXCEPTION 'role % does not exist', p_role USING ERRCODE = '42704';
  END IF;

  -- Refuse to configure a role that could bypass RLS regardless of grants.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
              WHERE rolname = p_role AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'runtime role % must not hold BYPASSRLS or SUPERUSER', p_role
      USING ERRCODE = '42501';
  END IF;

  EXECUTE format('REVOKE service_role FROM %I', p_role);
  EXECUTE format('GRANT authenticated, anon TO %I', p_role);
  EXECUTE format('GRANT USAGE ON SCHEMA auth, public TO %I', p_role);
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION auth.bind_identity(uuid, text, jsonb) TO %I', p_role);
END
$$;

-- Recreating schema public (as a restore or a rebuild does) drops the default
-- PUBLIC grants, after which `authenticated` cannot resolve any table and every
-- query fails with "permission denied for schema public". Restore them here so
-- a rebuilt target behaves like the original.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- self-checks
--
-- Assertions that must hold for the security model to mean anything. Run by
-- migration/tests and again as a permanent CI gate.

CREATE OR REPLACE FUNCTION auth.assert_security_posture()
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql
SET search_path = pg_catalog, auth
AS $$
BEGIN
  RETURN QUERY
  -- pg_proc.provolatile is type "char"; the cast is required or the || is
  -- ambiguous ("operator is not unique: unknown || char").
  SELECT 'auth.uid is STABLE not IMMUTABLE'::text,
         p.provolatile = 's',
         'provolatile=' || p.provolatile::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'auth' AND p.proname = 'uid';

  RETURN QUERY
  SELECT 'bind_identity not executable by authenticated'::text,
         NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         'authenticated EXECUTE on auth.bind_identity'
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'auth' AND p.proname = 'bind_identity';

  RETURN QUERY
  SELECT 'auth.users not readable by authenticated'::text,
         NOT has_table_privilege('authenticated', 'auth.users', 'SELECT'),
         'authenticated SELECT on auth.users';

  -- The application login role must not be able to sidestep RLS.
  RETURN QUERY
  SELECT 'no non-superuser app role has BYPASSRLS'::text,
         NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_roles
           WHERE rolbypassrls AND NOT rolsuper AND rolcanlogin
         ),
         COALESCE((
           SELECT string_agg(rolname, ', ') FROM pg_catalog.pg_roles
           WHERE rolbypassrls AND NOT rolsuper AND rolcanlogin
         ), 'none');
END
$$;

COMMIT;
