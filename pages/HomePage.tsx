
import React, { useEffect, useState, useMemo, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { heliusService, bundleService } from '../services/api';
import { TokenBalance, Bundle } from '../types';
import { GiftIcon, WalletIcon, ArrowUpTrayIcon } from '../components/icons';
import { AnimatedGradient } from '../components/AnimatedGradient';
import { FloatingParticles } from '../components/FloatingParticles';
import { AnimatedCard } from '../components/AnimatedCard';
import { ScrollIndicator } from '../components/ScrollIndicator';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { savePendingGift } from '../lib/giftStore';

const HomePage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);
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

  // Fetch bundles for public landing page - with caching for instant load
  useEffect(() => {
    // Check cache first (works for both authenticated and unauthenticated users)
    const CACHE_KEY = 'sher_bundles_cache';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          setBundles(data);
          // Still fetch in background to refresh cache, but don't show loading
          bundleService.getBundles().then(fetchedBundles => {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              data: fetchedBundles,
              timestamp: Date.now()
            }));
            setBundles(fetchedBundles);
          }).catch(() => {
            // Silent fail for background refresh
          });
          return; // Use cached data immediately
        }
      } catch (e) {
        // Invalid cache, continue to fetch
      }
    }
    
    // Only show loading state if no cache exists
    if (!user) {
      setBundlesLoading(true);
    }
    
    // Fetch bundles immediately
    const fetchBundles = async () => {
      try {
        const fetchedBundles = await bundleService.getBundles();
        setBundles(fetchedBundles);
        // Cache the result
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: fetchedBundles,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Failed to fetch bundles:', error);
      } finally {
        setBundlesLoading(false);
      }
    };
    fetchBundles();
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
    return <LandingPage bundles={bundles} bundlesLoading={bundlesLoading} />;
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

// Helper Components - Defined after HomePage

// How It Works Section Component
const HowItWorksSection: React.FC = memo(() => {
  const prefersReducedMotion = useReducedMotion();
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const steps = [
    {
      number: '1',
      title: 'Choose Recipient',
      description: 'Enter their username, email, or wallet address',
      icon: (
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      number: '2',
      title: 'Select Gift',
      description: 'Pick a token or pre-made bundle',
      icon: (
        <GiftIcon className="w-12 h-12" />
      ),
    },
    {
      number: '3',
      title: 'Send & Done',
      description: 'Sign in once and your gift is sent instantly',
      icon: (
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeOut',
      },
    },
  };

    return (
    <section ref={ref} className="max-w-6xl mx-auto px-4">
      <motion.h2
        className="text-4xl md:text-5xl font-bold text-center mb-4 md:mb-6"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={isInView && !prefersReducedMotion ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
          How It Works
        </span>
      </motion.h2>
      
      <motion.div
        className="grid md:grid-cols-3 gap-6 md:gap-8 relative"
        variants={prefersReducedMotion ? {} : containerVariants}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
      >
        {/* Connecting line for desktop */}
        <div className="hidden md:block absolute top-24 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-sky-500/50 via-cyan-400/50 to-sky-500/50" />
        
        {steps.map((step, index) => (
          <AnimatedCard
            key={step.number}
            delay={index * 0.15}
            className="relative bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-center hover:border-sky-500/50 transition-all duration-300 group"
            hoverScale={1.03}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-lg z-10">
              <motion.span
                initial={prefersReducedMotion ? {} : { scale: 0 }}
                animate={isInView && !prefersReducedMotion ? { scale: 1 } : {}}
                transition={{ delay: 0.3 + index * 0.15, type: 'spring', stiffness: 200 }}
              >
                {step.number}
              </motion.span>
            </div>
            
            <motion.div
              className="flex justify-center mb-6 text-sky-400 group-hover:text-cyan-300 transition-colors"
              variants={prefersReducedMotion ? {} : cardVariants}
            >
              {step.icon}
            </motion.div>
            
            <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-sky-300 transition-colors">
              {step.title}
            </h3>
            <p className="text-slate-400 leading-relaxed">
              {step.description}
            </p>
          </AnimatedCard>
        ))}
      </motion.div>
        </section>
  );
});

HowItWorksSection.displayName = 'HowItWorksSection';

// Bundle Section Component
interface BundleSectionProps {
  bundles: Bundle[];
}

const BundleSection: React.FC<BundleSectionProps> = memo(({ bundles }) => {
  const prefersReducedMotion = useReducedMotion();
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0,
      },
    },
  };

  // Show immediately without waiting for scroll
  return (
    <section ref={ref} className="max-w-6xl mx-auto px-4">
      <motion.h2
        className="text-4xl md:text-5xl font-bold text-center mb-4 md:mb-6"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
          Popular Gift Bundles
        </span>
      </motion.h2>
      
      <motion.div
        className="grid md:grid-cols-3 gap-6 md:gap-8"
        variants={prefersReducedMotion ? {} : containerVariants}
        initial="hidden"
        animate="visible"
      >
        {bundles.slice(0, 3).map((bundle, index) => (
          <BundleCard key={bundle.id} bundle={bundle} index={index} />
        ))}
      </motion.div>
    </section>
  );
});

BundleSection.displayName = 'BundleSection';

// Bundle Card Component
interface BundleCardProps {
  bundle: Bundle;
  index: number;
}

const BundleCard: React.FC<BundleCardProps> = memo(({ bundle, index }) => {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={prefersReducedMotion ? {} : {
        y: -8,
        rotateY: 5,
        transition: { duration: 0.3 },
      }}
      className="relative bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 md:p-8 overflow-hidden group cursor-pointer gpu-accelerated will-change-transform"
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            </div>
      
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/50 via-cyan-400/50 to-sky-500/50 blur-sm" />
            </div>
      
      {/* Recommended Badge for Value Pack */}
      {bundle.name === 'Value Pack' && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
          <motion.div
            className="relative flex flex-col items-center"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: -10, scale: 0.8 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.15, type: 'spring', stiffness: 200, damping: 15 }}
          >
            {/* Arrow pointing down with gradient */}
            <motion.div
              className="mb-1"
              animate={prefersReducedMotion ? {} : {
                y: [0, -3, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <svg className="w-5 h-5 text-sky-400 drop-shadow-lg filter drop-shadow-[0_0_4px_rgba(56,189,248,0.6)]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </motion.div>
            {/* Recommended badge with glow effect */}
            <div className="bg-gradient-to-r from-sky-500 to-cyan-400 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg shadow-sky-500/50 whitespace-nowrap border border-sky-300/30">
              ⭐ Recommended
            </div>
          </motion.div>
        </div>
      )}
      
      <div className="relative z-10">
        {/* Emoji icon */}
        <motion.div
          className="text-5xl mb-4"
          animate={prefersReducedMotion ? {} : {
            rotate: [0, 10, -10, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 2,
            ease: 'easeInOut',
          }}
        >
          🎁
        </motion.div>
        
        {/* Bundle label (Popular, Premium, Best Value) - SMALL SIZE */}
        {bundle.badgeText && (
          <div className="text-[9px] md:text-[10px] font-semibold text-sky-400 mb-2 uppercase tracking-wider" style={{ fontSize: '0.6rem' }}>
            {bundle.badgeText}
          </div>
        )}
        
        <h3 className="text-base md:text-lg font-bold mb-3 text-white group-hover:text-sky-300 transition-colors truncate" title={bundle.name}>
          {bundle.name}
        </h3>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          {bundle.description}
        </p>
        
        <motion.div
          className="text-3xl font-bold mb-2 bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent"
          initial={prefersReducedMotion ? {} : { scale: 0 }}
          whileInView={prefersReducedMotion ? {} : { scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + index * 0.1, type: 'spring' }}
        >
          ${bundle.totalUsdValue}
        </motion.div>
        
        <div className="text-xs text-slate-500 mb-6 flex flex-wrap gap-2">
          {bundle.tokens.map((t, i) => (
            <span key={i} className="px-2 py-1 bg-slate-700/50 rounded">
              {t.percentage}% {t.tokenSymbol}
            </span>
          ))}
          </div>
        
        <motion.div
          className="w-full bg-gradient-to-r from-slate-700 to-slate-600 hover:from-sky-600 hover:to-cyan-500 text-white text-center py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg group-hover:shadow-xl group-hover:shadow-sky-500/30 cursor-pointer"
          whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
          onClick={() => {
            // Save bundle selection and navigate
            savePendingGift({
              recipient: '',
              recipientType: 'username',
              token: bundle.id,
              amount: bundle.totalUsdValue,
              bundle: bundle,
            });
            navigate('/send');
          }}
        >
          Select
        </motion.div>
                </div>
    </motion.div>
  );
});

BundleCard.displayName = 'BundleCard';

// CTA Section Component
const CTASection: React.FC = memo(() => {
  const prefersReducedMotion = useReducedMotion();
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="relative text-center py-16 md:py-24 px-4 overflow-hidden">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <motion.div
          className="absolute inset-0"
          animate={prefersReducedMotion ? {} : {
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'linear',
          }}
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgb(56, 189, 248) 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
            </div>
      
      <motion.div
        className="relative z-10 max-w-3xl mx-auto"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
        animate={isInView && !prefersReducedMotion ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <motion.h2
          className="text-4xl md:text-6xl font-bold mb-6"
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.9 }}
          animate={isInView && !prefersReducedMotion ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <span className="bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-text">
            Ready to Send a Gift?
          </span>
        </motion.h2>
        
        <motion.p
          className="text-xl md:text-2xl text-slate-300 mb-10"
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={isInView && !prefersReducedMotion ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          It takes less than 2 minutes
        </motion.p>
        
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={isInView && !prefersReducedMotion ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <motion.div
            whileHover={prefersReducedMotion ? {} : { scale: 1.05, y: -2 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
            className="inline-block"
          >
          <Link
            to="/send"
              className="group relative inline-block bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-white px-10 py-5 md:px-12 md:py-6 rounded-xl font-bold text-lg md:text-xl transition-all duration-300 shadow-lg shadow-sky-500/30 hover:shadow-xl hover:shadow-sky-500/50 animate-pulse-glow overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                Send Your First Gift
                <GiftIcon className="w-5 h-5 md:w-6 md:h-6" />
              </span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                initial={false}
              />
          </Link>
          </motion.div>
        </motion.div>
      </motion.div>
        </section>
    );
});

CTASection.displayName = 'CTASection';

// Bundle Section Skeleton Loader
const BundleSectionSkeleton: React.FC = memo(() => {
  return (
    <section className="max-w-6xl mx-auto px-4">
      <div className="text-4xl md:text-5xl font-bold text-center mb-4 md:mb-6">
        <div className="h-12 w-64 bg-slate-700 rounded-lg mx-auto animate-pulse" />
      </div>
      
      <div className="grid md:grid-cols-3 gap-6 md:gap-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="relative bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 md:p-8 overflow-hidden animate-pulse"
          >
            <div className="h-16 w-16 bg-slate-700 rounded-full mb-4" />
            <div className="h-4 w-20 bg-slate-700 rounded mb-2" />
            <div className="h-6 w-32 bg-slate-700 rounded mb-3" />
            <div className="h-4 w-full bg-slate-700 rounded mb-2" />
            <div className="h-4 w-3/4 bg-slate-700 rounded mb-4" />
            <div className="h-8 w-24 bg-slate-700 rounded mb-4" />
            <div className="flex gap-2 mb-6">
              <div className="h-5 w-16 bg-slate-700 rounded" />
              <div className="h-5 w-16 bg-slate-700 rounded" />
            </div>
            <div className="h-10 w-full bg-slate-700 rounded-xl" />
          </div>
        ))}
      </div>
    </section>
  );
});

BundleSectionSkeleton.displayName = 'BundleSectionSkeleton';

// Landing Page Component (defined later in file)

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

// Modern Landing Page Component
interface LandingPageProps {
  bundles: Bundle[];
  bundlesLoading: boolean;
}

const LandingPage: React.FC<LandingPageProps> = memo(({ bundles, bundlesLoading }) => {
  const prefersReducedMotion = useReducedMotion();

  const heroVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeOut',
      },
    },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  return (
    <div className="relative min-h-screen">
      <AnimatedGradient className="absolute inset-0 -z-10" />
      <FloatingParticles count={prefersReducedMotion ? 0 : 25} />
      
      <div className="relative space-y-24 md:space-y-32 py-12 md:py-20">
        {/* Hero Section */}
        <motion.section
          className="relative text-center px-4"
          variants={prefersReducedMotion ? {} : heroVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            className="max-w-5xl mx-auto"
            variants={prefersReducedMotion ? {} : itemVariants}
          >
            <motion.h1
              className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 md:mb-8 leading-tight"
              variants={prefersReducedMotion ? {} : itemVariants}
            >
              <span className="animate-gradient-text bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-400 bg-clip-text text-transparent bg-[length:200%_auto]">
                Send Crypto Gifts
              </span>
              <br />
              <motion.span
                className="animate-gradient-text bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent bg-[length:200%_auto]"
                variants={prefersReducedMotion ? {} : itemVariants}
              >
                In Seconds
              </motion.span>
            </motion.h1>
            
            <motion.p
              className="text-lg md:text-xl lg:text-2xl text-slate-300 mb-10 md:mb-12 max-w-3xl mx-auto leading-relaxed"
              variants={prefersReducedMotion ? {} : itemVariants}
            >
              The easiest way to send cryptocurrency to friends and family.
              <br className="hidden md:block" />
              <span className="text-slate-400">No wallet needed. No crypto knowledge required.</span>
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12"
              variants={prefersReducedMotion ? {} : itemVariants}
            >
              <motion.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.05, y: -2 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
              >
                <Link
                  to="/send"
                  className="group relative inline-block bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-white px-8 py-4 md:px-10 md:py-5 rounded-xl font-bold text-lg md:text-xl transition-all duration-300 shadow-lg shadow-sky-500/30 hover:shadow-xl hover:shadow-sky-500/50 overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Send a Gift
                    <GiftIcon className="w-5 h-5 md:w-6 md:h-6" />
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    initial={false}
                  />
                </Link>
              </motion.div>
              
              <motion.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
              >
                <Link
                  to="/login"
                  className="border-2 border-slate-600 hover:border-slate-500 text-slate-200 hover:text-white px-8 py-4 md:px-10 md:py-5 rounded-xl font-semibold text-lg md:text-xl transition-all duration-300 hover:bg-slate-800/50 backdrop-blur-sm"
                >
                  Sign In
                </Link>
              </motion.div>
            </motion.div>

            <motion.div
              className="flex flex-wrap gap-6 md:gap-8 justify-center text-sm md:text-base"
              variants={prefersReducedMotion ? {} : itemVariants}
            >
              {['Easy to use', 'Instant delivery', 'Secure & private'].map((feature, index) => (
                <motion.div
                  key={feature}
                  className="flex items-center gap-2 text-slate-400"
                  initial={prefersReducedMotion ? {} : { opacity: 0, x: -10 }}
                  animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                >
                  <motion.div
                    initial={prefersReducedMotion ? {} : { scale: 0 }}
                    animate={prefersReducedMotion ? {} : { scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.1, type: 'spring' }}
                    className="text-green-400 text-lg"
                  >
                    ✓
                  </motion.div>
                  <span>{feature}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <div className="mt-16 md:mt-20">
            <ScrollIndicator />
          </div>
        </motion.section>

        {/* How It Works */}
        <HowItWorksSection />

        {/* Popular Bundles */}
        {bundlesLoading ? (
          <BundleSectionSkeleton />
        ) : bundles.length > 0 ? (
          <BundleSection bundles={bundles} />
        ) : null}

        {/* CTA Section */}
        <CTASection />
      </div>
    </div>
  );
});

LandingPage.displayName = 'LandingPage';
