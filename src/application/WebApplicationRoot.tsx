import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { NoIndexSEO } from '../marketing/seo/MarketingSEO';
import { initializeBackend } from './initializeBackend';
import type { AuthView } from './AuthApp';

const AuthApp = lazy(() => import('./AuthApp'));
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

export default function WebApplicationRoot({ view }: { view: AuthView | 'dashboard' }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    initializeBackend().then(() => {
      if (active) setState('ready');
    }).catch((error: unknown) => {
      console.error('[WebApplicationRoot] Backend initialization failed', error);
      if (active) setState('error');
    });
    return () => { active = false; };
  }, []);

  const path = view === 'dashboard' ? '/dashboard' : `/${view}`;
  return (
    <>
      <NoIndexSEO path={path} />
      {state === 'loading' && <ApplicationLoading />}
      {state === 'error' && <ApplicationError />}
      {state === 'ready' && (
        <Suspense fallback={<ApplicationLoading />}>
          {view === 'dashboard' ? <AuthenticatedApp /> : <AuthApp view={view} />}
        </Suspense>
      )}
    </>
  );
}

function ApplicationLoading() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-slate-700" role="status" aria-live="polite"><Loader2 className="me-3 h-5 w-5 animate-spin" aria-hidden="true" /><span className="font-semibold">MyDesck PRO</span></main>;
}

function ApplicationError() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-5"><div className="max-w-md rounded-2xl border border-rose-200 bg-white p-7 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-7 w-7 text-rose-700" aria-hidden="true" /><h1 className="mt-4 text-xl font-bold text-slate-950">MyDesck PRO could not start</h1><p className="mt-2 text-sm leading-6 text-slate-600">Check the application configuration and try again. No business data was loaded.</p></div></main>;
}

