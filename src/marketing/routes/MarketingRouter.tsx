import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '../layouts/MarketingLayout';
import NotFoundPage from '../pages/NotFoundPage';

const HomePage = lazy(() => import('../pages/HomePage'));
const FeaturesPage = lazy(() => import('../pages/FeaturesPage'));
const SolutionsPage = lazy(() => import('../pages/SolutionsPage'));
const SolutionDetailPage = lazy(() => import('../pages/SolutionDetailPage'));
const PricingPage = lazy(() => import('../pages/PricingPage'));
const SecurityPage = lazy(() => import('../pages/SecurityPage'));
const LegalPage = lazy(() => import('../pages/LegalPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const WebApplicationRoot = lazy(() => import('../../application/WebApplicationRoot'));

function PageLoading() {
  return <div className="flex min-h-[45vh] items-center justify-center bg-white" role="status" aria-live="polite"><span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-700" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
}

function LocalizedRoutes({ prefix }: { prefix: '' | '/ar' | '/he' }) {
  return (
    <>
      <Route path={`${prefix}/login`} element={<WebApplicationRoot view="login" />} />
      <Route path={`${prefix}/forgot-password`} element={<WebApplicationRoot view="forgot-password" />} />
      <Route path={`${prefix}/reset-password`} element={<WebApplicationRoot view="reset-password" />} />
      <Route path={`${prefix}/dashboard`} element={<WebApplicationRoot view="dashboard" />} />
      <Route element={<MarketingLayout />}>
        <Route path={prefix || '/'} element={<HomePage />} />
        <Route path={`${prefix}/features`} element={<FeaturesPage />} />
        <Route path={`${prefix}/solutions`} element={<SolutionsPage />} />
        <Route path={`${prefix}/solutions/:slug`} element={<SolutionDetailPage />} />
        <Route path={`${prefix}/pricing`} element={<PricingPage />} />
        <Route path={`${prefix}/security`} element={<SecurityPage />} />
        <Route path={`${prefix}/privacy`} element={<LegalPage kind="privacy" />} />
        <Route path={`${prefix}/terms`} element={<LegalPage kind="terms" />} />
        <Route path={`${prefix}/contact`} element={<ContactPage />} />
      </Route>
    </>
  );
}

export function MarketingRouter() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        {LocalizedRoutes({ prefix: '' })}
        {LocalizedRoutes({ prefix: '/ar' })}
        {LocalizedRoutes({ prefix: '/he' })}
        <Route path="/en/*" element={<Navigate to="/" replace />} />
        <Route element={<MarketingLayout />}><Route path="*" element={<NotFoundPage />} /></Route>
      </Routes>
    </Suspense>
  );
}

