import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './lib/i18n';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from './lib/persister';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { queryRetryDelay, shouldRetryQuery } from './lib/queryRetryPolicy';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HashRouter } from 'react-router-dom';

/**
 * The one product UI, shared by both composition roots.
 *
 * `src/production-main.tsx` (Supabase, shipped until cutover) and `src/firebase-main.tsx` (Firebase)
 * each register a backend and then call this. There is no second, reduced product: navigation,
 * business_type dispatch and every screen are the same code on both backends.
 */
export function renderApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <AppProviders><App /></AppProviders>
        </HashRouter>
      </ErrorBoundary>
    </StrictMode>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
    },
  });
  const persister = createIDBPersister();

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <CurrencyProvider>{children}</CurrencyProvider>
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
