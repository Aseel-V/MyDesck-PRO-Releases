import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

// Define Language type based on supported languages
export type Language = 'en' | 'ar' | 'he';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, options?: any) => string;
  direction: 'ltr' | 'rtl';
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

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        direction,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
