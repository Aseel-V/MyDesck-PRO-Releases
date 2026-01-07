import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'profile';
  twitterHandle?: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown>; // JSON-LD
}

export default function SEO({ 
  title, 
  description, 
  canonical, 
  ogImage, 
  ogType = 'website', 
  twitterHandle, 
  noindex = false,
  structuredData
}: SEOProps) {
  
  const siteUrl = window.location.origin;
  const defaults = {
    title: "MyDesck PRO - Smart Travel Agency Management",
    description: "The ultimate dashboard for travel agencies. Manage trips, clients, and finances effortlessly.",
    ogImage: `${siteUrl}/favicon.ico`, // Fallback
  };

  const fullTitle = title ? `${title} | MyDesck PRO` : defaults.title;
  const fullDescription = description || defaults.description;
  const fullImage = ogImage ? (ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`) : defaults.ogImage;
  const fullCanonical = canonical ? (canonical.startsWith('http') ? canonical : `${siteUrl}${canonical}`) : siteUrl + window.location.pathname;

  return (
    <Helmet>
      {/* Basic Metadata */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      <link rel="canonical" href={fullCanonical} />

      {/* Robots */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:site_name" content="MyDesck PRO" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={fullImage} />
      {twitterHandle && <meta name="twitter:creator" content={twitterHandle} />}

      {/* Structured Data (JSON-LD) */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}
