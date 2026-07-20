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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(sale_price), 0) as total_revenue,
    COALESCE(SUM(profit), 0) as total_profit,
    COUNT(*) as total_trips,
    COALESCE(SUM(travelers_count), 0) as total_travelers,
    COUNT(*) FILTER (WHERE start_date >= CURRENT_DATE) as upcoming_trips,
    COUNT(DISTINCT client_name) as unique_clients
  FROM trips
  WHERE user_id = p_user_id;
END;
$$;

-- Function to get monthly stats for charts
CREATE OR REPLACE FUNCTION get_monthly_stats(p_user_id UUID)
RETURNS TABLE (
  month TEXT,
  revenue NUMERIC,
  profit NUMERIC,
  travelers BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(start_date, 'YYYY-MM') as month,
    COALESCE(SUM(sale_price), 0) as revenue,
    COALESCE(SUM(profit), 0) as profit,
    COALESCE(SUM(travelers_count), 0) as travelers
  FROM trips
  WHERE user_id = p_user_id
  GROUP BY TO_CHAR(start_date, 'YYYY-MM')
  ORDER BY month;
END;
$$;

-- Function to get yearly stats
CREATE OR REPLACE FUNCTION get_yearly_stats(p_user_id UUID)
RETURNS TABLE (
  year TEXT,
  profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(start_date, 'YYYY') as year,
    COALESCE(SUM(profit), 0) as profit
  FROM trips
  WHERE user_id = p_user_id
  GROUP BY TO_CHAR(start_date, 'YYYY')
  ORDER BY year;
END;
$$;

-- Function to get top destinations
CREATE OR REPLACE FUNCTION get_top_destinations(p_user_id UUID, limit_count INT DEFAULT 5)
RETURNS TABLE (
  destination TEXT,
  profit NUMERIC,
  trip_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.destination,
    COALESCE(SUM(t.profit), 0) as profit,
    COUNT(*) as trip_count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.destination
  ORDER BY profit DESC
  LIMIT limit_count;
END;
$$;

-- Function to get status breakdown
CREATE OR REPLACE FUNCTION get_status_breakdown(p_user_id UUID)
RETURNS TABLE (
  status TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.status,
    COUNT(*) as count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.status;
END;
$$;

-- Function to get payment status breakdown
CREATE OR REPLACE FUNCTION get_payment_status_breakdown(p_user_id UUID)
RETURNS TABLE (
  payment_status TEXT,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.payment_status,
    COUNT(*) as count
  FROM trips t
  WHERE t.user_id = p_user_id
  GROUP BY t.payment_status;
END;
$$;
