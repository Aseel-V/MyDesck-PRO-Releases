import {
  BarChart3,
  Building2,
  Calculator,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Files,
  Landmark,
  Plane,
  ReceiptText,
  ShieldCheck,
  ShoppingBasket,
  Soup,
  WalletCards,
  Globe2,
  MonitorSmartphone,
  LockKeyhole,
  FileDown,
  Workflow,
  RefreshCw,
} from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { MarketingSEO } from '../seo/MarketingSEO';
import { industryReadiness } from '../routes/routeModel';
import {
  CTASection,
  CheckList,
  FAQ,
  FeatureGroup,
  IndustryBadge,
  MarketingButton,
  MarketingCard,
  MarketingContainer,
  MarketingSection,
  SectionHeading,
} from '../components/primitives';
import { ProductVisual } from '../visuals/ProductVisual';
import { ProductShowcase } from '../demo/ProductShowcase';
import { phase2Content } from '../content/phase2Content';

const capabilityIcons = [ClipboardList, WalletCards, Landmark, Files];
const industryIcons = { 'travel-agencies': Plane, supermarkets: ShoppingBasket, restaurants: Soup, 'auto-repair': CarFront };
const trustIcons = [Globe2, MonitorSmartphone, LockKeyhole, FileDown, Workflow, RefreshCw];

export default function HomePage() {
  const { copy, locale } = useMarketingLanguage();
  const phase2 = phase2Content[locale];
  const industryCopies = [
    copy.solutionsBySlug['travel-agencies'],
    copy.solutionsBySlug.supermarkets,
    copy.solutionsBySlug.restaurants,
    copy.solutionsBySlug['auto-repair'],
  ];

  return (
    <>
      <MarketingSEO path="/" faq={copy.home.faqs} />
      <section className="relative overflow-hidden border-b border-slate-200 bg-[var(--marketing-hero)] pb-14 pt-14 sm:pb-20 sm:pt-20 lg:pb-24 lg:pt-24">
        <div className="marketing-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <MarketingContainer className="relative">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-900 shadow-sm"><span className="h-2 w-2 rounded-full bg-sky-600" aria-hidden="true" />{copy.home.eyebrow}</div>
            <h1 className="mt-6 text-[2.65rem] font-semibold leading-[1.04] tracking-[-0.055em] text-[var(--marketing-ink)] sm:text-6xl lg:text-[4.5rem]">{copy.home.heroTitle}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[var(--marketing-muted-text)] sm:text-xl">{copy.home.heroDescription}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <MarketingButton to="/contact?intent=trial">{copy.common.requestAccess}</MarketingButton>
              <MarketingButton to="/features" variant="secondary">{copy.common.exploreProduct}</MarketingButton>
            </div>
          </div>
          <div className="mx-auto mt-12 max-w-6xl lg:mt-16"><ProductVisual screen="travel-dashboard" /></div>
        </MarketingContainer>
      </section>

      <MarketingSection>
        <MarketingContainer>
          <SectionHeading eyebrow={phase2.demo.eyebrow} title={phase2.demo.title} description={phase2.demo.intro} />
          <div className="mt-10"><ProductShowcase /></div>
          <div className="mt-6 text-center"><MarketingButton to="/demo" variant="secondary">{phase2.nav.productTour}</MarketingButton></div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection tone="soft">
        <MarketingContainer>
          <SectionHeading eyebrow={phase2.trust.eyebrow} title={phase2.trust.title} description={phase2.trust.intro} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{phase2.trust.items.map((item, index) => { const Icon = trustIcons[index]; return <MarketingCard key={item.title} className="p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--marketing-icon-bg)] text-[var(--marketing-primary)]"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold text-slate-950">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p></MarketingCard>; })}</div>
        </MarketingContainer>
      </MarketingSection>

      <section aria-label="Product facts" className="border-b border-slate-200 bg-white py-6">
        <MarketingContainer>
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-center text-xs font-bold text-slate-600 sm:text-sm">
            {copy.home.credibility.map((item) => <li key={item} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />{item}</li>)}
          </ul>
        </MarketingContainer>
      </section>

      <MarketingSection>
        <MarketingContainer>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading eyebrow={copy.home.problemEyebrow} title={copy.home.problemTitle} description={copy.home.problemDescription} />
              <div className="mt-7 flex flex-wrap gap-2">{copy.home.scattered.map((item) => <span key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{item}</span>)}</div>
            </div>
            <MarketingCard className="relative overflow-hidden border-slate-800 bg-slate-950 p-7 text-white sm:p-9">
              <div className="marketing-grid absolute inset-0 opacity-20" aria-hidden="true" />
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300"><Building2 className="h-6 w-6" aria-hidden="true" /></div>
                <h2 className="mt-6 text-2xl font-semibold sm:text-3xl">{copy.home.solutionTitle}</h2>
                <p className="mt-4 text-base leading-7 text-slate-300">{copy.home.solutionDescription}</p>
              </div>
            </MarketingCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection tone="soft">
        <MarketingContainer>
          <SectionHeading eyebrow={copy.home.capabilitiesEyebrow} title={copy.home.capabilitiesTitle} description={copy.home.capabilitiesIntro} />
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {copy.home.capabilities.map((group, index) => <FeatureGroup key={group.title} {...group} icon={capabilityIcons[index]} />)}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <SectionHeading eyebrow={copy.home.industriesEyebrow} title={copy.home.industriesTitle} description={copy.home.industriesIntro} />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {industryCopies.map((industry) => {
              const Icon = industryIcons[industry.slug];
              const readiness = industryReadiness[industry.slug];
              return (
                <MarketingCard key={industry.slug} className="flex flex-col p-7">
                  <div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><Icon className="h-6 w-6" aria-hidden="true" /></div><IndustryBadge readiness={readiness}>{readiness === 'available' ? copy.common.available : copy.common.earlyAccess}</IndustryBadge></div>
                  <h3 className="mt-6 text-2xl font-semibold text-[var(--marketing-ink)]">{industry.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-[var(--marketing-muted-text)]">{industry.summary}</p>
                  <MarketingButton to={`/solutions/${industry.slug}`} variant="text" className="mt-4 self-start">{copy.common.learnMore}</MarketingButton>
                </MarketingCard>
              );
            })}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection tone="dark">
        <MarketingContainer>
          <SectionHeading eyebrow={copy.home.howEyebrow} title={copy.home.howTitle} inverse />
          <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {copy.home.steps.map((step, index) => <li key={step.title} className="rounded-2xl border border-slate-700 bg-slate-900 p-6"><span className="text-sm font-bold text-sky-300">0{index + 1}</span><h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p></li>)}
          </ol>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div><SectionHeading eyebrow={copy.home.financeEyebrow} title={copy.home.financeTitle} description={copy.home.financeDescription} /><CheckList items={copy.home.financeItems} columns={2} /><p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{copy.home.financeNote}</p></div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{copy.home.financeItems.slice(0, 4).map((item, index) => <div key={item} className="rounded-xl border border-slate-200 bg-white p-4"><Calculator className="h-5 w-5 text-sky-700" aria-hidden="true" /><p className="mt-5 text-xs font-semibold text-slate-500">{item}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950" dir="ltr">{index === 0 ? '84%' : index === 1 ? '42K' : index === 2 ? '18K' : '12K'}</p></div>)}</div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{copy.home.financeItems[6]}</span><ReceiptText className="h-5 w-5 text-slate-400" aria-hidden="true" /></div><div className="mt-5 flex h-24 items-end gap-2" aria-hidden="true">{[44, 68, 52, 84, 64, 91, 76, 96].map((height, index) => <span key={index} className="flex-1 rounded-t bg-sky-700/80" style={{ height: `${height}%` }} />)}</div></div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection tone="soft">
        <MarketingContainer className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 grid grid-cols-2 gap-3 lg:order-1">{copy.home.reportingItems.map((item, index) => <MarketingCard key={item} className={index === 0 ? 'col-span-2' : ''}><BarChart3 className="h-5 w-5 text-sky-700" aria-hidden="true" /><p className="mt-7 text-sm font-bold text-slate-900">{item}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-700" style={{ width: `${58 + index * 8}%` }} /></div></MarketingCard>)}</div>
          <div className="order-1 lg:order-2"><SectionHeading eyebrow={copy.home.reportingEyebrow} title={copy.home.reportingTitle} description={copy.home.reportingDescription} /><CheckList items={copy.home.reportingItems} /></div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div><SectionHeading eyebrow={copy.home.securityEyebrow} title={copy.home.securityTitle} description={copy.home.securityDescription} /><CheckList items={copy.home.securityItems} columns={2} /><MarketingButton to="/security" variant="text" className="mt-6">{copy.common.learnMore}</MarketingButton></div>
          <MarketingCard className="border-slate-800 bg-slate-950 p-7 text-white"><ShieldCheck className="h-9 w-9 text-emerald-300" aria-hidden="true" /><div className="mt-7 space-y-4">{copy.home.securityItems.map((item) => <div key={item} className="flex items-center gap-3 border-b border-slate-800 pb-4 last:border-0 last:pb-0"><CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" /><span className="text-sm font-semibold text-slate-200">{item}</span></div>)}</div></MarketingCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection tone="soft">
        <MarketingContainer className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <SectionHeading eyebrow={copy.home.pricingEyebrow} title={copy.home.pricingTitle} description={copy.home.pricingDescription} />
          <MarketingCard className="p-7 sm:p-9"><div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"><div><span className="text-sm font-bold text-sky-800">MyDesck PRO</span><h3 className="mt-2 text-2xl font-semibold text-slate-950">{copy.home.pricingTitle}</h3></div><MarketingButton to="/contact?intent=trial">{copy.common.requestTrial}</MarketingButton></div><CheckList items={copy.home.pricingItems} columns={2} /><MarketingButton to="/pricing" variant="text" className="mt-6">{copy.nav.pricing}</MarketingButton></MarketingCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer><SectionHeading eyebrow={copy.home.faqEyebrow} title={copy.home.faqTitle} align="center" /><FAQ items={copy.home.faqs} /></MarketingContainer>
      </MarketingSection>
      <CTASection eyebrow={copy.home.finalEyebrow} title={copy.home.finalTitle} description={copy.home.finalDescription} />
    </>
  );
}
