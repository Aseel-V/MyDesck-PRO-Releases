import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MarketingLanguageProvider } from './marketing/content/MarketingLanguageContext';
import { MarketingRouter } from './marketing/routes/MarketingRouter';

export default function WebRoot() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <MarketingLanguageProvider>
            <MarketingRouter />
          </MarketingLanguageProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

