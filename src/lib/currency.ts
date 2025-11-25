// ============================================================================
// INTELLIGENT CURRENCY SERVICE
// Features: Live API + Smart Caching (12h TTL) + Offline Fallback
// ============================================================================

interface ExchangeRates {
    amount: number;
    base: string;
    date: string;
    rates: Record<string, number>;
}

interface CachedRates {
    rates: ExchangeRates;
    timestamp: number;
    base: string;
}

// Hardcoded fallback rates (approximate values, used when both cache and API fail)
const FALLBACK_RATES: Record<string, Record<string, number>> = {
    USD: { USD: 1, EUR: 0.92, ILS: 3.65 },
    EUR: { USD: 1.09, EUR: 1, ILS: 3.97 },
    ILS: { USD: 0.27, EUR: 0.25, ILS: 1 },
};

const BASE_URL = 'https://api.frankfurter.app';
const CACHE_KEY = 'mydesck_currency_cache';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

export const CurrencyService = {
    /**
     * Get cached rates or fetch from API with intelligent fallback
     * Priority: 1) Valid cache → 2) Fresh API → 3) Stale cache (offline) → 4) Hardcoded fallback
     */
    getCachedOrFetchRates: async (base: string = 'USD'): Promise<ExchangeRates | null> => {
        try {
            // Step 1: Check cache
            const cached = CurrencyService.getCache(base);
            const now = Date.now();

            if (cached && now - cached.timestamp < CACHE_TTL) {
                console.log(`[Currency] Using cached rates for ${base} (age: ${Math.round((now - cached.timestamp) / 1000 / 60)} min)`);
                return cached.rates;
            }

            // Step 2: Try fetch from API
            try {
                const response = await fetch(`${BASE_URL}/latest?from=${base}`, {
                    signal: AbortSignal.timeout(5000), // 5 second timeout
                });

                if (!response.ok) throw new Error('API request failed');

                const rates: ExchangeRates = await response.json();

                // Save to cache
                CurrencyService.saveCache(base, rates);
                console.log(`[Currency] Fetched fresh rates for ${base} from API`);
                return rates;
            } catch (fetchError) {
                console.warn('[Currency] API fetch failed:', fetchError);

                // Step 3: Use stale cache if available (offline mode)
                if (cached) {
                    console.log(`[Currency] Using stale cached rates (offline mode, age: ${Math.round((now - cached.timestamp) / 1000 / 60 / 60)} hours)`);
                    return cached.rates;
                }

                // Step 4: Hardcoded fallback
                console.warn('[Currency] No cache available, using hardcoded fallback rates');
                return CurrencyService.getFallbackRates(base);
            }
        } catch (error) {
            console.error('[Currency] Unexpected error:', error);
            return CurrencyService.getFallbackRates(base);
        }
    },

    /**
     * Force refresh rates from API, bypassing cache
     */
    refreshRates: async (base: string = 'USD'): Promise<ExchangeRates | null> => {
        try {
            const response = await fetch(`${BASE_URL}/latest?from=${base}`, {
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) throw new Error('Failed to fetch rates');

            const rates: ExchangeRates = await response.json();
            CurrencyService.saveCache(base, rates);
            console.log('[Currency] Rates refreshed successfully');
            return rates;
        } catch (error) {
            console.error('[Currency] Refresh failed:', error);
            return null;
        }
    },

    /**
     * Get last updated timestamp
     */
    getLastUpdated: (): Date | null => {
        try {
            const cacheStr = localStorage.getItem(CACHE_KEY);
            if (!cacheStr) return null;

            const cache: CachedRates = JSON.parse(cacheStr);
            return new Date(cache.timestamp);
        } catch {
            return null;
        }
    },

    /**
     * Clear cached rates
     */
    clearCache: (): void => {
        localStorage.removeItem(CACHE_KEY);
        console.log('[Currency] Cache cleared');
    },

    /**
     * Get cached rates from localStorage
     */
    getCache: (base: string): CachedRates | null => {
        try {
            const cacheStr = localStorage.getItem(CACHE_KEY);
            if (!cacheStr) return null;

            const cache: CachedRates = JSON.parse(cacheStr);
            if (cache.base !== base) return null;

            return cache;
        } catch (error) {
            console.error('[Currency] Error reading cache:', error);
            return null;
        }
    },

    /**
     * Save rates to localStorage cache
     */
    saveCache: (base: string, rates: ExchangeRates): void => {
        try {
            const cache: CachedRates = {
                rates,
                timestamp: Date.now(),
                base,
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            console.error('[Currency] Error saving to cache:', error);
        }
    },

    /**
     * Get hardcoded fallback rates
     */
    getFallbackRates: (base: string): ExchangeRates => {
        const rates = FALLBACK_RATES[base] || FALLBACK_RATES.USD;
        return {
            amount: 1,
            base,
            date: new Date().toISOString().split('T')[0],
            rates,
        };
    },

    /**
     * Fetch current exchange rates for a base currency (kept for backward compatibility)
     * @deprecated Use getCachedOrFetchRates instead
     */
    getLatestRates: async (base: string = 'USD'): Promise<ExchangeRates | null> => {
        return CurrencyService.getCachedOrFetchRates(base);
    },

    /**
     * Fetch historical exchange rates for a specific date
     * @param date Date in YYYY-MM-DD format
     * @param base Base currency code (e.g. 'USD')
     */
    getHistoricalRates: async (date: string, base: string = 'USD'): Promise<ExchangeRates | null> => {
        try {
            const response = await fetch(`${BASE_URL}/${date}?from=${base}`);
            if (!response.ok) throw new Error('Failed to fetch historical rates');
            return await response.json();
        } catch (error) {
            console.error(`Error fetching rates for ${date}:`, error);
            return null;
        }
    },

    /**
     * Convert amount from one currency to another using latest rates
     */
    convert: async (amount: number, from: string, to: string): Promise<number | null> => {
        if (from === to) return amount;
        try {
            const rates = await CurrencyService.getCachedOrFetchRates(from);
            if (!rates || !rates.rates[to]) return null;
            return amount * rates.rates[to];
        } catch (error) {
            console.error('Conversion error:', error);
            return null;
        }
    },
};
