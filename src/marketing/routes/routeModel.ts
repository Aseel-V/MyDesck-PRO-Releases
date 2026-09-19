export const supportedLocales = ['en', 'ar', 'he'] as const;
export type MarketingLocale = (typeof supportedLocales)[number];

export const defaultLocale: MarketingLocale = 'en';

export const marketingPaths = [
  '/',
  '/features',
  '/solutions',
  '/solutions/travel-agencies',
  '/solutions/supermarkets',
  '/solutions/restaurants',
  '/solutions/auto-repair',
  '/pricing',
  '/security',
  '/privacy',
  '/terms',
  '/contact',
] as const;

export type MarketingPath = (typeof marketingPaths)[number];

export const applicationPaths = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/dashboard',
] as const;

export type ApplicationPath = (typeof applicationPaths)[number];
export type PublicPath = MarketingPath | ApplicationPath;

export interface LocalizedLocation {
  locale: MarketingLocale;
  basePath: string;
}

export function isMarketingLocale(value: string | undefined): value is MarketingLocale {
  return supportedLocales.includes(value as MarketingLocale);
}

export function normalizePathname(pathname: string): string {
  const clean = `/${pathname}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return clean === '' ? '/' : clean;
}

export function parseLocalizedPath(pathname: string): LocalizedLocation {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);
  const possibleLocale = segments[0];

  if (isMarketingLocale(possibleLocale) && possibleLocale !== defaultLocale) {
    const remainder = `/${segments.slice(1).join('/')}`;
    return {
      locale: possibleLocale,
      basePath: normalizePathname(remainder),
    };
  }

  return { locale: defaultLocale, basePath: normalized };
}

export function localizePath(pathname: string, locale: MarketingLocale): string {
  const { basePath } = parseLocalizedPath(pathname);
  if (locale === defaultLocale) return basePath;
  return basePath === '/' ? `/${locale}` : `/${locale}${basePath}`;
}

const legacyHashDestinations: Record<string, PublicPath> = {
  '/': '/',
  '/solutions': '/solutions',
  '/solutions/trip': '/solutions/travel-agencies',
  '/solutions/market': '/solutions/supermarkets',
  '/solutions/food': '/solutions/restaurants',
  '/safety-support': '/security',
  '/login': '/login',
  '/forgot-password': '/forgot-password',
  '/reset-password': '/reset-password',
  '/dashboard': '/dashboard',
};

export function resolveLegacyHash(hash: string): PublicPath | null {
  if (!hash.startsWith('#/')) return null;
  const [rawPath] = hash.slice(1).split('?');
  return legacyHashDestinations[normalizePathname(rawPath)] ?? null;
}

export function legacyHashSearch(hash: string): string {
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0 ? hash.slice(queryIndex) : '';
}

export const industryReadiness = {
  'travel-agencies': 'available',
  supermarkets: 'available',
  restaurants: 'early-access',
  'auto-repair': 'early-access',
} as const;

export type IndustrySlug = keyof typeof industryReadiness;
export type IndustryReadiness = (typeof industryReadiness)[IndustrySlug];

export function isPublicIndustry(value: string): value is IndustrySlug {
  return Object.prototype.hasOwnProperty.call(industryReadiness, value);
}

