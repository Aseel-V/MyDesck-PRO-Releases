import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import { useMarketingAnalytics } from '../analytics/analytics';
import { CTASection, CheckList, MarketingButton, MarketingCard, MarketingContainer, MarketingSection, SectionHeading } from '../components/primitives';
import { MarketingSEO } from '../seo/MarketingSEO';

export default function PricingPage() {
  const { copy, locale } = useMarketingLanguage();
  const phase2 = phase2Content[locale];
  const analytics = useMarketingAnalytics();
  useEffect(() => { void analytics.track({ name: 'pricing_view', locale }); }, [analytics, locale]);
  return (
    <>
      <MarketingSEO path="/pricing" />
      <MarketingSection className="border-b border-slate-200 bg-[var(--marketing-hero)] pt-16 sm:pt-20"><MarketingContainer><SectionHeading level={1} eyebrow={copy.pricing.eyebrow} title={copy.pricing.title} description={copy.pricing.intro} /></MarketingContainer></MarketingSection>
      <MarketingSection>
        <MarketingContainer className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <MarketingCard className="border-slate-300 p-7 sm:p-10"><p className="text-sm font-bold text-sky-800">{copy.pricing.eyebrow}</p><h2 className="mt-3 text-3xl font-semibold text-slate-950">{copy.pricing.cardTitle}</h2><p className="mt-4 max-w-xl text-base leading-7 text-slate-600">{copy.pricing.cardDescription}</p><h3 className="mt-8 text-sm font-bold uppercase tracking-[0.12em] text-slate-500">{copy.pricing.includedTitle}</h3><CheckList items={copy.pricing.included} /><div className="mt-8 flex flex-col gap-3 sm:flex-row"><MarketingButton to="/contact?intent=trial">{copy.common.requestTrial}</MarketingButton><MarketingButton to="/contact?intent=sales" variant="secondary">{copy.common.contactSales}</MarketingButton></div><p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{copy.pricing.note}</p></MarketingCard>
          <div><h2 className="text-2xl font-semibold text-slate-950">{copy.pricing.processTitle}</h2><ol className="mt-6 space-y-4">{copy.pricing.process.map((step, index) => <li key={step.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">{index + 1}</span><div><h3 className="font-semibold text-slate-950">{step.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p></div></li>)}</ol><div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{copy.contact.truth}</div></div>
        </MarketingContainer>
      </MarketingSection>
      <MarketingSection tone="soft">
        <MarketingContainer>
          <SectionHeading eyebrow={phase2.pricing.matrixEyebrow} title={phase2.pricing.matrixTitle} description={phase2.pricing.matrixIntro} />
          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[48rem] border-collapse text-start text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-950 text-white"><th scope="col" className="px-5 py-4 text-start font-semibold">{phase2.pricing.capability}</th><th scope="col" className="px-5 py-4 text-start font-semibold">{phase2.pricing.details}</th><th scope="col" className="px-5 py-4 text-start font-semibold">{phase2.pricing.availability}</th><th scope="col" className="px-5 py-4 text-start font-semibold">{phase2.pricing.notes}</th></tr></thead>
              <tbody>{phase2.pricing.rows.map((row) => <tr key={row.area} className="border-b border-slate-100 last:border-0"><th scope="row" className="px-5 py-4 text-start font-semibold text-slate-950">{row.area}</th><td className="px-5 py-4 text-slate-700">{row.capability}</td><td className="px-5 py-4"><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-900">{row.availability}</span></td><td className="px-5 py-4 leading-6 text-slate-600">{row.notes}</td></tr>)}</tbody>
            </table>
          </div>
        </MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}
