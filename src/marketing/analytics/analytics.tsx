import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { IndustrySlug, MarketingLocale } from '../routes/routeModel';

export type MarketingAnalyticsEvent =
  | { name: 'page_view'; path: string; locale: MarketingLocale }
  | { name: 'cta_click'; cta: string; destination: string; locale: MarketingLocale }
  | { name: 'solution_view'; solution: IndustrySlug; locale: MarketingLocale }
  | { name: 'pricing_view'; locale: MarketingLocale }
  | { name: 'request_access_start'; intent: string; locale: MarketingLocale }
  | { name: 'request_access_complete'; intent: string; locale: MarketingLocale; delivery: 'mailto'; stored: false }
  | { name: 'contact_intent'; intent: string; locale: MarketingLocale }
  | { name: 'language_change'; from: MarketingLocale; to: MarketingLocale }
  | { name: 'login_click'; locale: MarketingLocale }
  | { name: 'demo_view'; industry: string; screen: string; locale: MarketingLocale };

export interface AnalyticsAdapter {
  track(event: MarketingAnalyticsEvent): void | Promise<void>;
}

export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(event: MarketingAnalyticsEvent): void {
    void event;
    // Privacy-conscious default: deliberately no network, cookies, or storage.
  }
}

const defaultAdapter = new NoopAnalyticsAdapter();
const AnalyticsContext = createContext<AnalyticsAdapter>(defaultAdapter);

export function MarketingAnalyticsProvider({ children, adapter = defaultAdapter }: { children: ReactNode; adapter?: AnalyticsAdapter }) {
  const value = useMemo(() => adapter, [adapter]);
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useMarketingAnalytics(): AnalyticsAdapter {
  return useContext(AnalyticsContext);
}

export function MarketingPageView({ locale }: { locale: MarketingLocale }) {
  const analytics = useMarketingAnalytics();
  const location = useLocation();
  useEffect(() => {
    void analytics.track({ name: 'page_view', path: location.pathname, locale });
  }, [analytics, locale, location.pathname]);
  return null;
}
