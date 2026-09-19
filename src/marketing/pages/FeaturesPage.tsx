import { BarChart3, Briefcase, FileText, Receipt, Settings2, Users, WalletCards, Workflow } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { CTASection, FeatureGroup, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

const icons = [Workflow, Users, Receipt, WalletCards, Briefcase, FileText, BarChart3, Settings2];

export default function FeaturesPage() {
  const { copy } = useMarketingLanguage();
  return (
    <>
      <MarketingSEO path="/features" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20">
        <MarketingContainer><SectionHeading level={1} eyebrow={copy.features.eyebrow} title={copy.features.title} description={copy.features.intro} /></MarketingContainer>
      </MarketingSection>
      <MarketingSection>
        <MarketingContainer>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{copy.features.groups.map((group, index) => <FeatureGroup key={group.title} {...group} icon={icons[index]} />)}</div>
          <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-semibold text-amber-950">{copy.features.scopeTitle}</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-amber-900">{copy.features.scopeDescription}</p></div>
        </MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}
