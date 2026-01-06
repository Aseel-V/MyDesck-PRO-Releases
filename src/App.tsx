import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';
import LandingPage from './pages/LandingPage';

import InvoiceTemplate from './components/invoice/InvoiceTemplate';

import { Routes, Route, Navigate } from 'react-router-dom';
import ResetPassword from './components/auth/ResetPassword';
import UpdateModal from './components/UpdateModal';


// Helper to detect Electron
const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

function LoginWrapper() {
  const { user } = useAuth();
  if (user) {
    // Redirect to root for Electron, or Dashboard for Web
    return <Navigate to={isElectron ? "/" : "/dashboard"} replace />;
  }
  return (
    <div className="relative min-h-screen animate-fadeIn">
      <Login />
    </div>
  );
}

function App() {
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'downloading' | 'downloaded' | 'error';
    progress: number;
    version?: string;
    error?: string;
  }>({ status: 'idle', progress: 0 });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Listeners
    const onAvailable = (info: { version: string; [key: string]: unknown }) => {
      setUpdateState(prev => ({ ...prev, status: 'downloading', version: info.version, progress: 0 }));
    };
    const onProgress = (info: { percent: number; [key: string]: unknown }) => {
      setUpdateState(prev => ({ ...prev, status: 'downloading', progress: info.percent }));
    };
    const onDownloaded = (info: { version: string; [key: string]: unknown }) => {
      setUpdateState(prev => ({ ...prev, status: 'downloaded', version: info.version }));
    };
    const onError = (err: string) => {
      setUpdateState(prev => ({ ...prev, status: 'error', error: err }));
    };

    api.onUpdateAvailable(onAvailable);
    api.onUpdateProgress(onProgress);
    api.onUpdateDownloaded(onDownloaded);
    api.onUpdateError(onError);

    return () => {
      api.removeAllUpdateListeners();
    };
  }, []);

  const handleSkip = () => {
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
    <>
      {updateState.status !== 'idle' && (
        <UpdateModal 
          status={updateState.status}
          progress={updateState.progress}
          version={updateState.version}
          error={updateState.error}
          onSkip={handleSkip}
        />
      )}
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<LoginWrapper />} />
        
        {/* Explicit Routing: Web = Landing Page, Electron = App */}
        <Route path="/" element={ isElectron ? <AppContent /> : <LandingPage /> } />
        
        {/* Web App Access */}
        <Route path="/dashboard" element={<AppContent />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function AppContent() {
  const { user, loading: authLoading, profile } = useAuth();
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
