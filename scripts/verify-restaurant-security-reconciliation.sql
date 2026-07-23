SELECT
  pg_catalog.to_regprocedure('public.authorize_staff_action(text,text)') IS NOT NULL
    AS authoritative_function_exists,
  pg_catalog.to_regprocedure('public.authorize_staff_action(text,uuid,text)') IS NULL
    AS obsolete_function_absent,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies AS p
     WHERE p.schemaname = 'public'
       AND p.tablename = 'restaurant_daily_reports'
       AND p.policyname = 'Managers and Owners can view daily reports'
       AND p.cmd = 'SELECT'
       AND 'authenticated' = ANY(p.roles)
       AND NOT ('public' = ANY(p.roles))
       AND p.qual LIKE '%auth.uid() = business_id%'
       AND p.qual LIKE '%s.user_id = auth.uid()%'
       AND p.qual LIKE '%s.business_id = restaurant_daily_reports.business_id%'
       AND p.qual LIKE '%branch_manager%'
       AND p.qual LIKE '%super_admin%'
  ) AS daily_report_policy_valid,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies AS p
     WHERE p.schemaname = 'public'
       AND p.tablename = 'staff_shifts'
       AND p.policyname = 'Managers see all shifts, Staff see own'
       AND p.cmd = 'SELECT'
       AND 'authenticated' = ANY(p.roles)
       AND NOT ('public' = ANY(p.roles))
       AND p.qual LIKE '%r.business_id = auth.uid()%'
       AND p.qual LIKE '%s.business_id = r.business_id%'
       AND p.qual LIKE '%s.user_id = auth.uid()%'
       AND p.qual LIKE '%s.id = staff_shifts.staff_id%'
       AND p.qual LIKE '%branch_manager%'
       AND p.qual LIKE '%super_admin%'
  ) AS staff_shift_policy_valid,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies AS p
     WHERE p.schemaname = 'public'
       AND p.tablename = 'restaurant_daily_reports'
       AND p.policyname = 'Users can manage their own daily reports'
  ) AS existing_daily_report_owner_policy_preserved,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies AS p
     WHERE p.schemaname = 'public'
       AND p.tablename = 'staff_shifts'
       AND p.policyname = 'Users can manage their own shifts'
  ) AS existing_staff_shift_owner_policy_preserved;
