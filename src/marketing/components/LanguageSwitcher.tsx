import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { siteContent } from '../content/siteContent';
import { supportedLocales } from '../routes/routeModel';

export function LanguageSwitcher({ inverse = false }: { inverse?: boolean }) {
  const { locale, setLocale, copy } = useMarketingLanguage();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event instanceof MouseEvent && !wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.nav.language}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${inverse ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        <span className="uppercase">{locale}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-[calc(100%+.5rem)] z-50 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-xl">
          {supportedLocales.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={locale === item}
              onClick={() => { setLocale(item); setOpen(false); }}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-sm font-semibold hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span lang={item} dir={item === 'en' ? 'ltr' : 'rtl'}>{siteContent[item].localeName}</span>
              {locale === item && <Check className="h-4 w-4 text-sky-700" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

