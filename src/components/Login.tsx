import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  LockKeyhole,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import ForgotPassword from './ForgotPassword';
import {
  getFriendlyAuthError,
  shouldAttemptStaffFallback,
} from '../lib/authNetwork';

export default function Login() {
  const { signIn, signInStaff } = useAuth();
  const { t, language, setLanguage, direction } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'login' | 'forgot-password'>('login');
  const [isLangOpen, setIsLangOpen] = useState(false);

  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      try {
        await signIn(email, password);
      } catch (signInError) {
        if (!shouldAttemptStaffFallback(signInError)) {
          throw signInError;
        }

        try {
          await signInStaff(email, password);
        } catch (staffError) {
          throw new Error(getFriendlyAuthError(staffError));
        }
      }

      console.info('[Auth] Sign-in completed successfully.');
    } catch (authError: unknown) {
      const friendlyError = getFriendlyAuthError(authError);

      setError(
        /invalid|credential|password/i.test(friendlyError)
          ? t('auth.invalidCredentials')
          : t('auth.loginFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = (lang: 'en' | 'ar' | 'he') => {
    setLanguage(lang);
    setIsLangOpen(false);
  };

  const inputClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  if (view === 'forgot-password') {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-4 py-8 dark:bg-slate-950"
        dir={direction}
      >
        <section className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setView('login')}
            aria-label={t('common.close')}
            className="absolute end-4 top-4 z-10 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <ForgotPassword onBack={() => setView('login')} />
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-[100dvh] overflow-x-hidden bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
      dir={direction}
    >
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
        <aside className="relative hidden overflow-hidden border-e border-slate-800 bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div
            className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(56,189,248,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.24)_1px,transparent_1px)] [background-size:48px_48px]"
            aria-hidden="true"
          />

          <div className="relative flex items-center gap-3">
            <img
              src="/favicon.ico"
              alt=""
              className="h-10 w-10 rounded-xl bg-white p-1"
            />
            <span className="text-xl font-bold">MyDesck PRO</span>
          </div>

          <div className="relative max-w-lg">
            <p className="text-sm font-semibold text-sky-300">
              {t('auth.secureAccess')}
            </p>

            <h2 className="mt-4 text-3xl font-bold leading-tight">
              {t('auth.productStatement')}
            </h2>

            <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
              {t('auth.loginSubtitle')}
            </p>

            <div className="mt-8 flex items-center gap-2 text-sm text-slate-300">
              <LockKeyhole
                className="h-4 w-4 text-sky-400"
                aria-hidden="true"
              />
              <span>{t('auth.trusted')}</span>
            </div>
          </div>

          <p className="relative text-xs text-slate-500">MyDesck PRO</p>
        </aside>

        <section className="flex min-w-0 flex-col bg-white dark:bg-slate-900">
          <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <img
                src="/favicon.ico"
                alt=""
                className="h-8 w-8 rounded-lg"
              />
              <span className="font-bold">MyDesck PRO</span>
            </div>

            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  theme === 'dark'
                    ? t('auth.lightMode')
                    : t('auth.darkMode')
                }
                className="rounded-lg border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                )}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsLangOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isLangOpen}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700"
                >
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  <span>{language}</span>
                </button>

                {isLangOpen && (
                  <div
                    role="menu"
                    className="absolute end-0 top-12 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  >
                    {(['en', 'ar', 'he'] as const).map((lang) => (
                      <button
                        key={lang}
                        role="menuitem"
                        type="button"
                        onClick={() => handleLanguageChange(lang)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800"
                      >
                        <span>{t(`auth.languages.${lang}`)}</span>

                        {language === lang && (
                          <Check
                            className="h-4 w-4 text-sky-600"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isElectron && (
                <button
                  type="button"
                  onClick={() => window.electronAPI?.quitApp()}
                  aria-label={t('common.close')}
                  className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
            <div className="w-full max-w-md">
              <div className="mb-7 lg:hidden">
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {t('auth.productStatement')}
                </p>
              </div>

              <h1 className="text-3xl font-bold tracking-tight">
                {t('auth.welcomeBack')}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {t('auth.loginHint')}
              </p>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-2 block text-sm font-semibold"
                  >
                    {t('auth.email')}
                  </label>

                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <label
                      htmlFor="login-password"
                      className="text-sm font-semibold"
                    >
                      {t('auth.password')}
                    </label>

                    <button
                      type="button"
                      onClick={() => setView('forgot-password')}
                      className="text-sm font-semibold text-sky-700 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-400"
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>

                  <div className="relative" dir="ltr">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      dir="ltr"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      required
                      className={`${inputClass} pr-12`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((visible) => !visible)
                      }
                      aria-label={
                        showPassword
                          ? t('auth.hidePassword')
                          : t('auth.showPassword')
                      }
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}

                  <span>
                    {loading ? t('auth.loggingIn') : t('auth.signIn')}
                  </span>
                </button>
              </form>

              <p className="mt-6 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t('auth.loginFooter')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
