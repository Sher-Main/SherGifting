
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { heliusService, bundleService } from '../services/api';
import { TokenBalance, Bundle } from '../types';
import { GiftIcon, WalletIcon, ArrowUpTrayIcon } from '../components/icons';

const HomePage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = authLoading || isLoading || !user?.wallet_address;

  useEffect(() => {
    if (!user?.wallet_address) {
      setBalances([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const fetchBalances = async () => {
      if (cancelled) return;
      setIsLoading(true);
      setError(null);
      try {
        const fetchedBalances = await heliusService.getTokenBalances(user.wallet_address!);
        const nonZeroBalances = fetchedBalances
          .filter((b) => b.balance > 0)
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
        setBalances(nonZeroBalances);
      } catch (e) {
        setError('Failed to fetch token balances.');
        console.error(e);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const scheduleFetch = () => {
      if (typeof window !== 'undefined' && (window as any).requestIdleCallback) {
        idleHandle = (window as any).requestIdleCallback(() => {
          if (!cancelled) {
            fetchBalances();
          }
        }, { timeout: 1000 });
      } else {
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            fetchBalances();
          }
        }, 50);
      }
    };

    scheduleFetch();

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleHandle);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [user]);

  const totalBalanceUSD = useMemo(() => {
    return balances.reduce((acc, token) => acc + token.usdValue, 0);
  }, [balances]);

  // Fetch bundles for public landing page
  useEffect(() => {
    if (!user) {
      bundleService.getBundles()
        .then(setBundles)
        .catch(console.error);
    }
  }, [user]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value);
  };

  // Show public landing page if not authenticated
  if (!user) {
    return (
      <div className="space-y-16 animate-fade-in">
        {/* Hero Section */}
        <section className="text-center py-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-sky-500 to-cyan-400 bg-clip-text text-transparent">
            Send Crypto Gifts
            <br />
            In Seconds
          </h1>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            The easiest way to send cryptocurrency to friends and family.
            No wallet needed. No crypto knowledge required.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/send"
              className="bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white px-8 py-4 rounded-lg font-semibold transition-all duration-300 shadow-lg"
            >
              Send a Gift 🎁
            </Link>
            <Link
              to="/login"
              className="border-2 border-slate-600 text-slate-300 px-8 py-4 rounded-lg font-semibold hover:bg-slate-800 transition"
            >
              Sign In
            </Link>
          </div>
          <div className="mt-12 flex gap-8 justify-center text-sm text-slate-500">
            <div>✅ No signup required</div>
            <div>✅ Instant delivery</div>
            <div>✅ Secure & private</div>
          </div>
        </section>

        {/* How It Works */}
        <section className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">1️⃣</div>
              <h3 className="text-xl font-semibold mb-2">Choose Recipient</h3>
              <p className="text-slate-400">Enter their username, email, or wallet address</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">2️⃣</div>
              <h3 className="text-xl font-semibold mb-2">Select Gift</h3>
              <p className="text-slate-400">Pick a token or pre-made bundle</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">3️⃣</div>
              <h3 className="text-xl font-semibold mb-2">Send & Done</h3>
              <p className="text-slate-400">Sign in once and your gift is sent instantly</p>
            </div>
          </div>
        </section>

        {/* Popular Bundles */}
        {bundles.length > 0 && (
          <section className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8">Popular Gift Bundles</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {bundles.slice(0, 3).map((bundle) => (
                <div key={bundle.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                  <div className="text-3xl mb-3">{bundle.badgeText || '🎁'}</div>
                  <h3 className="text-xl font-semibold mb-2">{bundle.name}</h3>
                  <p className="text-slate-400 text-sm mb-4">{bundle.description}</p>
                  <div className="text-2xl font-bold text-sky-400 mb-2">${bundle.totalUsdValue}</div>
                  <div className="text-xs text-slate-500 mb-4">
                    {bundle.tokens.map(t => `${t.percentage}% ${t.tokenSymbol}`).join(' + ')}
                  </div>
                  <Link
                    to="/send"
                    className="block w-full bg-slate-700 hover:bg-slate-600 text-white text-center py-2 rounded-lg transition"
                  >
                    Select
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="text-center py-12">
          <h2 className="text-4xl font-bold mb-6">Ready to Send a Gift?</h2>
          <p className="text-xl text-slate-400 mb-8">It takes less than 2 minutes</p>
          <Link
            to="/send"
            className="inline-block bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white px-8 py-4 rounded-lg font-semibold transition-all duration-300 shadow-lg"
          >
            Send Your First Gift 🎁
          </Link>
        </section>
      </div>
    );
  }

  // Authenticated user - show dashboard (existing behavior)
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Summary and Actions */}
        <div className="lg:col-span-1 space-y-8">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-lg space-y-6">
                <div>
                  <p className="text-slate-400 text-sm">Total Balance</p>
                  {showSkeleton ? (
                    <div className="mt-2 h-10 w-40 rounded-lg bg-slate-700 animate-pulse" />
                  ) : (
                    <p className="text-4xl font-bold text-white">{formatCurrency(totalBalanceUSD)}</p>
                  )}
                </div>
                <div className="flex flex-col space-y-3">
                    <button 
                      onClick={() => navigate('/add-funds')} 
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
                    >
                      <WalletIcon className="w-5 h-5" /> Add Funds
                    </button>
                    <button 
                      onClick={() => navigate('/gift')} 
                      className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center gap-2 text-base shadow-lg"

                    >
                      <GiftIcon className="w-5 h-5" /> Send Gift
                    </button>
                    <button 
                      onClick={() => navigate('/withdraw')} 
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
                    >
                      <ArrowUpTrayIcon className="w-5 h-5" /> Withdraw Funds
                    </button>
                </div>
            </div>
        </div>

        {/* Right Column: Token List */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold p-6 border-b border-slate-700">Your Assets</h2>
          {showSkeleton ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <BalanceRowSkeleton key={index} />
              ))}
            </div>
          ) : error ? (
            <div className="flex justify-center items-center h-64">
              <p className="text-center text-red-400 px-6">{error}</p>
            </div>
          ) : balances.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <p className="text-center text-slate-400 px-6">You don't have any tokens yet. Click "Add Funds" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-slate-400 uppercase">
                  <tr>
                    <th scope="col" className="px-6 py-3">Asset</th>
                    <th scope="col" className="px-6 py-3 text-right">Balance</th>
                    <th scope="col" className="px-6 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((token) => (
                    <tr key={token.address} className="border-t border-slate-700 hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img src={token.logoURI} alt={token.name} className="w-10 h-10 rounded-full bg-slate-700" />
                          <div>
                            <p className="font-bold text-white">{token.symbol}</p>
                            <p className="text-sm text-slate-400">{token.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-medium text-white">{token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                         <p className="text-sm text-slate-500">{token.symbol}</p>
                      </td>
                       <td className="px-6 py-4 text-right font-medium text-white">
                        {formatCurrency(token.usdValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;

const BalanceRowSkeleton: React.FC = () => (
  <div className="flex items-center justify-between border border-slate-700 rounded-xl p-4 animate-pulse bg-slate-900/40">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-slate-700" />
      <div className="space-y-2">
        <div className="h-4 w-24 bg-slate-700 rounded" />
        <div className="h-3 w-32 bg-slate-800 rounded" />
      </div>
    </div>
    <div className="space-y-2 text-right">
      <div className="h-4 w-16 bg-slate-700 rounded" />
      <div className="h-3 w-20 bg-slate-800 rounded" />
    </div>
  </div>
);

