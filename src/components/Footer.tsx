import { useLanguage } from '../contexts/LanguageContext';

export default function Footer() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const appVersion = __APP_VERSION__;

  return (
    <footer className="mt-14 pb-6">
      {/* Glow line above footer */}
      <div className="w-full h-[1px] bg-gradient-to-r from-sky-500/40 via-fuchsia-500/30 to-sky-400/40 mb-4 opacity-60"></div>

      <div
        className="
          glass-panel 
          mx-auto max-w-6xl
          py-4 px-6 
          rounded-2xl
          border border-slate-800/70
          bg-slate-950/70
          backdrop-blur-2xl

          flex flex-col sm:flex-row
          items-center justify-between
          gap-3

          shadow-[0_15px_45px_rgba(0,0,0,0.35)]
          hover:shadow-[0_25px_70px_rgba(0,0,0,0.55)]
          transition-all
        "
      >
        {/* Left: Version + Year */}
        <div className="flex items-center gap-4 text-xs text-slate-300">
          <span className="px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700 text-sky-300 shadow-inner shadow-slate-900/40">
            v{appVersion}
          </span>
          <span className="text-slate-400 select-none">&copy; {currentYear}</span>
        </div>

        {/* Right – built by */}
        <p
          className="
            text-sm 
            text-slate-400 
            hover:text-sky-300
            transition
            cursor-default
            group
            font-light
          "
        >
          <span
            className="
              group-hover:drop-shadow-[0_0_12px_rgba(56,189,248,0.7)]
              group-hover:text-sky-300
              transition
            "
          >
            {t('builtBy')}
          </span>
        </p>
      </div>
    </footer>
  );
}
