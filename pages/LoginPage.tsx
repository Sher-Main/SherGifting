import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoginPage: React.FC = () => {
  const { login, logout, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showLogout, setShowLogout] = React.useState(false);

  // ✅ Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/home');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
      // If user is already logged in, show logout option
      if (error.message && error.message.includes('already logged in')) {
        setShowLogout(true);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowLogout(false);
      // Reload page to clear all state
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // ✅ Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // ✅ If already authenticated, show redirect message
  if (isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Redirecting to home...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4">
      <div className="max-w-md w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
          Solana Gifting
        </h1>
        <p className="text-slate-300 text-center mb-8">
          Send crypto gifts to your friends and family
        </p>

        {showLogout ? (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-4">
              <p className="text-yellow-200 text-sm text-center">
                You're already logged in with another account. Please log out first to sign in with a different account.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg text-lg"
            >
              Log Out & Try Again
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg text-lg"
          >
            Sign In with Privy
          </button>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
