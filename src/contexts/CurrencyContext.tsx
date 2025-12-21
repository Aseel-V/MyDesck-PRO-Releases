import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { CurrencyService } from '../lib/currency';

interface CurrencyContextType {
    currency: string; // User's preferred currency (for display target)
    rates: Record<string, number> | null;
    isLoading: boolean;
    isStale: boolean;
    lastUpdated: Date | null;
    convert: (amount: number, from: string, to: string) => number;
    format: (amount: number, from: string, to?: string) => string;
    refresh: () => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const { profile } = useAuth();
    const [rates, setRates] = useState<Record<string, number> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStale, setIsStale] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const userPreferredCurrency = profile?.preferred_currency || 'USD';

    const loadRates = async () => {
        setIsLoading(true);
        const { rates: ratesData, isStale: stale, lastUpdated: updated } = await CurrencyService.getRates('USD');
        
        if (ratesData) {
            setRates(ratesData.rates);
            setIsStale(stale);
            setLastUpdated(updated ? new Date(updated) : null);
        } else {
            // No rates available (error state)
            setRates(null);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadRates();
    }, []);

    const convert = useCallback((amount: number, from: string, to: string): number => {
        if (!rates) return amount; // No conversion if rates missing
        return CurrencyService.convert(amount, from, to, rates);
    }, [rates]);

    const format = useCallback((amount: number, from: string, to: string = userPreferredCurrency): string => {
        const convertedAmount = convert(amount, from, to);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: to,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(convertedAmount);
    }, [convert, userPreferredCurrency]);

    const refresh = async () => {
        await loadRates();
    };

    return (
        <CurrencyContext.Provider value={{ 
            currency: userPreferredCurrency, 
            rates, 
            isLoading, 
            isStale,
            lastUpdated,
            convert, 
            format, 
            refresh 
        }}>
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
