BEGIN;
-- Function to get overall user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_profit NUMERIC,
  total_trips BIGINT,
  total_travelers BIGINT,
  upcoming_trips BIGINT,
  unique_clients BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    COALESCE(SUM(sale_price), 0) as total_revenue,
    COALESCE(SUM(profit), 0) as total_profit,
    COUNT(*) as total_trips,
    COALESCE(SUM(travelers_count), 0) as total_travelers,
    COUNT(*) FILTER (WHERE start_date >= CURRENT_DATE) as upcoming_trips,
    COUNT(DISTINCT client_name) as unique_clients
  FROM trips
  WHERE user_id = p_user_id;
$$;

-- Function to get monthly stats for charts
CREATE OR REPLACE FUNCTION get_monthly_stats(p_user_id UUID)
RETURNS TABLE (
  month TEXT,
  revenue NUMERIC,
  profit NUMERIC,
  travelers BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    TO_CHAR(start_date, 'YYYY-MM') as month,
    COALESCE(SUM(sale_price), 0) as revenue,
    COALESCE(SUM(profit), 0) as profit,
    COALESCE(SUM(travelers_count), 0) as travelers
  FROM trips
  WHERE user_id = p_user_id
  GROUP BY TO_CHAR(start_date, 'YYYY-MM')
  ORDER BY month;
$$;

-- Function to get yearly stats
CREATE OR REPLACE FUNCTION get_yearly_stats(p_user_id UUID)
RETURNS TABLE (
  year TEXT,
  profit NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    TO_CHAR(start_date, 'YYYY') as year,
    COALESCE(SUM(profit), 0) as profit
  FROM trips
  WHERE user_id = p_user_id
  GROUP BY TO_CHAR(start_date, 'YYYY')
  ORDER BY year;
$$;

-- Function to get top destinations
CREATE OR REPLACE FUNCTION get_top_destinations(p_user_id UUID, limit_count INT DEFAULT 5)
RETURNS TABLE (
  destination TEXT,
  profit NUMERIC,
  trip_count BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    t.destination,
    COALESCE(SUM(t.profit), 0) as profit,
    COUNT(*) as trip_count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.destination
  ORDER BY profit DESC
  LIMIT limit_count;
$$;

-- Function to get status breakdown
CREATE OR REPLACE FUNCTION get_status_breakdown(p_user_id UUID)
RETURNS TABLE (
  status TEXT,
  count BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    t.status,
    COUNT(*) as count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.status;
$$;

-- Function to get payment status breakdown
CREATE OR REPLACE FUNCTION get_payment_status_breakdown(p_user_id UUID)
RETURNS TABLE (
  payment_status TEXT,
  count BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
  SELECT
    t.payment_status,
    COUNT(*) as count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.payment_status;
$$;

-- These legacy analytics routines accept arbitrary user IDs. Invoker execution
-- applies the real trips RLS model instead of bypassing it as the table owner.
ALTER FUNCTION public.get_user_stats(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_monthly_stats(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_yearly_stats(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_top_destinations(uuid,integer) SECURITY INVOKER;
ALTER FUNCTION public.get_status_breakdown(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_payment_status_breakdown(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_user_stats(uuid) SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_monthly_stats(uuid) SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_yearly_stats(uuid) SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_top_destinations(uuid,integer) SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_status_breakdown(uuid) SET search_path=pg_catalog,public;
ALTER FUNCTION public.get_payment_status_breakdown(uuid) SET search_path=pg_catalog,public;
REVOKE ALL ON FUNCTION public.get_user_stats(uuid),public.get_monthly_stats(uuid),public.get_yearly_stats(uuid),
 public.get_top_destinations(uuid,integer),public.get_status_breakdown(uuid),public.get_payment_status_breakdown(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_stats(uuid),public.get_monthly_stats(uuid),public.get_yearly_stats(uuid),
 public.get_top_destinations(uuid,integer),public.get_status_breakdown(uuid),public.get_payment_status_breakdown(uuid) TO authenticated;
COMMIT;
