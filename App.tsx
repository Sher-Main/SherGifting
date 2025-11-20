import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AddFundsPage from './pages/AddFundsPage';
import GiftPage from './pages/GiftPage';
import WithdrawPage from './pages/WithdrawPage';
import HistoryPage from './pages/HistoryPage';
import ClaimPage from './pages/ClaimPage';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';
import { ProgressLoader } from './components/ProgressLoader';
import UsernameSetupModal from './components/UsernameSetupModal';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen">
            <AppContent />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
};

const AppContent: React.FC = () => {
  const { user, isLoading, loadingStage, showUsernameSetup, handleUsernameSetup } = useAuth();

  // Show loading screen during initial auth/wallet setup
  if (isLoading) {
    return <ProgressLoader stage={loadingStage} />;
  }

  return (
    <>
      {user && <Header />}
      <main className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
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
      </main>
      <UsernameSetupModal
        isOpen={Boolean(user && showUsernameSetup)}
        onSuccess={handleUsernameSetup}
      />
    </>
  );
};

export default App;
