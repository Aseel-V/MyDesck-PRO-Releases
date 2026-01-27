import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

import { Language } from '../types/language';

export type { Language };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, options?: any) => string;
  direction: 'ltr' | 'rtl';
  formatCurrency: (amount: number) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile, user } = useAuth();
  const { t, i18n } = useTranslation();

  const language = i18n.language as Language;

  // Sync with profile when it loads
  useEffect(() => {
    if (profile?.preferred_language && profile.preferred_language !== language) {
      i18n.changeLanguage(profile.preferred_language);
    }
  }, [profile, language, i18n]);

  // Update document direction
  useEffect(() => {
    const direction = language === 'ar' || language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    i18n.changeLanguage(lang);

    // Update profile if user is logged in
    if (user) {
      updateProfile({ preferred_language: lang }).catch((err) => {
        console.error('Failed to update preferred_language in profile:', err);
      });
    }
  };

  const direction: 'ltr' | 'rtl' = language === 'ar' || language === 'he' ? 'rtl' : 'ltr';

  const formatCurrency = (amount: number) => {
    // Determine info based on language
    let locale = 'en-US';
    let currency = 'ILS'; // Default to Shekels as per original app, or make dynamic later

    if (language === 'he') {
      locale = 'he-IL-u-nu-latn';
      currency = 'ILS';
    } else if (language === 'ar') {
      locale = 'ar-IL-u-nu-latn'; 
      currency = 'ILS';
    } else {
      // Default EN
      locale = 'en-IL-u-nu-latn'; 
      currency = 'ILS';
    }

    if (language === 'ar') {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).formatToParts(amount);
      
      const currencyPart = parts.find(p => p.type === 'currency');
      const otherParts = parts.filter(p => p.type !== 'currency').map(p => p.value).join('').trim();
      return `${otherParts} ${currencyPart?.value || '₪'}`;
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    }).format(amount);
  };

  const formatDate = (date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) => {
      const d = new Date(date);
      let locale = 'en-IL-u-nu-latn';
      if (language === 'he') locale = 'he-IL-u-nu-latn';
      if (language === 'ar') locale = 'ar-IL-u-nu-latn';
      
      return new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          ...options
      }).format(d);
  };

  const formatTime = (date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) => {
      const d = new Date(date);
      let locale = 'en-IL-u-nu-latn';
      if (language === 'he') locale = 'he-IL-u-nu-latn';
      if (language === 'ar') locale = 'ar-IL-u-nu-latn';

      return new Intl.DateTimeFormat(locale, {
          timeStyle: 'short',
          ...options
      }).format(d);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        direction,
        formatCurrency,
        formatDate,
        formatTime,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
