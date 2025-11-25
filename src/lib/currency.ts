
interface ExchangeRates {
    amount: number;
    base: string;
    date: string;
    rates: Record<string, number>;
}

const BASE_URL = 'https://api.frankfurter.app';

export const CurrencyService = {
    /**
     * Fetch current exchange rates for a base currency
     */
    getLatestRates: async (base: string = 'USD'): Promise<ExchangeRates | null> => {
        try {
            const response = await fetch(`${BASE_URL}/latest?from=${base}`);
            if (!response.ok) throw new Error('Failed to fetch rates');
            return await response.json();
        } catch (error) {
            console.error('Error fetching latest rates:', error);
            return null;
        }
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
            const rates = await CurrencyService.getLatestRates(from);
            if (!rates || !rates.rates[to]) return null;
            return amount * rates.rates[to];
        } catch (error) {
            console.error('Conversion error:', error);
            return null;
        }
    }
};
