-- ============================================================================
-- Phase 7 — read-only classification of the production Supabase auth population.
--
-- SAFETY
--   * SELECT only. No DDL, no DML, no side effects.
--   * Returns hash PRESENCE and FORMAT, never the hash itself, so the result is
--     safe to save, attach to a report and review. The hashes are read
--     separately by the import tool, into memory, and never written to disk.
--   * Run against a read replica if one exists.
--
-- Requires the direct PostgreSQL connection string for the Supabase project.
-- The Supabase API does not expose auth.users; without direct DB access this
-- query cannot run and transparent password migration is not possible.
-- ============================================================================

-- ---------------------------------------------------------------- 1. per-account
-- One row per auth user, with everything needed to classify it.

SELECT
  u.id                                                   AS supabase_uid,
  length(u.id::text)                                     AS uid_length,
  length(u.id::text) <= 128                              AS uid_preservable,
  u.email,
  (u.email IS NULL)                                      AS missing_email,
  (u.encrypted_password IS NOT NULL
     AND u.encrypted_password <> '')                     AS has_password_hash,
  -- Format check only. The value never leaves the database.
  (u.encrypted_password ~ '^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$')
                                                         AS bcrypt_format_ok,
  substring(u.encrypted_password from 1 for 4)           AS hash_prefix,   -- e.g. '$2a$'
  substring(u.encrypted_password from 5 for 2)           AS bcrypt_cost,
  (u.email_confirmed_at IS NOT NULL)                     AS email_confirmed,
  (u.phone IS NOT NULL AND u.phone <> '')                AS has_phone,
  (u.phone_confirmed_at IS NOT NULL)                     AS phone_confirmed,
  (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_banned,
  (u.deleted_at IS NOT NULL)                             AS is_soft_deleted,
  u.created_at,
  u.last_sign_in_at,
  (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id)          AS identity_count,
  (SELECT count(*) FROM auth.identities i
     WHERE i.user_id = u.id AND i.provider <> 'email')                     AS oauth_identity_count,
  (SELECT count(*) FROM auth.mfa_factors f
     WHERE f.user_id = u.id AND f.status = 'verified')                     AS mfa_factor_count,
  EXISTS (SELECT 1 FROM public.business_profiles b WHERE b.user_id = u.id) AS has_business_profile,
  EXISTS (SELECT 1 FROM public.user_profiles  p WHERE p.user_id = u.id)    AS has_user_profile,
  (SELECT count(*) FROM auth.users d
     WHERE lower(d.email) = lower(u.email))                                AS email_multiplicity
FROM auth.users u
ORDER BY u.created_at;

-- ---------------------------------------------------------------- 2. summary
-- The numbers that go in the milestone report.

SELECT
  count(*)                                                          AS total_accounts,
  count(*) FILTER (WHERE length(id::text) > 128)                    AS uid_not_preservable,
  count(*) FILTER (WHERE email IS NULL)                             AS missing_email,
  count(*) FILTER (WHERE encrypted_password IS NULL
                      OR encrypted_password = '')                   AS no_password_hash,
  count(*) FILTER (WHERE encrypted_password IS NOT NULL
                     AND encrypted_password !~ '^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$')
                                                                    AS non_bcrypt_hash,
  count(*) FILTER (WHERE email_confirmed_at IS NULL)                AS email_unconfirmed,
  count(*) FILTER (WHERE banned_until IS NOT NULL
                     AND banned_until > now())                      AS banned,
  count(*) FILTER (WHERE deleted_at IS NOT NULL)                    AS soft_deleted
FROM auth.users;

-- ---------------------------------------------------------------- 3. blockers
-- Must return ZERO rows before production import is authorised. Every row here
-- is a customer who would otherwise be lost, duplicated or silently changed.

SELECT 'uid_not_preservable' AS blocker, u.id::text AS subject, NULL::text AS detail
FROM auth.users u WHERE length(u.id::text) > 128
UNION ALL
SELECT 'missing_email', u.id::text, NULL
FROM auth.users u WHERE u.email IS NULL
UNION ALL
SELECT 'duplicate_email', u.id::text, lower(u.email)
FROM auth.users u
WHERE u.email IS NOT NULL
  AND (SELECT count(*) FROM auth.users d WHERE lower(d.email) = lower(u.email)) > 1
UNION ALL
SELECT 'auth_row_without_any_profile', u.id::text, u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.business_profiles b WHERE b.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = u.id)
UNION ALL
-- The reverse orphan: business data whose owner no longer exists in auth.
-- These rows would migrate into a database where nobody can ever read them.
SELECT 'business_profile_without_auth_row', b.id::text, b.user_id::text
FROM public.business_profiles b
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.user_id)
UNION ALL
SELECT 'user_profile_without_auth_row', p.id::text, p.user_id::text
FROM public.user_profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
UNION ALL
SELECT 'trips_without_auth_row', t.user_id::text, count(*)::text
FROM public.trips t
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
GROUP BY t.user_id
ORDER BY blocker, subject;
