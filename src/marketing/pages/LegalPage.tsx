import { FileCheck2 } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { CheckList, MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

// Legal-review marker: this initial operational copy must be reviewed by qualified counsel before
// being treated as a complete jurisdiction-specific privacy policy or contractual agreement.
export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { copy } = useMarketingLanguage();
  const title = kind === 'privacy' ? copy.legal.privacyTitle : copy.legal.termsTitle;
  const intro = kind === 'privacy' ? copy.legal.privacyIntro : copy.legal.termsIntro;
  const sections = kind === 'privacy' ? copy.legal.privacySections : copy.legal.termsSections;
  const path = kind === 'privacy' ? '/privacy' : '/terms';
  return (
    <>
      <MarketingSEO path={path} />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading eyebrow="MyDesck PRO" title={title} description={intro} /></MarketingContainer></MarketingSection>
      <MarketingSection><MarketingContainer className="max-w-5xl"><div className="space-y-5">{sections.map((section) => <MarketingCard key={section.title} className="p-7 sm:p-8"><div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><FileCheck2 className="h-5 w-5" aria-hidden="true" /></div><div><h2 className="text-xl font-semibold text-slate-950">{section.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{section.description}</p><CheckList items={section.items} /></div></div></MarketingCard>)}</div></MarketingContainer></MarketingSection>
    </>
  );
}

