import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import Login from '../components/Login';
import ForgotPassword from '../components/ForgotPassword';
import ResetPassword from '../components/auth/ResetPassword';
import { useMarketingLanguage } from '../marketing/content/MarketingLanguageContext';
import { localizePath } from '../marketing/routes/routeModel';

const StaffSessionApp = lazy(() => import('./StaffSessionApp'));

export type AuthView = 'login' | 'forgot-password' | 'reset-password';

function AuthProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}

function AuthStateRouter({ view }: { view: AuthView }) {
  const { user, staffUser } = useAuth();
  const { locale, copy } = useMarketingLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(localizePath('/dashboard', locale), { replace: true });
  }, [locale, navigate, user]);

  if (staffUser) {
    return <Suspense fallback={<AuthLoading />}><StaffSessionApp /></Suspense>;
  }

  if (view === 'login') return <Login />;
  if (view === 'reset-password') return <ResetPassword />;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 px-4 py-8 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <Link to={localizePath('/login', locale)} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{copy.nav.login}</Link>
        <ForgotPassword onBack={() => navigate(localizePath('/login', locale))} />
      </div>
    </main>
  );
}

function AuthLoading() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-slate-700" role="status" aria-live="polite"><Loader2 className="me-3 h-5 w-5 animate-spin" aria-hidden="true" />MyDesck PRO</div>;
}

export default function AuthApp({ view }: { view: AuthView }) {
  return <AuthProviders><Toaster richColors position="top-center" closeButton /><AuthStateRouter view={view} /></AuthProviders>;
}

