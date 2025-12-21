import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { CurrencyService } from '../lib/currency';

interface CurrencyContextType {
    currency: string;
    rates: Record<string, number> | null;
    isLoading: boolean;
    convert: (amount: number, toCurrency?: string) => number;
    format: (amount: number, currencyCode?: string) => string;
    refresh: () => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const { profile } = useAuth();
    const [rates, setRates] = useState<Record<string, number> | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const currency = profile?.preferred_currency || 'USD';

    useEffect(() => {
        const initCurrency = async () => {
            setIsLoading(true);
            try {
                const data = await CurrencyService.getCachedOrFetchRates('USD');
                if (data) setRates(data.rates);
            } catch (error) {
                console.error('Failed to initialize currency service', error);
            } finally {
                setIsLoading(false);
            }
        };
        initCurrency();
    }, []);

    const convert = (amount: number, toCurrency: string = currency): number => {
        if (!rates || toCurrency === 'USD') return amount;
        const rate = rates[toCurrency];
        return rate ? amount * rate : amount;
    };

    const format = (amount: number, currencyCode: string = currency): string => {
        const convertedAmount = convert(amount, currencyCode);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(convertedAmount);
    };

    const refresh = async () => {
        setIsLoading(true);
        await CurrencyService.refreshRates('USD');
        const data = await CurrencyService.getCachedOrFetchRates('USD');
        if (data) setRates(data.rates);
        setIsLoading(false);
    };

    return (
        <CurrencyContext.Provider value={{ currency, rates, isLoading, convert, format, refresh }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
}
