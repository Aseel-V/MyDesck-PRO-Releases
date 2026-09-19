import { CarFront, Plane, ShoppingBasket, Soup } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { industryReadiness } from '../routes/routeModel';
import { CTASection, IndustryBadge, MarketingButton, MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

const icons = { 'travel-agencies': Plane, supermarkets: ShoppingBasket, restaurants: Soup, 'auto-repair': CarFront };

export default function SolutionsPage() {
  const { copy } = useMarketingLanguage();
  const solutions = Object.values(copy.solutionsBySlug);
  return (
    <>
      <MarketingSEO path="/solutions" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading eyebrow={copy.solutions.eyebrow} title={copy.solutions.title} description={copy.solutions.intro} /></MarketingContainer></MarketingSection>
      <MarketingSection>
        <MarketingContainer>
          <div className="grid gap-6 md:grid-cols-2">{solutions.map((solution) => {
            const Icon = icons[solution.slug];
            const readiness = industryReadiness[solution.slug];
            return <MarketingCard key={solution.slug} className="flex min-h-[21rem] flex-col p-7 sm:p-8"><div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><Icon className="h-6 w-6" aria-hidden="true" /></div><IndustryBadge readiness={readiness}>{readiness === 'available' ? copy.common.available : copy.common.earlyAccess}</IndustryBadge></div><h2 className="mt-7 text-2xl font-semibold text-slate-950">{solution.title}</h2><p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{solution.summary}</p><MarketingButton to={`/solutions/${solution.slug}`} variant="text" className="mt-5 self-start">{copy.common.learnMore}</MarketingButton></MarketingCard>;
          })}</div>
          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6"><h2 className="text-xl font-semibold text-slate-950">{copy.solutions.readinessTitle}</h2><p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">{copy.solutions.readinessDescription}</p></div>
        </MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}

