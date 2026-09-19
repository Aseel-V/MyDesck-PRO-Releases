import { useState } from 'react';
import { ArrowLeft, ArrowRight, DatabaseZap } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ProductShowcase } from '../demo/ProductShowcase';
import { industryScreens, isDemoIndustry, isDemoScreenId, type DemoIndustry, type DemoScreenId } from '../demo/demoFixtures';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import { MarketingButton, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

export default function DemoPage() {
  const { locale } = useMarketingLanguage();
  const p2 = phase2Content[locale];
  const [searchParams, setSearchParams] = useSearchParams();
  const queryIndustry = searchParams.get('industry');
  const queryScreen = searchParams.get('view');
  const initialIndustry: DemoIndustry = isDemoIndustry(queryIndustry) ? queryIndustry : 'travel';
  const initialScreen: DemoScreenId = isDemoScreenId(queryScreen) && industryScreens[initialIndustry].includes(queryScreen) ? queryScreen : industryScreens[initialIndustry][0];
  const [selection, setSelection] = useState({ industry: initialIndustry, screen: initialScreen });
  const screens = industryScreens[selection.industry];
  const screenIndex = screens.indexOf(selection.screen);

  const update = (industry: DemoIndustry, screen: DemoScreenId) => {
    setSelection({ industry, screen });
    setSearchParams({ industry, view: screen }, { replace: true });
  };
  const step = (delta: number) => {
    const nextIndex = (screenIndex + delta + screens.length) % screens.length;
    update(selection.industry, screens[nextIndex]);
  };

  return (
    <>
      <MarketingSEO path="/demo" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20">
        <MarketingContainer>
          <SectionHeading level={1} eyebrow={p2.demo.eyebrow} title={p2.demo.title} description={p2.demo.intro} />
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-200 bg-white/80 p-4 text-sm leading-6 text-slate-700"><DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-sky-800" aria-hidden="true" /><p>{p2.demo.syntheticNote}</p></div>
        </MarketingContainer>
      </MarketingSection>
      <MarketingSection>
        <MarketingContainer>
          <ProductShowcase key={`${selection.industry}-${selection.screen}`} initialIndustry={selection.industry} initialScreen={selection.screen} onChange={update} />
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{p2.demo.guidedTour}</p><p className="mt-1 text-sm font-semibold text-slate-900">{p2.demo.step} <span dir="ltr">{screenIndex + 1}</span> {p2.demo.of} <span dir="ltr">{screens.length}</span></p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => step(-1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{p2.demo.previous}</button>
              <button type="button" onClick={() => step(1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">{p2.demo.next}<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></button>
              <MarketingButton to={`/contact?intent=demo&businessType=${selection.industry}`}>{p2.demo.requestCta}</MarketingButton>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
}
