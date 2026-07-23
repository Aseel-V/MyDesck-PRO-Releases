-- Reconcile the effective Restaurant security baseline without replaying legacy migrations.
-- Catalog inspection confirmed that the existing owner-only policies are narrower and are
-- not equivalent to the manager/staff read paths restored below.

SET search_path = pg_catalog, public;

DO $reconcile_authorization$
DECLARE
  v_authoritative_oid oid := pg_catalog.to_regprocedure('public.authorize_staff_action(text,text)');
  v_authoritative_config text[];
BEGIN
  IF v_authoritative_oid IS NULL THEN
    RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: authoritative authorize_staff_action(text,text) is missing';
  END IF;

  SELECT p.proconfig
    INTO v_authoritative_config
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid = v_authoritative_oid;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(COALESCE(v_authoritative_config, ARRAY[]::text[])) AS setting(value)
     WHERE setting.value IN (
       'search_path=public',
       'search_path=pg_catalog, public',
       'search_path=pg_catalog,public'
     )
  ) THEN
    RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: authoritative function must have a fixed search_path';
  END IF;

  IF pg_catalog.to_regprocedure('public.authorize_staff_action(text,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: obsolete authorize_staff_action(text,uuid,text) must remain absent';
  END IF;
END
$reconcile_authorization$;

DO $reconcile_daily_reports_policy$
DECLARE
  v_policy pg_catalog.pg_policies%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('public.restaurant_daily_reports') IS NULL
     OR pg_catalog.to_regclass('public.restaurant_staff') IS NULL THEN
    RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: daily report policy prerequisites are missing';
  END IF;

  SELECT *
    INTO v_policy
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'restaurant_daily_reports'
     AND policyname = 'Managers and Owners can view daily reports';

  IF FOUND THEN
    IF v_policy.cmd <> 'SELECT'
       OR NOT ('authenticated' = ANY(v_policy.roles))
       OR v_policy.qual NOT LIKE '%auth.uid() = business_id%'
       OR v_policy.qual NOT LIKE '%s.user_id = auth.uid()%'
       OR v_policy.qual NOT LIKE '%s.business_id = restaurant_daily_reports.business_id%'
       OR v_policy.qual NOT LIKE '%branch_manager%'
       OR v_policy.qual NOT LIKE '%super_admin%' THEN
      RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: daily report policy exists with incompatible scope';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_policies AS p
       WHERE p.schemaname = 'public'
         AND p.tablename = 'restaurant_daily_reports'
         AND p.policyname <> 'Managers and Owners can view daily reports'
         AND p.cmd = 'SELECT'
         AND p.qual LIKE '%s.user_id = auth.uid()%'
         AND p.qual LIKE '%s.business_id = restaurant_daily_reports.business_id%'
         AND p.qual LIKE '%branch_manager%'
         AND p.qual LIKE '%super_admin%'
    ) THEN
      RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: equivalent daily report policy exists under another name';
    END IF;

    EXECUTE $policy$
      CREATE POLICY "Managers and Owners can view daily reports"
        ON public.restaurant_daily_reports
        FOR SELECT
        TO authenticated
        USING (
          auth.uid() = business_id
          OR EXISTS (
            SELECT 1
              FROM public.restaurant_staff AS s
             WHERE s.user_id = auth.uid()
               AND s.business_id = public.restaurant_daily_reports.business_id
               AND (
                 s.role IN ('Manager', 'Admin', 'Super Admin', 'Owner')
                 OR s.restaurant_role IN ('branch_manager', 'super_admin')
               )
          )
        )
    $policy$;
  END IF;
END
$reconcile_daily_reports_policy$;

DO $reconcile_staff_shifts_policy$
DECLARE
  v_policy pg_catalog.pg_policies%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('public.staff_shifts') IS NULL
     OR pg_catalog.to_regclass('public.restaurant_daily_reports') IS NULL
     OR pg_catalog.to_regclass('public.restaurant_staff') IS NULL THEN
    RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: staff shift policy prerequisites are missing';
  END IF;

  SELECT *
    INTO v_policy
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'staff_shifts'
     AND policyname = 'Managers see all shifts, Staff see own';

  IF FOUND THEN
    IF v_policy.cmd <> 'SELECT'
       OR NOT ('authenticated' = ANY(v_policy.roles))
       OR v_policy.qual NOT LIKE '%r.business_id = auth.uid()%'
       OR v_policy.qual NOT LIKE '%s.business_id = r.business_id%'
       OR v_policy.qual NOT LIKE '%s.user_id = auth.uid()%'
       OR v_policy.qual NOT LIKE '%s.id = staff_shifts.staff_id%'
       OR v_policy.qual NOT LIKE '%branch_manager%'
       OR v_policy.qual NOT LIKE '%super_admin%' THEN
      RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: staff shift policy exists with incompatible scope';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_policies AS p
       WHERE p.schemaname = 'public'
         AND p.tablename = 'staff_shifts'
         AND p.policyname <> 'Managers see all shifts, Staff see own'
         AND p.cmd = 'SELECT'
         AND p.qual LIKE '%s.business_id = r.business_id%'
         AND p.qual LIKE '%s.user_id = auth.uid()%'
         AND p.qual LIKE '%s.id = staff_shifts.staff_id%'
         AND p.qual LIKE '%branch_manager%'
         AND p.qual LIKE '%super_admin%'
    ) THEN
      RAISE EXCEPTION 'RESTAURANT_SECURITY_RECONCILIATION_BLOCKED: equivalent staff shift policy exists under another name';
    END IF;

    EXECUTE $policy$
      CREATE POLICY "Managers see all shifts, Staff see own"
        ON public.staff_shifts
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
              FROM public.restaurant_daily_reports AS r
             WHERE r.id = public.staff_shifts.report_id
               AND r.business_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
              FROM public.restaurant_daily_reports AS r
              JOIN public.restaurant_staff AS s ON s.business_id = r.business_id
             WHERE r.id = public.staff_shifts.report_id
               AND s.user_id = auth.uid()
               AND (
                 s.role IN ('Manager', 'Admin', 'Super Admin', 'Owner')
                 OR s.restaurant_role IN ('branch_manager', 'super_admin')
               )
          )
          OR EXISTS (
            SELECT 1
              FROM public.restaurant_staff AS s
             WHERE s.id = public.staff_shifts.staff_id
               AND s.user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$reconcile_staff_shifts_policy$;

RESET search_path;
