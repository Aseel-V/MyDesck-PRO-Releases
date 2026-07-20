-- Migration to fix historical exchange rates for existing trips

-- Logic:
-- ILS Trips: 100 USD = 330 ILS => Rate = 3.3
-- EUR Trips: 100 EUR = 370 ILS => (Using 3.3 ILS/USD base) => 1 EUR = 1.1212 USD.
-- The exchange_rate column stores "Units per USD".
-- So for EUR, we need Units of EUR per 1 USD.
-- 1 USD = (1 / 1.1212) EUR = 0.8919 EUR.
-- USD Trips: Rate = 1

BEGIN;

-- 1. Update ILS Trips
UPDATE public.trips
SET exchange_rate = 3.3
WHERE currency = 'ILS';

-- 2. Update EUR Trips
UPDATE public.trips
SET exchange_rate = 0.8919
WHERE currency = 'EUR';

-- 3. Update USD Trips (Ensure they are 1)
UPDATE public.trips
SET exchange_rate = 1
WHERE currency = 'USD';

COMMIT;
