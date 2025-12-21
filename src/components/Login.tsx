import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LogIn } from 'lucide-react';

import ForgotPassword from './ForgotPassword';

export default function Login() {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'login' | 'forgot-password'>('login');
  const isElectron =
    typeof window !== 'undefined' && !!window.electronAPI;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const baseInputClasses =
    'w-full text-slate-100 placeholder-slate-400 bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2.5 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 transition-all shadow-sm shadow-slate-950/70';

  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen relative flex items-center justify-center bg-slate-950 px-4 py-10">
         {/* Background elements */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-sky-500/20 blur-3xl rounded-full" />
            <div className="absolute -bottom-40 -right-32 w-96 h-96 bg-fuchsia-500/18 blur-3xl rounded-full" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),transparent_60%)]" />
        </div>
        <ForgotPassword onBack={() => setView('login')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-950 px-4 py-10">
      {/* Search for 'isElectron' button and keep it... */}
      {isElectron && (
        <div className="absolute top-4 right-4 z-20">
          <button
            type="button"
            onClick={() => window.electronAPI?.quitApp()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white 
                       bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500
                       border border-red-500/70 shadow-md shadow-red-900/40 transition-all"
          >
            <span>Close App</span>
          </button>
        </div>
      )}

      {/* Background Softness */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-sky-500/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -right-32 w-96 h-96 bg-fuchsia-500/18 blur-3xl rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),transparent_60%)]" />
      </div>

      {/* Main Card */}
      <div className="w-full max-w-4xl relative z-10">
        <div className="rounded-3xl overflow-hidden border border-slate-800/80 bg-slate-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.8)] glass-panel animate-scaleIn">
          {/* Top Line */}
          <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/60 to-sky-400/70" />

          <div className="grid lg:grid-cols-[1.1fr,1fr]">
            {/* Left Part - Welcome */}
            <div className="relative px-8 py-10 md:px-10 md:py-12 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-20 right-0 w-56 h-56 bg-sky-400/18 blur-3xl rounded-full" />
                <div className="absolute bottom-0 -left-10 w-64 h-64 bg-fuchsia-500/14 blur-3xl rounded-full" />
              </div>

              <div className="relative space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs font-medium text-sky-100 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t('auth.secureAccess', 'Secure access portal')}
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl md:text-4xl font-extrabold gradient-title leading-tight">
                    {t('auth.welcomeBack', 'Welcome back')}
                  </h1>
                  <p className="text-sm md:text-base text-slate-300/90 max-w-md">
                    {t('auth.loginSubtitle', 'Sign in to manage your trips, clients and finances from one smart dashboard.')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs md:text-sm">
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 backdrop-blur-sm shadow-inner shadow-slate-950/80">
                    <div className="text-slate-100 font-medium">
                      {t('auth.featureRealtime', 'Real-time updates')}
                    </div>
                    <div className="text-slate-400 mt-1">
                      {t('auth.featureRealtimeDesc', 'See your latest trips, payments and analytics instantly.')}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 backdrop-blur-sm shadow-inner shadow-slate-950/80">
                    <div className="text-slate-100 font-medium">
                      {t('auth.featureSecurity', 'Secure & encrypted')}
                    </div>
                    <div className="text-slate-400 mt-1">
                      {t('auth.featureSecurityDesc', 'Your data is protected with modern security standards.')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 text-[11px] md:text-xs text-slate-400">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600/70 to-transparent" />
                  <span>
                    {t('auth.trusted', 'Trusted access for registered users only')}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600/70 to-transparent" />
                </div>
              </div>
            </div>

            {/* Right Part - Login Form */}
            <div className="relative bg-slate-950/90 px-6 py-8 md:px-8 md:py-10">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-sky-400/12 blur-3xl rounded-full" />
              </div>

              <div className="relative space-y-6">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="bg-slate-900/90 border border-slate-700/80 p-3 rounded-2xl shadow-lg shadow-sky-900/40">
                      <LogIn className="w-7 h-7 text-sky-400" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    {t('auth.login')}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {t('auth.loginHint', 'Enter your credentials to continue')}
                  </p>
                </div>

                {error && (
                  <div className="bg-rose-500/10 border border-rose-400/40 text-rose-100 px-4 py-3 rounded-xl text-xs md:text-sm flex items-start gap-2">
                    <span className="mt-0.5 text-lg leading-none">!</span>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-200">
                      {t('auth.email')}
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={baseInputClasses}
                        placeholder={
                          t('auth.emailPlaceholder', 'you@example.com')
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-slate-200">
                        {t('auth.password')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setView('forgot-password')}
                        className="text-[11px] text-sky-300/80 hover:text-sky-200 transition-colors"
                      >
                        {t('auth.forgotPassword', 'Forgot password?')}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={baseInputClasses}
                        placeholder={
                          t('auth.passwordPlaceholder', '••••••••')
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="
                      w-full mt-2
                      inline-flex items-center justify-center gap-2 
                      rounded-xl px-4 py-2.5 text-sm font-semibold
                      text-white
                      bg-gradient-to-r from-sky-500 to-sky-400
                      hover:from-sky-400 hover:to-sky-300
                      border border-sky-400/80
                      shadow-[0_12px_35px_rgba(56,189,248,0.55)]
                      disabled:opacity-60 disabled:cursor-not-allowed
                      transition-all
                    "
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-sky-100 border-t-transparent animate-spin" />
                        {t('auth.loading')}
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        {t('auth.signIn')}
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-center text-slate-500 pt-1">
                    {t('auth.loginFooter', 'By signing in you agree to our terms and privacy policy.')}
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
