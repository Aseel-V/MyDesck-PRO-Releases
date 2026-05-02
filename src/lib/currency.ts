// ============================================================================
// INTELLIGENT CURRENCY SERVICE
// Features: Live API + Smart Caching (24h TTL) + Offline Fallback
// ============================================================================

export interface ExchangeRates {
    amount: number;
    base: string;
    date: string; // YYYY-MM-DD
    rates: Record<string, number>;
}

export interface CachedRates {
    rates: ExchangeRates;
    timestamp: number;
    base: string;
}

const BASE_URL = 'https://api.frankfurter.app';
const CACHE_KEY = 'mydesck_currency_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Fetches live exchange rates.
 * - In Electron: routes through the main process via IPC to bypass CORS.
 * - In browser: uses fetch() directly.
 */
async function fetchRatesFromAPI(base: string): Promise<ExchangeRates> {
    // Electron context: use IPC bridge
    if (typeof window !== 'undefined' && window.electronAPI?.fetchCurrencyRates) {
        const result = await window.electronAPI.fetchCurrencyRates(base);
        if (!result.success || !result.data) {
            throw new Error(result.error || 'IPC fetch failed');
        }
        return result.data;
    }
    // Browser / web context: direct fetch
    const response = await fetch(`${BASE_URL}/latest?from=${base}`, {
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ExchangeRates>;
}

export const CurrencyService = {
    /**
     * Get cached rates or fetch from API.
     * Base is strictly 'USD' for this app to ensure consistent cross-rates.
     */
    getRates: async (base: string = 'USD'): Promise<{ rates: ExchangeRates | null; isStale: boolean; lastUpdated: number | null }> => {
        try {
            const cacheStr = localStorage.getItem(CACHE_KEY);
            let cached: CachedRates | null = null;
            
            if (cacheStr) {
                cached = JSON.parse(cacheStr);
                // Invalidate if base doesn't match (shouldn't happen if we stick to USD)
                if (cached && cached.base !== base) cached = null;
            }

            const now = Date.now();
            const isCacheValid = cached && (now - cached.timestamp < CACHE_TTL);

            // 1. If cache is valid (fresh), use it
            if (isCacheValid && cached) {
                console.log(`[Currency] Using fresh cache for ${base}`);
                return { rates: cached.rates, isStale: false, lastUpdated: cached.timestamp };
            }

            // 2. Try to fetch fresh rates
            try {
                const rates: ExchangeRates = await fetchRatesFromAPI(base);
                CurrencyService.saveCache(base, rates);
                console.log(`[Currency] Fetched fresh rates for ${base}`);
                
                return { rates, isStale: false, lastUpdated: Date.now() };
            } catch (fetchError) {
                console.warn('[Currency] API fetch failed, falling back to cache if available:', fetchError);
                
                // 3. Fallback to stale cache if available
                if (cached) {
                    console.log(`[Currency] Using stale cache (age: ${Math.round((now - cached.timestamp) / 1000 / 60 / 60)}h)`);
                    return { rates: cached.rates, isStale: true, lastUpdated: cached.timestamp };
                }

                // 4. No cache, no API => Fail gracefully
                console.error('[Currency] No rates available (API failed + No cache)');
                return { rates: null, isStale: false, lastUpdated: null };
            }
        } catch (error) {
            console.error('[Currency] Unexpected error:', error);
            return { rates: null, isStale: false, lastUpdated: null };
        }
    },

    /**
     * Force refresh rates from API, bypassing cache
     */
    refreshRates: async (base: string = 'USD'): Promise<{ rates: ExchangeRates | null; isStale: boolean; lastUpdated: number | null }> => {
        try {
            const rates: ExchangeRates = await fetchRatesFromAPI(base);
            CurrencyService.saveCache(base, rates);
            console.log('[Currency] Rates refreshed successfully');
            return { rates, isStale: false, lastUpdated: Date.now() };
        } catch (error) {
            console.error('[Currency] Refresh failed:', error);
            return { rates: null, isStale: false, lastUpdated: null };
        }
    },

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
     * Convert amount between currencies using USD-based rates.
     * Formula: amount * (rates[to] / rates[from])
     * Assuming rates object where rates[X] = value of X in Base (USD) -> No, rates[X] is X per 1 USD.
     * So 1 USD = rates[to] ToCurrency.
     * 1 USD = rates[from] FromCurrency.
     * Value in USD = amount / rates[from]
     * Value in To = ValueInUSD * rates[to]
     * Result = amount * (rates[to] / rates[from])
     */
    convert: (amount: number, from: string, to: string, rates: Record<string, number>): number => {
        if (from === to) return amount;
        
        const fromRate = from === 'USD' ? 1 : rates[from];
        const toRate = to === 'USD' ? 1 : rates[to];

        if (fromRate === undefined || toRate === undefined) {
             console.warn(`[Currency] Missing rate for conversion: ${from} -> ${to}`);
             return amount; 
        }

        return amount * (toRate / fromRate);
    },

    /**
     * Get currency symbol for a code
     */
    getSymbol: (code: string): string => {
        switch (code) {
            case 'ILS': return '₪';
            case 'USD': return '$';
            case 'EUR': return '€';
            case 'GBP': return '£';
            default: return '$';
        }
    },
    
    // Explicitly expose last updated for UI
    getLastUpdated: (): Date | null => {
         const cacheStr = localStorage.getItem(CACHE_KEY);
         if (!cacheStr) return null;
         try {
             const cache = JSON.parse(cacheStr);
             return new Date(cache.timestamp);
         } catch { return null; }
    }
};
