import { StrictMode } from 'react';
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

// Storage identity is registered once, at the composition root. Today it yields the Supabase
// session token; after Supabase Third-Party Auth for Firebase is enabled this becomes
// useFirebaseStorageIdentity and nothing else in the Storage layer changes.
import { useSupabaseStorageIdentity } from './data/storageIdentity';
useSupabaseStorageIdentity();

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from './lib/persister';
import { LanguageProvider } from './contexts/LanguageContext'; // Assuming path for LanguageProvider
import { AuthProvider } from './contexts/AuthContext'; // Assuming path for AuthProvider
import { CurrencyProvider } from './contexts/CurrencyContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { queryRetryDelay, shouldRetryQuery } from './lib/queryRetryPolicy';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
  },
});

const persister = createIDBPersister();

import { ErrorBoundary } from './components/ErrorBoundary';

import { HashRouter } from 'react-router-dom';

// ...

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>
              <CurrencyProvider>
                <HashRouter>
                  <App />
                </HashRouter>
              </CurrencyProvider>
            </ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);

