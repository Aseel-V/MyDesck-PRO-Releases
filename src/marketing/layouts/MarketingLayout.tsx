import { Outlet } from 'react-router-dom';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { MarketingFooter } from '../components/MarketingFooter';
import { MarketingHeader } from '../components/MarketingHeader';

export function MarketingLayout() {
  const { copy, direction } = useMarketingLanguage();
  return (
    <div className="marketing-root min-h-[100dvh] bg-white text-[var(--marketing-body)]" dir={direction}>
      <a href="#main-content" className="fixed start-4 top-3 z-50 -translate-y-20 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform focus:translate-y-0">{copy.skip}</a>
      <MarketingHeader />
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <MarketingFooter />
    </div>
  );
}

