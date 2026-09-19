import { Cloud, FileKey2, KeyRound, RefreshCw } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { CTASection, FeatureGroup, MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

const icons = [KeyRound, Cloud, FileKey2, RefreshCw];

export default function SecurityPage() {
  const { copy } = useMarketingLanguage();
  return (
    <>
      <MarketingSEO path="/security" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading level={1} eyebrow={copy.security.eyebrow} title={copy.security.title} description={copy.security.intro} /></MarketingContainer></MarketingSection>
      <MarketingSection>
        <MarketingContainer><div className="grid gap-5 md:grid-cols-2">{copy.security.principles.map((group, index) => <FeatureGroup key={group.title} {...group} icon={icons[index]} />)}</div><div className="mt-10 grid gap-5 lg:grid-cols-2"><MarketingCard className="bg-slate-950 p-7 text-white"><h2 className="text-2xl font-semibold">{copy.security.responsibilityTitle}</h2><p className="mt-4 text-sm leading-7 text-slate-300">{copy.security.responsibilityDescription}</p></MarketingCard><MarketingCard className="p-7"><h2 className="text-2xl font-semibold text-slate-950">{copy.security.recoveryTitle}</h2><p className="mt-4 text-sm leading-7 text-slate-600">{copy.security.recoveryDescription}</p></MarketingCard></div></MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}
