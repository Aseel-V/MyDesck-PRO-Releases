import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { CarFront, Plane, ShoppingBasket, Soup } from 'lucide-react';
import { useMarketingAnalytics } from '../analytics/analytics';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import { MarketingBadge } from '../components/primitives';
import {
  industryReadiness, industryScreens, type DemoIndustry, type DemoScreenId,
} from './demoFixtures';
import { ProductVisual } from '../visuals/ProductVisual';

const industries: readonly DemoIndustry[] = ['travel', 'supermarket', 'restaurant', 'auto-repair'];
const icons = { travel: Plane, supermarket: ShoppingBasket, restaurant: Soup, 'auto-repair': CarFront };

interface ProductShowcaseProps {
  initialIndustry?: DemoIndustry;
  initialScreen?: DemoScreenId;
  onChange?: (industry: DemoIndustry, screen: DemoScreenId) => void;
}

export function ProductShowcase({ initialIndustry = 'travel', initialScreen, onChange }: ProductShowcaseProps) {
  const { locale } = useMarketingLanguage();
  const p2 = phase2Content[locale];
  const analytics = useMarketingAnalytics();
  const id = useId().replace(/:/g, '');
  const [industry, setIndustry] = useState<DemoIndustry>(initialIndustry);
  const [screen, setScreen] = useState<DemoScreenId>(initialScreen && industryScreens[initialIndustry].includes(initialScreen) ? initialScreen : industryScreens[initialIndustry][0]);
  const screens = useMemo(() => industryScreens[industry], [industry]);

  const select = (nextIndustry: DemoIndustry, nextScreen: DemoScreenId) => {
    setIndustry(nextIndustry);
    setScreen(nextScreen);
    onChange?.(nextIndustry, nextScreen);
    void analytics.track({ name: 'demo_view', industry: nextIndustry, screen: nextScreen, locale });
  };

  const chooseIndustry = (nextIndustry: DemoIndustry) => select(nextIndustry, industryScreens[nextIndustry][0]);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const visualDelta = event.key === 'ArrowRight' ? 1 : -1;
    const directionDelta = locale === 'en' ? visualDelta : -visualDelta;
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? screens.length - 1 : (index + directionDelta + screens.length) % screens.length;
    const nextScreen = screens[nextIndex];
    select(industry, nextScreen);
    document.getElementById(`${id}-${nextScreen}`)?.focus();
  };

  return (
    <div className="showcase-grid grid gap-7 lg:grid-cols-[minmax(15rem,.56fr)_minmax(0,1.44fr)] lg:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--marketing-accent)]">{p2.demo.chooseIndustry}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1" role="group" aria-label={p2.demo.chooseIndustry}>
          {industries.map((item) => {
            const Icon = icons[item];
            const selected = industry === item;
            const readiness = industryReadiness[item];
            return (
              <button key={item} type="button" aria-pressed={selected} onClick={() => chooseIndustry(item)} className={`min-h-16 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marketing-focus)] ${selected ? 'border-sky-700 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
                <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${selected ? 'text-sky-800' : 'text-slate-500'}`} aria-hidden="true" /><span className="text-sm font-bold text-slate-950">{p2.demo.industries[item]}</span></span>
                <span className={`mt-1.5 block text-[10px] font-semibold ${readiness === 'available' ? 'text-emerald-700' : 'text-amber-800'}`}>{p2.demo.status[readiness]}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/70 p-4">
          <MarketingBadge tone="neutral">{p2.demo.syntheticLabel}</MarketingBadge>
          <p className="mt-3 text-xs leading-5 text-slate-600">{p2.demo.syntheticNote}</p>
        </div>
      </div>
      <div className="min-w-0">
        <div role="tablist" aria-label={p2.demo.chooseView} className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
          {screens.map((item, index) => {
            const selected = screen === item;
            return <button key={item} id={`${id}-${item}`} role="tab" type="button" aria-selected={selected} aria-controls={`${id}-panel`} tabIndex={selected ? 0 : -1} onClick={() => select(industry, item)} onKeyDown={(event) => handleTabKey(event, index)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{p2.demo.screens[item].label}</button>;
          })}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${screen}`}>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div><h3 className="text-xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-2xl">{p2.demo.screens[screen].title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{p2.demo.screens[screen].description}</p></div>
            <span className="shrink-0 text-xs font-semibold text-slate-500" dir="ltr">{screens.indexOf(screen) + 1} / {screens.length}</span>
          </div>
          <ProductVisual screen={screen} />
        </div>
      </div>
    </div>
  );
}
