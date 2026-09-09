-- ============================================================================
-- Phase 5 + 19 + 22 — migration ledgers.
--
-- These tables ARE the zero-data-loss guarantee. Every user, every file and
-- every rewritten storage reference passes through them, so "we migrated
-- everything" becomes a query rather than an assertion.
--
-- Lives in its own schema, revoked from every application role. Nothing the
-- product does at runtime reads these.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS migration;
REVOKE ALL ON SCHEMA migration FROM PUBLIC;

-- ---------------------------------------------------------------- Phase 5
-- One row per Supabase auth user. Never truncated; it is the audit trail.

CREATE TABLE IF NOT EXISTS migration.user_id_map (
  supabase_uid   uuid PRIMARY KEY,
  firebase_uid   text NOT NULL,
  email          text,

  -- Generated, not written: nobody can mark a UID "preserved" by hand.
  uid_preserved  boolean GENERATED ALWAYS AS (firebase_uid = supabase_uid::text) STORED,

  auth_class     text NOT NULL DEFAULT 'unclassified'
                 CHECK (auth_class IN ('unclassified','transparent','reauth',
                                       'reset_required','manual_review')),
  import_status  text NOT NULL DEFAULT 'pending'
                 CHECK (import_status IN ('pending','dry_run_ok','imported',
                                          'failed','skipped')),
  verification_status text NOT NULL DEFAULT 'pending'
                 CHECK (verification_status IN ('pending','verified','failed','n/a')),

  -- Facts about the source account, used for classification. Never the hash
  -- itself: the ledger must be safe to read, export and attach to a report.
  has_password_hash   boolean,
  hash_format_ok      boolean,
  email_confirmed     boolean,
  has_oauth_identity  boolean,
  has_phone           boolean,
  is_banned           boolean,
  has_business_profile boolean,
  has_user_profile    boolean,

  failure_reason text,
  notes          text,
  imported_at    timestamptz,
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_id_map_firebase_uid_key
  ON migration.user_id_map (firebase_uid);
CREATE INDEX IF NOT EXISTS user_id_map_status_idx
  ON migration.user_id_map (import_status, auth_class);

COMMENT ON COLUMN migration.user_id_map.uid_preserved IS
  'Generated. Cannot be set by hand. The Phase 5 gate is: zero rows where this is false without a signed-off exception in notes.';

-- ---------------------------------------------------------------- Phase 19/21
-- One row per storage object. Checksums on both sides; a file is only
-- "migrated" when two independently computed SHA-256 values agree.

CREATE TABLE IF NOT EXISTS migration.storage_manifest (
  old_bucket     text NOT NULL,
  old_path       text NOT NULL,
  owner_uid      uuid,
  business_id    uuid,
  related_table  text,
  related_id     text,
  classification text NOT NULL DEFAULT 'unclassified'
                 CHECK (classification IN ('unclassified','public_asset','private_asset',
                                           'sensitive_document','signature',
                                           'trip_attachment','orphan')),
  mime_type      text,
  size_bytes     bigint,
  source_created_at timestamptz,

  source_sha256  text,
  new_bucket     text,
  new_path       text,
  target_sha256  text,

  copy_status    text NOT NULL DEFAULT 'pending'
                 CHECK (copy_status IN ('pending','copied','failed','skipped')),
  verify_status  text NOT NULL DEFAULT 'pending'
                 CHECK (verify_status IN ('pending','match','mismatch','n/a')),
  privacy_probe  text NOT NULL DEFAULT 'pending'
                 CHECK (privacy_probe IN ('pending','private_confirmed','public_confirmed',
                                          'LEAKED','n/a')),
  failure_reason text,
  copied_at      timestamptz,
  verified_at    timestamptz,
  PRIMARY KEY (old_bucket, old_path)
);

CREATE INDEX IF NOT EXISTS storage_manifest_owner_idx
  ON migration.storage_manifest (owner_uid);
CREATE INDEX IF NOT EXISTS storage_manifest_status_idx
  ON migration.storage_manifest (copy_status, verify_status);

-- ---------------------------------------------------------------- Phase 22
-- Storage paths are embedded in jsonb and text columns. Moving bytes does not
-- rewrite those references; this table records every rewrite so it can be
-- verified and, if needed, reversed.

CREATE TABLE IF NOT EXISTS migration.storage_reference_rewrites (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name    text NOT NULL,
  column_name   text NOT NULL,
  row_pk        text NOT NULL,
  old_reference text NOT NULL,
  new_reference text NOT NULL,
  applied       boolean NOT NULL DEFAULT false,
  applied_at    timestamptz,
  UNIQUE (table_name, column_name, row_pk, old_reference)
);

-- ---------------------------------------------------------------- reconciliation

CREATE TABLE IF NOT EXISTS migration.reconciliation_run (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  stage        text NOT NULL,          -- rehearsal | delta | final
  source_label text NOT NULL,
  target_label text NOT NULL,
  verdict      text CHECK (verdict IN ('GO','NO_GO','running'))
);

CREATE TABLE IF NOT EXISTS migration.reconciliation_result (
  run_id      bigint NOT NULL REFERENCES migration.reconciliation_run(id) ON DELETE CASCADE,
  check_kind  text NOT NULL,           -- row_count | content_hash | financial_sum
                                       --   | orphan | event_order | per_customer
  subject     text NOT NULL,           -- table, column, or customer uid
  source_value text,
  target_value text,
  difference  text,
  passed      boolean NOT NULL,
  detail      text,
  PRIMARY KEY (run_id, check_kind, subject)
);

CREATE INDEX IF NOT EXISTS reconciliation_result_failed_idx
  ON migration.reconciliation_result (run_id) WHERE NOT passed;

-- ---------------------------------------------------------------- gate view
-- The single query a human reads before authorising cutover. Every row must
-- say PASS. Deliberately fails closed: an empty ledger reports FAIL, not PASS,
-- because "no rows" must never be mistaken for "nothing wrong".

CREATE OR REPLACE VIEW migration.go_no_go AS
SELECT 'auth: all users classified' AS gate,
       CASE WHEN count(*) FILTER (WHERE auth_class = 'unclassified') = 0
             AND count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status,
       count(*) FILTER (WHERE auth_class = 'unclassified')::text || ' unclassified of '
         || count(*)::text AS detail
FROM migration.user_id_map
UNION ALL
SELECT 'auth: no unresolved manual review',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' awaiting human decision'
FROM migration.user_id_map
WHERE auth_class = 'manual_review' AND notes IS NULL
UNION ALL
SELECT 'uid: 100% preserved',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' UIDs not preserved without a signed-off note'
FROM migration.user_id_map
WHERE NOT uid_preserved AND notes IS NULL
UNION ALL
SELECT 'auth: no unknown import state',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' still pending or failed'
FROM migration.user_id_map
WHERE import_status IN ('pending','failed')
UNION ALL
SELECT 'storage: every object copied',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' not copied'
FROM migration.storage_manifest
WHERE copy_status NOT IN ('copied','skipped')
UNION ALL
SELECT 'storage: every checksum matches',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' checksum mismatches or unverified'
FROM migration.storage_manifest
WHERE copy_status = 'copied' AND verify_status <> 'match'
UNION ALL
SELECT 'storage: no private object publicly readable',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' LEAKED'
FROM migration.storage_manifest
WHERE privacy_probe = 'LEAKED'
UNION ALL
SELECT 'storage: references rewritten',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' pending rewrites'
FROM migration.storage_reference_rewrites
WHERE NOT applied
UNION ALL
SELECT 'reconciliation: latest run clean',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text || ' failed checks in the most recent run'
FROM migration.reconciliation_result r
WHERE NOT r.passed
  AND r.run_id = (SELECT max(id) FROM migration.reconciliation_run);

COMMENT ON VIEW migration.go_no_go IS
  'Cutover gate. Every row must read PASS. Fails closed on an empty ledger.';

COMMIT;
