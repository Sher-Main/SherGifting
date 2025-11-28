
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { heliusService } from '../services/api';
import { TokenBalance, Token } from '../types';
import { ArrowUpRight, ArrowDownLeft, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import BalanceBreakdown from '../components/UI/BalanceBreakdown';
import QuickSendCard from '../components/UI/QuickSendCard';
import RecentGiftsTimeline from '../components/UI/RecentGiftsTimeline';
import SkeletonLoader from '../components/UI/SkeletonLoader';
import PageHeader from '../components/UI/PageHeader';

const HomePage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<number | null>(null);
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
        setLastBalanceUpdate(Date.now());
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value);
  };

  // Convert balances to Token format for QuickSendCard
  const tokens: Token[] = useMemo(() => {
    return balances.map(b => ({
      mint: b.address,
      symbol: b.symbol,
      name: b.name,
      decimals: b.decimals,
      isNative: b.symbol === 'SOL',
    }));
  }, [balances]);

  const defaultToken = tokens.find(t => t.symbol === 'SOL') || tokens[0] || null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 animate-fade-in-up">
      <PageHeader
        title="Dashboard"
        subtitle="Manage your crypto gifts and assets"
      />

      {/* Row 1: Enhanced Balance Card */}
      <div className="mb-8">
        <GlassCard variant="balance" className="w-full">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Total Balance</span>
              {showSkeleton ? (
                <div className="mt-2 h-12 w-40 rounded-lg bg-[#1E293B]/40 animate-pulse" />
              ) : (
                <motion.h2
                  key={totalBalanceUSD}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-5xl font-bold text-white mt-2"
                >
                  {formatCurrency(totalBalanceUSD)}
                </motion.h2>
              )}
              {!showSkeleton && balances.length > 0 && (
                <div className="mt-3">
                  <BalanceBreakdown
                    balances={balances}
                    lastUpdated={lastBalanceUpdate}
                    totalBalance={totalBalanceUSD}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 md:flex-col md:min-w-[200px]">
              <GlowButton 
                fullWidth 
                variant="cyan" 
                icon={Gift} 
                onClick={() => navigate('/gift')}
                className="md:order-1"
              >
                Send Gift
              </GlowButton>
              <GlowButton 
                fullWidth 
                variant="secondary" 
                icon={ArrowUpRight} 
                onClick={() => navigate('/add-funds')}
                className="md:order-2"
              >
                Add Funds
              </GlowButton>
              <GlowButton 
                fullWidth 
                variant="secondary" 
                icon={ArrowDownLeft} 
                onClick={() => navigate('/withdraw')}
                className="md:order-3 !py-2 !px-4 !text-sm"
              >
                Withdraw
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Row 2: Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Quick Send + Recent Gifts */}
        <div className="lg:col-span-5 space-y-6">
          {tokens.length > 0 && (
            <QuickSendCard
              tokens={tokens}
              defaultToken={defaultToken}
            />
          )}
          <RecentGiftsTimeline maxItems={5} />
        </div>

        {/* Right Column: Assets Table */}
        <div className="lg:col-span-7">
          <GlassCard className="h-full">
            <h3 className="text-lg font-bold text-white mb-6">Your Assets</h3>
            {showSkeleton ? (
              <SkeletonLoader type="list-item" rows={3} />
            ) : error ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-center text-[#EF4444] px-6">{error}</p>
              </div>
            ) : balances.length === 0 ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-center text-[#94A3B8] px-6">You don't have any tokens yet. Click "Add Funds" to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-bold uppercase text-[#64748B] px-5 pb-3 border-b border-white/5">
                  <span>Asset</span>
                  <div className="flex gap-12">
                    <span>Balance</span>
                    <span>Value</span>
                  </div>
                </div>
                
                {balances.map((token) => (
                  <div
                    key={token.address}
                    className="flex items-center justify-between p-5 rounded-xl hover:bg-white/10 hover:border-white/10 border border-transparent transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#0F172A] border border-white/10 flex items-center justify-center overflow-hidden">
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-xs">{token.symbol.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white text-base">{token.symbol}</div>
                        <div className="text-xs text-[#94A3B8]">{token.name}</div>
                      </div>
                    </div>
                    <div className="flex gap-8 text-right">
                      <div>
                        <div className="font-bold text-white text-base">{token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                        <div className="text-xs text-[#94A3B8]">{token.symbol}</div>
                      </div>
                      <div className="w-20">
                        <div className="font-bold text-white text-base">{formatCurrency(token.usdValue || 0)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

