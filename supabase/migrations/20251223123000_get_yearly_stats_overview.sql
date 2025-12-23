-- Create a function to get aggregated stats for all years
CREATE OR REPLACE FUNCTION get_yearly_stats_overview()
RETURNS TABLE (
  year text,
  total_trips bigint,
  total_revenue numeric,
  total_profit numeric,
  profit_growth_percentage numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH yearly_data AS (
    SELECT
      TO_CHAR(COALESCE(payment_date, start_date), 'YYYY') as trip_year,
      COUNT(*) as trips_count,
      -- Sum revenue: convert to USD if needed. 
      -- Logic matches standard analytics: price / exchange_rate
      SUM(
        CASE 
          WHEN sale_price IS NULL THEN 0
          WHEN currency = 'USD' THEN sale_price
          ELSE sale_price / COALESCE(exchange_rate, 1)
        END
      ) as revenue_usd,
      -- Sum profit: convert to USD if needed
      SUM(
        CASE 
          WHEN profit IS NULL THEN 0
          WHEN currency = 'USD' THEN profit
          ELSE profit / COALESCE(exchange_rate, 1)
        END
      ) as profit_usd
    FROM trips
    WHERE 
      user_id = auth.uid() 
      AND status != 'cancelled'
    GROUP BY 1
  ),
  with_growth AS (
    SELECT
      trip_year,
      trips_count,
      revenue_usd,
      profit_usd,
      LAG(profit_usd) OVER (ORDER BY trip_year) as prev_year_profit
    FROM yearly_data
  )
  SELECT
    trip_year as year,
    trips_count as total_trips,
    ROUND(revenue_usd, 2) as total_revenue,
    ROUND(profit_usd, 2) as total_profit,
    CASE
      WHEN prev_year_profit IS NULL OR prev_year_profit = 0 THEN 0
      ELSE ROUND(((profit_usd - prev_year_profit) / prev_year_profit) * 100, 1)
    END as profit_growth_percentage
  FROM with_growth
  ORDER BY trip_year DESC;
END;
$$;
