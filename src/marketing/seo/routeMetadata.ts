import metadataJson from './routeMetadata.json';
import {
  defaultLocale,
  localizePath,
  type MarketingLocale,
} from '../routes/routeModel';

export type StructuredDataType =
  | 'Organization'
  | 'SoftwareApplication'
  | 'Organization+SoftwareApplication+FAQPage'
  | 'WebPage'
  | 'ContactPage';

export interface RouteMetadata {
  path: string;
  indexable: boolean;
  structuredDataType: StructuredDataType;
  title: Record<MarketingLocale, string>;
  description: Record<MarketingLocale, string>;
}

export const routeMetadata = metadataJson as RouteMetadata[];

export const publicSiteOrigin = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://my-desck-pro.vercel.app'
).replace(/\/$/, '');

export function getRouteMetadata(path: string): RouteMetadata {
  return routeMetadata.find((entry) => entry.path === path) ?? routeMetadata[0];
}

export function canonicalFor(path: string, locale: MarketingLocale): string {
  return `${publicSiteOrigin}${localizePath(path, locale)}`;
}

export function localeAlternatives(path: string) {
  return [
    { locale: 'en' as const, hrefLang: 'en', href: canonicalFor(path, 'en') },
    { locale: 'ar' as const, hrefLang: 'ar', href: canonicalFor(path, 'ar') },
    { locale: 'he' as const, hrefLang: 'he', href: canonicalFor(path, 'he') },
    { locale: defaultLocale, hrefLang: 'x-default', href: canonicalFor(path, defaultLocale) },
  ];
}
