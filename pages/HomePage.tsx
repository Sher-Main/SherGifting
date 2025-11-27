
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { heliusService } from '../services/api';
import { TokenBalance } from '../types';
import { ArrowUpRight, ArrowDownLeft, Gift } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';

const HomePage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Left Column: Balance & Actions */}
        <div className="md:col-span-5 space-y-6">
          <GlassCard className="flex flex-col gap-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Total Balance</span>
              {showSkeleton ? (
                <div className="mt-2 h-12 w-40 rounded-lg bg-[#1E293B]/40 animate-pulse" />
              ) : (
                <h2 className="text-5xl font-bold text-white mt-2">{formatCurrency(totalBalanceUSD)}</h2>
              )}
            </div>

            <div className="space-y-3">
              <GlowButton 
                fullWidth 
                variant="secondary" 
                icon={ArrowUpRight} 
                onClick={() => navigate('/add-funds')}
              >
                Add Funds
              </GlowButton>
              <GlowButton 
                fullWidth 
                variant="cyan" 
                icon={Gift} 
                onClick={() => navigate('/gift')}
              >
                Send Gift
              </GlowButton>
              <GlowButton 
                fullWidth 
                variant="secondary" 
                icon={ArrowDownLeft} 
                onClick={() => navigate('/withdraw')}
              >
                Withdraw Funds
              </GlowButton>
            </div>
          </GlassCard>
        </div>

        {/* Right Column: Assets */}
        <div className="md:col-span-7">
          <GlassCard className="h-full">
            <h3 className="text-lg font-bold text-white mb-6">Your Assets</h3>
            {showSkeleton ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <BalanceRowSkeleton key={index} />
                ))}
              </div>
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
                <div className="flex justify-between text-xs font-bold uppercase text-[#64748B] px-4 pb-2 border-b border-white/5">
                  <span>Asset</span>
                  <div className="flex gap-12">
                    <span>Balance</span>
                    <span>Value</span>
                  </div>
                </div>
                
                {balances.map((token) => (
                  <div key={token.address} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#0F172A] border border-white/10 flex items-center justify-center overflow-hidden">
                        {token.logoURI ? (
                          <img src={token.logoURI} alt={token.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-xs">{token.symbol.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white">{token.symbol}</div>
                        <div className="text-xs text-[#94A3B8]">{token.name}</div>
                      </div>
                    </div>
                    <div className="flex gap-8 text-right">
                      <div>
                        <div className="font-bold text-white">{token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                        <div className="text-xs text-[#94A3B8]">{token.symbol}</div>
                      </div>
                      <div className="w-16">
                        <div className="font-bold text-white">{formatCurrency(token.usdValue)}</div>
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

const BalanceRowSkeleton: React.FC = () => (
  <div className="flex items-center justify-between p-4 rounded-xl animate-pulse bg-[#1E293B]/40">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-[#0F172A] border border-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-24 bg-[#0F172A] rounded" />
        <div className="h-3 w-32 bg-[#0F172A] rounded" />
      </div>
    </div>
    <div className="flex gap-8 text-right">
      <div className="space-y-2">
        <div className="h-4 w-16 bg-[#0F172A] rounded" />
        <div className="h-3 w-12 bg-[#0F172A] rounded" />
      </div>
      <div className="w-16">
        <div className="h-4 w-12 bg-[#0F172A] rounded" />
      </div>
    </div>
  </div>
);

