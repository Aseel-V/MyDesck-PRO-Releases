import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { UserPlus } from 'lucide-react';

interface RegisterProps {
  onSwitchToLogin: () => void;
  variant?: 'full' | 'modal';
}

export default function Register({ onSwitchToLogin, variant = 'full' }: RegisterProps) {
  const { signUp } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState<'en' | 'ar' | 'he'>('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signUp(email, password, businessName, logoUrl, currency, language);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const baseInputClasses =
    'w-full text-slate-900 placeholder-slate-400 bg-slate-50 border border-slate-200 ' +
    'rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/80 ' +
    'focus:border-emerald-500/80 transition-all shadow-sm ' +
    'dark:text-slate-100 dark:bg-slate-950/80 dark:border-slate-800/80 dark:focus:ring-emerald-400/80 dark:focus:border-emerald-400/80 dark:shadow-slate-950/70';

  const inputClass =
    variant === 'modal'
      ? baseInputClasses
      : `glass-input ${baseInputClasses}`;

  const outerWrapperClass =
    variant === 'modal'
      ? 'w-full relative'
      : 'min-h-screen relative flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950';

  const backdropEnabled = variant === 'full';

  return (
    <div className={outerWrapperClass}>
      {backdropEnabled && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-emerald-500/25 blur-3xl rounded-full animate-float" />
          <div
            className="absolute -bottom-24 -right-24 w-96 h-96 bg-sky-500/25 blur-3xl rounded-full animate-float"
            style={{ animationDelay: '0.8s' }}
          />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[60vw] h-[60vh] bg-emerald-400/10 blur-3xl rounded-[40%] animate-glow" />
        </div>
      )}

      <div className={variant === 'modal' ? 'w-full' : 'w-full max-w-4xl relative z-10'}>
        <div
          className={
            variant === 'modal'
              ? 'glass-panel rounded-2xl border border-slate-200 bg-white shadow-2xl grid md:grid-cols-[1.3fr,1fr] gap-6 p-6 items-start dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-slate-950/80'
              : 'glass-panel rounded-3xl border border-slate-200 bg-white/95 shadow-2xl grid md:grid-cols-[1.3fr,1fr] gap-8 md:gap-10 p-7 md:p-10 items-start animate-scaleIn dark:border-white/10 dark:bg-slate-950/95 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]'
          }
        >
          {/* Left – form */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 border border-emerald-200 p-3 rounded-2xl shadow-sm dark:bg-emerald-500/15 dark:border-emerald-400/40 dark:shadow-emerald-900/40">
                  <UserPlus className="w-7 h-7 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-emerald-400 dark:via-sky-400 dark:to-emerald-400">
                    {t('auth.register')}
                  </h2>
                  <p className="text-sm md:text-base text-slate-500 max-w-md dark:text-slate-300/90">
                    Create your secure workspace and start managing your business in minutes.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                <span>Brand, currency & language – all in one step</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-400/40 text-rose-100 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  required
                />
                <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                  • Minimum 6 characters recommended for better security.
                </p>
              </div>

              {/* Business name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                  {t('auth.businessName')}
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                  {t('auth.businessLogo')}
                </label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder={t('auth.logoPlaceholder')}
                  className={`${inputClass} placeholder-slate-400 dark:placeholder-slate-500`}
                />
                {logoUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden dark:bg-slate-950/80 dark:border-slate-700">
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="h-10 w-10 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      Live preview of your logo (if URL is valid).
                    </span>
                  </div>
                )}
              </div>

              {/* Currency & Language – two columns on md+ */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                    {t('auth.preferredCurrency')}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={inputClass}
                  >
                    <option value="USD">{t('currencies.USD')}</option>
                    <option value="EUR">{t('currencies.EUR')}</option>
                    <option value="ILS">{t('currencies.ILS')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
                    {t('auth.preferredLanguage')}
                  </label>
                  <select
                    value={language}
                    onChange={(e) =>
                      setLanguage(e.target.value as 'en' | 'ar' | 'he')
                    }
                    className={inputClass}
                  >
                    <option value="en">{t('languages.en')}</option>
                    <option value="ar">{t('languages.ar')}</option>
                    <option value="he">{t('languages.he')}</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="glass-button w-full disabled:opacity-60 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                {loading ? t('auth.loading') : t('auth.signUp')}
              </button>
            </form>

            <div className="text-center text-xs md:text-sm text-slate-500 pt-2 dark:text-slate-300">
              {t('auth.haveAccount')}{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {t('auth.clickHere')}
              </button>
            </div>
          </div>

          {/* Right – highlight / marketing side */}
          <div className="hidden md:flex flex-col justify-between gap-6 border-l border-slate-200 pl-6 dark:border-slate-800/70">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Smart onboarding
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Set your business name, logo, currency, and language from day one.
                Everything is tailored to your workflow.
              </p>

              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center dark:bg-emerald-500/15 dark:border-emerald-400/40">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300">1</span>
                  </div>
                  <span>Register your account securely.</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center dark:bg-sky-500/15 dark:border-sky-400/40">
                    <span className="text-xs font-bold text-sky-600 dark:text-sky-300">2</span>
                  </div>
                  <span>Connect your brand – name and logo.</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center dark:bg-violet-500/15 dark:border-violet-400/40">
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-300">3</span>
                  </div>
                  <span>Start managing trips and invoices instantly.</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-500/35 dark:bg-gradient-to-br dark:from-emerald-500/10 dark:via-slate-900/70 dark:to-slate-950/95 dark:shadow-emerald-900/40">
              <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-600 mb-2 dark:text-emerald-300">
                LIVE PREVIEW
              </p>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3 dark:border-slate-700/80 dark:bg-slate-950/90">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Workspace status</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Ready when you are
                  </p>
                </div>
                <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
