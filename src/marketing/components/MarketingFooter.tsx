import { Link } from 'react-router-dom';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { localizePath } from '../routes/routeModel';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MarketingContainer } from './primitives';

export function MarketingFooter() {
  const { copy, locale } = useMarketingLanguage();
  const groups = [
    { title: copy.footer.product, links: copy.footer.links.product },
    { title: copy.footer.industries, links: copy.footer.links.industries },
    { title: copy.footer.resources, links: copy.footer.links.resources },
    { title: copy.footer.legal, links: copy.footer.links.legal },
  ];
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-14 text-slate-300">
      <MarketingContainer>
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Link to={localizePath('/', locale)} className="inline-flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              <img src="/favicon.ico" width="40" height="40" alt="" className="h-10 w-10 rounded-xl" />
              <span className="text-lg font-bold text-white">MyDesck PRO</span>
            </Link>
            <p className="mt-4 text-sm leading-7 text-slate-400">{copy.footer.statement}</p>
            <div className="mt-5"><LanguageSwitcher inverse /></div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-bold text-white">{group.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => <li key={link.path}><Link to={localizePath(link.path, locale)} className="inline-flex min-h-7 items-center text-sm text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{link.label}</Link></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} MyDesck PRO. {copy.footer.rights}</span>
          <span dir="ltr">English · العربية · עברית</span>
        </div>
      </MarketingContainer>
    </footer>
  );
}

