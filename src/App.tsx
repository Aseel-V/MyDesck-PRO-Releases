import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SuspendedView from './components/SuspendedView';
import SplashScreen from './components/SplashScreen';
import LandingPage from './pages/LandingPage';
import ScrollToTop from './components/ScrollToTop';

import { Toaster } from 'sonner';
import InvoiceTemplate from './components/invoice/InvoiceTemplate';

import { Routes, Route, Navigate } from 'react-router-dom';
import ResetPassword from './components/auth/ResetPassword';
import UpdateModal from './components/UpdateModal';
import { HelmetProvider } from 'react-helmet-async';
import SolutionPage from './pages/solutions/SolutionPage';
import SafetySupportPage from './pages/SafetySupportPage';

// Import new components for staff routing
import KitchenDisplaySystem from './components/restaurant/KitchenDisplaySystem';
import RestaurantDashboardV2 from './components/restaurant/RestaurantDashboardV2';


// Helper to detect Electron
const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

function LoginWrapper() {
  const { user, staffUser } = useAuth(); // Destructure staffUser from useAuth

  // 1. If a staff user is logged in, route them based on role
  if (staffUser) {
    // Check for Kitchen role
    if (staffUser.role === 'Kitchen' || staffUser.role === 'Chef' || staffUser.restaurant_role === 'kitchen_staff') {
       return (
         <div className="bg-slate-900 min-h-screen text-white">
           <KitchenDisplaySystem />
         </div>
       );
    }
    // Check for Waiter role (or others who use the POS)
    if (staffUser.role === 'Waiter' || staffUser.restaurant_role === 'waiter') {
       return <RestaurantDashboardV2 />;
    }
    
    // Default fallback for staff (e.g., if role is not explicitly handled)
    return <RestaurantDashboardV2 />;
  }

  // 2. If a regular user is logged in, redirect to dashboard
  if (user) {
    // Redirect to root for Electron, or Dashboard for Web
    return <Navigate to={isElectron ? "/" : "/dashboard"} replace />;
  }

  // 3. If no user or staffUser, show the Login component
  return (
    <div className="relative min-h-screen animate-fadeIn">
      <Login />
    </div>
  );
}

function App() {
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
    progress: number;
    currentVersion: string;
    availableVersion?: string | null;
    error?: string | null;
  }>({ status: 'idle', progress: 0, currentVersion: __APP_VERSION__, availableVersion: null, error: null });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.getUpdateState()
      .then((state) => setUpdateState({
        status: state.status,
        progress: state.progress,
        currentVersion: state.currentVersion || __APP_VERSION__,
        availableVersion: state.availableVersion ?? null,
        error: state.error ?? null,
      }))
      .catch(() => {
        void api.getAppVersion().then((version) => {
          setUpdateState((prev) => ({ ...prev, currentVersion: version || __APP_VERSION__ }));
        });
      });

    api.onUpdateState((state) => {
      setUpdateState({
        status: state.status,
        progress: state.progress,
        currentVersion: state.currentVersion || __APP_VERSION__,
        availableVersion: state.availableVersion ?? null,
        error: state.error ?? null,
      });
    });

    return () => {
      api.removeAllUpdateListeners();
    };
  }, []);

  const handleDismissUpdate = () => {
    setUpdateState(prev => ({ ...prev, status: 'idle' }));
    window.electronAPI?.unlockApp();
  };

  // Check if we are in "invoice mode" (window opened by Electron for printing)
  const params = new URLSearchParams(window.location.search);
  const isInvoice = params.get('invoice') === 'true';

  if (isInvoice) {
    return <InvoiceTemplate />;
  }

  return (
    <HelmetProvider>
      <ScrollToTop />
      <Toaster richColors position="top-center" closeButton />
      {updateState.status !== 'idle' && (
        <UpdateModal 
          status={updateState.status}
          progress={updateState.progress}
          currentVersion={updateState.currentVersion}
          availableVersion={updateState.availableVersion ?? undefined}
          error={updateState.error ?? undefined}
          onDismiss={handleDismissUpdate}
        />
      )}
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<LoginWrapper />} />
        
        {/* Explicit Routing: Web = Landing Page, Electron = App */}
        <Route path="/" element={ isElectron ? <AppContent /> : <LandingPage /> } />
        <Route path="/safety-support" element={<SafetySupportPage />} />
        <Route path="/solutions/:type" element={<SolutionPage />} />
        <Route path="/solutions" element={<SolutionPage />} />
        
        {/* Web App Access */}
        <Route path="/dashboard" element={<AppContent />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HelmetProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading, profile, userProfile } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (user && !profile) {
        return;
      }
      const timer = setTimeout(() => setShowSplash(false), 500);
      return () => clearTimeout(timer);
    }
  }, [authLoading, user, profile]);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!user) {
    // If we are in AppContent and not logged in, show Login
    return (
      <div className="relative min-h-screen animate-fadeIn">
        <Login />
      </div>
    );
  }

  // Check for suspension
  if (profile?.is_suspended || userProfile?.is_suspended) {
    return <SuspendedView />;
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}


// Removed the constrained AuthLayout so auth pages can render full-screen

// Shell عام للتطبيق بعد تسجيل الدخول
function AppShell({ children }: { children: React.ReactNode }) {
  const { direction } = useLanguage();

  return (
    <div
      className={`min-h-screen flex flex-col ${direction === 'rtl' ? 'rtl' : 'ltr'
        }`}
    >
      <main className="flex-1 overflow-y-auto pt-16 md:pt-20">
        {children}
      </main>
    </div>
  );
}


export default App;
