import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AddFundsPage from './pages/AddFundsPage';
import GiftPage from './pages/GiftPage';
import HistoryPage from './pages/HistoryPage';
import ClaimPage from './pages/ClaimPage';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <div className="min-h-screen">
            <AppContent />
          </div>
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
};

const AppContent: React.FC = () => {
  const { user } = useAuth();

  return (
    <>
      {user && <Header />}
      <main className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
          <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" />} />
          <Route path="/add-funds" element={user ? <AddFundsPage /> : <Navigate to="/login" />} />
          <Route path="/gift" element={user ? <GiftPage /> : <Navigate to="/login" />} />
          <Route path="/history" element={user ? <HistoryPage /> : <Navigate to="/login" />} />
          <Route path="/claim/:tipLinkId" element={<ClaimPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
};

export default App;
