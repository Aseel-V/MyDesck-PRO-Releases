// src/App.tsx
import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';

import InvoiceTemplate from './components/invoice/InvoiceTemplate';

function App() {
  // Check if we are in "invoice mode" (window opened by Electron for printing)
  const params = new URLSearchParams(window.location.search);
  const isInvoice = params.get('invoice') === 'true';

  if (isInvoice) {
    return <InvoiceTemplate />;
  }

  return (
    <AppContent />
  );
}

function AppContent() {
  const { user, loading: authLoading, profile } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  // This effect determines whether to show the splash screen or the main app.
  // It waits until the initial authentication check is complete.
  // If the user is logged in, it can also wait for the profile to be loaded,
  // ensuring custom branding is ready before showing the dashboard.
  useEffect(() => {
    if (!authLoading) {
      // If there's a user, we can optionally wait for the profile to load.
      // This is crucial for displaying the correct branding on the splash/dashboard.
      if (user && !profile) {
        // Keep splash visible while profile is loading
        return;
      }

      // Delay slightly to allow for CSS transitions to complete
      const timer = setTimeout(() => setShowSplash(false), 500);
      return () => clearTimeout(timer);
    }
  }, [authLoading, user, profile]);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!user) {
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
