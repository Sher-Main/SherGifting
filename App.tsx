import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import { ProgressLoader } from './components/ProgressLoader';
import UsernameSetupModal from './components/UsernameSetupModal';
import Spinner from './components/Spinner';
import { usePrivyBrandingReplacer } from './hooks/usePrivyBrandingReplacer';

const HomePage = React.lazy(() => import('./pages/HomePage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const AddFundsPage = React.lazy(() => import('./pages/AddFundsPage'));
const GiftPage = React.lazy(() => import('./pages/GiftPage'));
const WithdrawPage = React.lazy(() => import('./pages/WithdrawPage'));
const HistoryPage = React.lazy(() => import('./pages/HistoryPage'));
const ClaimPage = React.lazy(() => import('./pages/ClaimPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

const App: React.FC = () => {
  // Replace Privy branding with Sher branding in all modals
  usePrivyBrandingReplacer();
  
  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return;
    }

    const navigationEntries = performance.getEntriesByType('navigation') as PerformanceEntryList;
    const nav = navigationEntries[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const timingSummary = {
        ttfb: Number(nav.responseStart - nav.requestStart).toFixed(2),
        fcp: Number(nav.domContentLoadedEventStart - nav.startTime).toFixed(2),
        domComplete: Number(nav.domComplete - nav.startTime).toFixed(2),
        total: Number(nav.duration).toFixed(2),
      };
      console.info('🕒 Sher Gifting load timings (ms):', timingSummary);
    }

    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'paint') {
            console.info(`🎨 ${entry.name}: ${entry.startTime.toFixed(2)}ms`);
          }
        });
      });

      observer.observe({ entryTypes: ['paint'] });

      return () => observer.disconnect();
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen font-sans text-white selection:bg-[#BE123C] selection:text-white">
            <AppContent />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
};

const AppContent: React.FC = () => {
  const { user, isLoading, loadingStage, showUsernameSetup, handleUsernameSetup } = useAuth();
  const location = useLocation();

  // Show full-screen loader ONLY during initial auth setup when we're actually waiting for Privy
  // If not authenticated, show login page immediately (don't block)
  if (isLoading && !user && loadingStage !== 'ready' && loadingStage !== 'authenticating') {
    return <ProgressLoader stage={loadingStage} />;
  }
  
  // If Privy is still initializing but we're not authenticated, show login page
  // (it will handle the redirect once auth completes)

  const isLoginPage = location.pathname === '/login';

  return (
    <>
      {!isLoginPage && <AnimatedBackground />}
      {user && <Header />}
      <main className={isLoginPage ? '' : 'p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto pt-16 relative z-10'}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
            <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" />} />
            <Route path="/add-funds" element={user ? <AddFundsPage /> : <Navigate to="/login" />} />
            <Route path="/gift" element={user ? <GiftPage /> : <Navigate to="/login" />} />
            <Route path="/withdraw" element={user ? <WithdrawPage /> : <Navigate to="/login" />} />
            <Route path="/history" element={user ? <HistoryPage /> : <Navigate to="/login" />} />
            <Route path="/claim" element={<ClaimPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <UsernameSetupModal
        isOpen={Boolean(user && showUsernameSetup)}
        onSuccess={handleUsernameSetup}
      />
    </>
  );
};

const RouteFallback = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-[#F8FAFC]">
    <Spinner size="8" color="border-[#06B6D4]" />
    <div className="text-center space-y-1">
      <p className="text-lg font-semibold">Loading module…</p>
      <p className="text-sm text-[#94A3B8]">
        One moment while we fetch the latest experience.
      </p>
    </div>
  </div>
);

export default App;
