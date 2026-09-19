import { Helmet } from 'react-helmet-async';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import {
  canonicalFor,
  getRouteMetadata,
  localeAlternatives,
  publicSiteOrigin,
} from './routeMetadata';

interface MarketingSEOProps {
  path: string;
  faq?: { question: string; answer: string }[];
}

export function MarketingSEO({ path, faq }: MarketingSEOProps) {
  const { locale } = useMarketingLanguage();
  const metadata = getRouteMetadata(path);
  const canonical = canonicalFor(path, locale);
  const title = `${metadata.title[locale]} | MyDesck PRO`;
  const description = metadata.description[locale];
  const ogImage = `${publicSiteOrigin}/og-mydesck-pro.svg`;

  const structuredData: Record<string, unknown>[] = [];

  if (path === '/') {
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'MyDesck PRO',
      url: publicSiteOrigin,
      logo: `${publicSiteOrigin}/favicon.ico`,
      email: 'aseelshaheen621@gmail.com',
    });
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'MyDesck PRO',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Windows',
      url: publicSiteOrigin,
      inLanguage: ['en', 'ar', 'he'],
      description,
    });
  }

  if (faq?.length) {
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return (
    <Helmet>
      <html lang={locale} dir={locale === 'en' ? 'ltr' : 'rtl'} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={metadata.indexable ? 'index, follow' : 'noindex, nofollow'} />
      <link rel="canonical" href={canonical} />
      {localeAlternatives(path).map((alternative) => (
        <link
          key={alternative.hrefLang}
          rel="alternate"
          hrefLang={alternative.hrefLang}
          href={alternative.href}
        />
      ))}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MyDesck PRO" />
      <meta property="og:locale" content={locale === 'en' ? 'en_US' : locale === 'ar' ? 'ar_AR' : 'he_IL'} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {structuredData.map((entry, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(entry)}
        </script>
      ))}
    </Helmet>
  );
}

export function NoIndexSEO({ path }: { path: string }) {
  const { locale } = useMarketingLanguage();
  const metadata = getRouteMetadata(path);
  return (
    <Helmet>
      <html lang={locale} dir={locale === 'en' ? 'ltr' : 'rtl'} />
      <title>{`${metadata.title[locale]} | MyDesck PRO`}</title>
      <meta name="description" content={metadata.description[locale]} />
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}

