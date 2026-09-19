import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, ClipboardList, FileText, WalletCards } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { isPublicIndustry, type IndustrySlug } from '../routes/routeModel';
import { CTASection, FeatureGroup, IndustryBadge, MarketingButton, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';
import { ProductVisual } from '../visuals/ProductVisual';
import type { DemoScreenId } from '../demo/demoFixtures';
import NotFoundPage from './NotFoundPage';
import { useMarketingAnalytics } from '../analytics/analytics';

const icons = [ClipboardList, WalletCards, FileText, BarChart3];
const screens: Record<IndustrySlug, DemoScreenId> = {
  'travel-agencies': 'travel-dashboard', supermarkets: 'supermarket-pos', restaurants: 'restaurant-floor', 'auto-repair': 'auto-repair-order',
};

export default function SolutionDetailPage() {
  const { slug = '' } = useParams();
  const { copy, locale } = useMarketingLanguage();
  const analytics = useMarketingAnalytics();
  useEffect(() => {
    if (isPublicIndustry(slug)) void analytics.track({ name: 'solution_view', solution: slug, locale });
  }, [analytics, locale, slug]);
  if (!isPublicIndustry(slug)) return <NotFoundPage />;
  const solution = copy.solutionsBySlug[slug];
  const isAvailable = slug === 'travel-agencies' || slug === 'supermarkets';
  const metadataPath = `/solutions/${slug}`;
  return (
    <>
      <MarketingSEO path={metadataPath} />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-14 sm:pt-20">
        <MarketingContainer className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div><IndustryBadge readiness={isAvailable ? 'available' : 'early-access'}>{solution.status}</IndustryBadge><p className="mt-5 text-sm font-bold uppercase tracking-[0.14em] text-sky-800">{solution.eyebrow}</p><h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">{solution.title}</h1><p className="mt-6 text-lg leading-8 text-slate-600">{solution.summary}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><MarketingButton to="/contact?intent=trial">{copy.common.requestAccess}</MarketingButton><MarketingButton to="/features" variant="secondary">{copy.common.exploreProduct}</MarketingButton></div></div>
          <ProductVisual screen={screens[slug]} />
        </MarketingContainer>
      </MarketingSection>
      <MarketingSection>
        <MarketingContainer><SectionHeading eyebrow={solution.eyebrow} title={solution.workflowTitle} description={solution.summary} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{solution.workflows.map((group, index) => <FeatureGroup key={group.title} {...group} icon={icons[index]} />)}</div><div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm leading-7 text-slate-700">{solution.closing}</div></MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}
