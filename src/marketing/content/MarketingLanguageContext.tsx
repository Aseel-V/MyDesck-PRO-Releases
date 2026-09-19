import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import i18n from '../../lib/i18n';
import { siteContent, type MarketingCopy } from './siteContent';
import {
  localizePath,
  parseLocalizedPath,
  type MarketingLocale,
} from '../routes/routeModel';

interface MarketingLanguageValue {
  locale: MarketingLocale;
  direction: 'ltr' | 'rtl';
  copy: MarketingCopy;
  setLocale: (locale: MarketingLocale) => void;
}

const MarketingLanguageContext = createContext<MarketingLanguageValue | null>(null);

export function MarketingLanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale } = parseLocalizedPath(location.pathname);
  const direction = locale === 'en' ? 'ltr' : 'rtl';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.documentElement.dataset.marketingLocale = locale;
    localStorage.setItem('elite_travels_language', locale);
    void i18n.changeLanguage(locale);

    return () => {
      delete document.documentElement.dataset.marketingLocale;
    };
  }, [direction, locale]);

  const value = useMemo<MarketingLanguageValue>(() => ({
    locale,
    direction,
    copy: siteContent[locale],
    setLocale: (nextLocale) => {
      const nextPath = localizePath(location.pathname, nextLocale);
      navigate(`${nextPath}${location.search}${location.hash}`);
    },
  }), [direction, locale, location.hash, location.pathname, location.search, navigate]);

  return (
    <MarketingLanguageContext.Provider value={value}>
      {children}
    </MarketingLanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMarketingLanguage(): MarketingLanguageValue {
  const context = useContext(MarketingLanguageContext);
  if (!context) throw new Error('useMarketingLanguage must be used inside MarketingLanguageProvider');
  return context;
}

