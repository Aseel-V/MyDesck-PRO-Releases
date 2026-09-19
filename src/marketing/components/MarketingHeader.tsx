import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { localizePath, parseLocalizedPath } from '../routes/routeModel';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MarketingButton, MarketingContainer } from './primitives';

export function MarketingHeader() {
  const { copy, locale } = useMarketingLanguage();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { basePath } = parseLocalizedPath(location.pathname);
  const links = [
    { label: copy.nav.features, path: '/features' },
    { label: copy.nav.solutions, path: '/solutions' },
    { label: copy.nav.pricing, path: '/pricing' },
    { label: copy.nav.security, path: '/security' },
  ];

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm">
      <MarketingContainer className="flex min-h-[4.5rem] items-center gap-4">
        <Link to={localizePath('/', locale)} aria-label="MyDesck PRO" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
          <img src="/favicon.ico" width="36" height="36" alt="" className="h-9 w-9 rounded-[0.65rem]" />
          <span className="whitespace-nowrap text-[1.05rem] font-bold tracking-[-0.025em] text-slate-950">MyDesck <span className="text-sky-700">PRO</span></span>
        </Link>
        <nav aria-label="Primary" className="ms-auto hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const active = basePath === link.path || (link.path === '/solutions' && basePath.startsWith('/solutions/'));
            return <Link key={link.path} to={localizePath(link.path, locale)} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>{link.label}</Link>;
          })}
        </nav>
        <div className="ms-auto hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          <Link to={localizePath('/login', locale)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{copy.nav.login}</Link>
          <MarketingButton to="/contact?intent=trial" className="min-h-11 py-2.5">{copy.nav.requestAccess}</MarketingButton>
        </div>
        <div className="ms-auto flex items-center gap-2 lg:hidden">
          <MarketingButton to="/contact?intent=trial" className="min-h-11 px-2.5 py-2 text-[0.69rem] sm:px-3 sm:text-xs">{copy.nav.requestAccess}</MarketingButton>
          <button ref={menuButtonRef} type="button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? copy.nav.close : copy.nav.menu} onClick={() => setMobileOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </MarketingContainer>
      {mobileOpen && (
        <div id="mobile-navigation" className="border-t border-slate-200 bg-white lg:hidden">
          <MarketingContainer className="py-4">
            <nav aria-label="Mobile" className="grid gap-1">
              {links.map((link) => <Link key={link.path} to={localizePath(link.path, locale)} className="flex min-h-12 items-center rounded-lg px-3 text-base font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{link.label}</Link>)}
              <Link to={localizePath('/login', locale)} className="flex min-h-12 items-center rounded-lg px-3 text-base font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{copy.nav.login}</Link>
            </nav>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <LanguageSwitcher />
              <MarketingButton to="/contact?intent=trial" className="sm:hidden">{copy.nav.requestAccess}</MarketingButton>
            </div>
          </MarketingContainer>
        </div>
      )}
    </header>
  );
}
