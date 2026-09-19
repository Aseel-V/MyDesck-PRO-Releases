import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMarketingAnalytics } from '../analytics/analytics';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { phase2Content } from '../content/phase2Content';
import { localizePath, parseLocalizedPath } from '../routes/routeModel';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MarketingButton, MarketingContainer } from './primitives';

type DesktopMenu = 'product' | 'solutions' | null;

export function MarketingHeader() {
  const { copy, locale } = useMarketingLanguage();
  const p2 = phase2Content[locale];
  const analytics = useMarketingAnalytics();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState<DesktopMenu>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const productRef = useRef<HTMLButtonElement>(null);
  const solutionsRef = useRef<HTMLButtonElement>(null);
  const { basePath } = parseLocalizedPath(location.pathname);
  const directLinks = [
    { label: copy.nav.pricing, path: '/pricing' },
    { label: copy.nav.security, path: '/security' },
    { label: p2.nav.contact, path: '/contact' },
  ];
  const productLinks = [{ label: p2.nav.productOverview, path: '/features' }, { label: p2.nav.productTour, path: '/demo' }];
  const solutionGroups = [
    { title: p2.nav.available, links: [{ label: copy.solutionsBySlug['travel-agencies'].title, path: '/solutions/travel-agencies' }, { label: copy.solutionsBySlug.supermarkets.title, path: '/solutions/supermarkets' }] },
    { title: p2.nav.earlyAccess, links: [{ label: copy.solutionsBySlug.restaurants.title, path: '/solutions/restaurants' }, { label: copy.solutionsBySlug['auto-repair'].title, path: '/solutions/auto-repair' }] },
  ];

  useEffect(() => { setMobileOpen(false); setDesktopMenu(null); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen && !desktopMenu) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        if (mobileOpen) menuButtonRef.current?.focus();
        else if (desktopMenu === 'product') productRef.current?.focus();
        else solutionsRef.current?.focus();
        setMobileOpen(false); setDesktopMenu(null);
      }
      if (event instanceof MouseEvent && !headerRef.current?.contains(event.target as Node)) setDesktopMenu(null);
    };
    document.addEventListener('keydown', close); document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('mousedown', close); };
  }, [desktopMenu, mobileOpen]);

  const navLinkClass = (active: boolean) => `flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`;
  const dropdownButton = (name: Exclude<DesktopMenu, null>, label: string, ref: RefObject<HTMLButtonElement>) => <button ref={ref} type="button" aria-expanded={desktopMenu === name} aria-haspopup="menu" onClick={() => setDesktopMenu((current) => current === name ? null : name)} className={navLinkClass(name === 'product' ? basePath === '/features' || basePath === '/demo' : basePath.startsWith('/solutions'))}>{label}<ChevronDown className={`ms-1.5 h-3.5 w-3.5 transition-transform ${desktopMenu === name ? 'rotate-180' : ''}`} aria-hidden="true" /></button>;

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm">
      <MarketingContainer className="flex min-h-[4.5rem] items-center gap-4">
        <Link to={localizePath('/', locale)} aria-label="MyDesck PRO" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"><img src="/favicon.ico" width="36" height="36" alt="" className="h-9 w-9 rounded-[0.65rem]" /><span className="whitespace-nowrap text-[1.05rem] font-bold tracking-[-0.025em] text-slate-950">MyDesck <span className="text-sky-700">PRO</span></span></Link>
        <nav aria-label="Primary" className="ms-auto hidden items-center gap-1 xl:flex">
          <div className="relative">{dropdownButton('product', p2.nav.product, productRef)}{desktopMenu === 'product' && <div role="menu" className="absolute start-0 top-[calc(100%+.5rem)] w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{productLinks.map((link) => <Link role="menuitem" key={link.path} to={localizePath(link.path, locale)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{link.label}</Link>)}</div>}</div>
          <div className="relative">{dropdownButton('solutions', copy.nav.solutions, solutionsRef)}{desktopMenu === 'solutions' && <div role="menu" className="absolute start-0 top-[calc(100%+.5rem)] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><Link role="menuitem" to={localizePath('/solutions', locale)} className="mb-2 flex min-h-10 items-center rounded-lg px-3 text-sm font-bold text-slate-950 hover:bg-slate-100">{copy.nav.solutions}</Link>{solutionGroups.map((group) => <div key={group.title} className="border-t border-slate-100 py-2"><p className={`px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] ${group.title === p2.nav.available ? 'text-emerald-700' : 'text-amber-800'}`}>{group.title}</p>{group.links.map((link) => <Link role="menuitem" key={link.path} to={localizePath(link.path, locale)} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{link.label}</Link>)}</div>)}</div>}</div>
          {directLinks.map((link) => <Link key={link.path} to={localizePath(link.path, locale)} aria-current={basePath === link.path ? 'page' : undefined} className={navLinkClass(basePath === link.path)}>{link.label}</Link>)}
        </nav>
        <div className="ms-auto hidden items-center gap-2 xl:flex"><LanguageSwitcher /><Link to={localizePath('/login', locale)} onClick={() => void analytics.track({ name: 'login_click', locale })} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{copy.nav.login}</Link><MarketingButton to="/contact?intent=trial" className="min-h-11 py-2.5">{copy.nav.requestAccess}</MarketingButton></div>
        <div className="ms-auto flex items-center gap-2 xl:hidden"><MarketingButton to="/contact?intent=trial" className="min-h-11 px-2.5 py-2 text-[0.69rem] sm:px-3 sm:text-xs">{copy.nav.requestAccess}</MarketingButton><button ref={menuButtonRef} type="button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? copy.nav.close : copy.nav.menu} onClick={() => setMobileOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}</button></div>
      </MarketingContainer>
      {mobileOpen && <div id="mobile-navigation" className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-slate-200 bg-white xl:hidden"><MarketingContainer className="py-4"><nav aria-label="Mobile" className="grid gap-1"><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{p2.nav.product}</p>{productLinks.map((link) => <Link key={link.path} to={localizePath(link.path, locale)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">{link.label}</Link>)}{solutionGroups.map((group) => <div key={group.title}><p className={`px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.13em] ${group.title === p2.nav.available ? 'text-emerald-700' : 'text-amber-800'}`}>{copy.nav.solutions} · {group.title}</p>{group.links.map((link) => <Link key={link.path} to={localizePath(link.path, locale)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">{link.label}</Link>)}</div>)}{directLinks.map((link) => <Link key={link.path} to={localizePath(link.path, locale)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">{link.label}</Link>)}<Link to={localizePath('/login', locale)} onClick={() => void analytics.track({ name: 'login_click', locale })} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">{copy.nav.login}</Link></nav><div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3"><LanguageSwitcher /><MarketingButton to="/contact?intent=trial" className="sm:hidden">{copy.nav.requestAccess}</MarketingButton></div></MarketingContainer></div>}
    </header>
  );
}
