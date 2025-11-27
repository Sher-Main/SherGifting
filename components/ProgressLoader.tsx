import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gift, 
  Users, 
  Wallet, 
  Shield, 
  BarChart3, 
  Sparkles, 
  Zap, 
  Infinity, 
  Globe, 
  Rocket,
  Loader2
} from 'lucide-react';
import GlassCard from './UI/GlassCard';
import HolidayBackground from './HolidayBackground';

interface ProgressLoaderProps {
  stage: 'authenticating' | 'setting-up' | 'preparing' | 'ready';
  message?: string;
}

interface LoadingTip {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  text: string;
  color: string;
}

const STAGE_MESSAGES = {
  authenticating: 'Signing you in...',
  'setting-up': 'Setting up your account...',
  preparing: 'Preparing your experience...',
  ready: 'Almost there...'
};

const STAGE_PROGRESS = {
  authenticating: 25,
  'setting-up': 50,
  preparing: 75,
  ready: 100
};

const loadingTips: LoadingTip[] = [
  {
    icon: Gift,
    title: 'Quick Start',
    text: 'Send crypto gifts in 3 steps: Select token → Enter amount → Share link',
    color: 'text-[#BE123C]'
  },
  {
    icon: Users,
    title: 'Gift to Anyone',
    text: 'Recipients don\'t need a wallet—they can claim and set one up instantly',
    color: 'text-[#06B6D4]'
  },
  {
    icon: Wallet,
    title: 'Add Funds',
    text: 'Connect Phantom, Solflare, or any Solana wallet to deposit tokens',
    color: 'text-[#FCD34D]'
  },
  {
    icon: Shield,
    title: 'Secure & Safe',
    text: 'Every gift is secured on Solana blockchain with unique claim links',
    color: 'text-[#10B981]'
  },
  {
    icon: BarChart3,
    title: 'Track Gifts',
    text: 'View all your sent gifts and their status from your dashboard',
    color: 'text-[#06B6D4]'
  },
  {
    icon: Sparkles,
    title: 'Personalize',
    text: 'Add a custom message to make your crypto gift more meaningful',
    color: 'text-[#FCD34D]'
  },
  {
    icon: Zap,
    title: 'Low Fees',
    text: 'Solana\'s low transaction costs mean more value reaches your recipient',
    color: 'text-[#FFB217]'
  },
  {
    icon: Infinity,
    title: 'No Expiry',
    text: 'Gift links never expire—recipients can claim whenever they\'re ready',
    color: 'text-[#06B6D4]'
  },
  {
    icon: Globe,
    title: 'Email or Phone',
    text: 'Send gifts to anyone using just their email address',
    color: 'text-[#BE123C]'
  },
  {
    icon: Rocket,
    title: 'Instant Claims',
    text: 'Recipients can claim gifts and create a wallet in under 30 seconds',
    color: 'text-[#10B981]'
  }
];

const fallbackTip: LoadingTip = {
  icon: Gift,
  title: 'Loading',
  text: 'Please wait while we prepare your experience...',
  color: 'text-[#BE123C]'
};

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({ stage, message }) => {
  const [progress, setProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const targetProgress = STAGE_PROGRESS[stage];
  const displayMessage = message || STAGE_MESSAGES[stage];

  const currentTip = loadingTips[currentTipIndex] || fallbackTip;
  const IconComponent = currentTip.icon;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) {
          clearInterval(interval);
          return targetProgress;
        }
        return prev + 2;
      });
    }, 20);

    return () => clearInterval(interval);
  }, [targetProgress]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % loadingTips.length);
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-[#0B1120] overflow-hidden">
      <HolidayBackground />
      
      {/* Subtle gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#BE123C]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#06B6D4]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <GlassCard className="p-8 sm:p-10" glow>
            {/* Logo/Brand */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-20 h-20 bg-gradient-to-br from-[#BE123C] to-[#EF4444] rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg shadow-[#BE123C]/30"
              >
                <Gift className="text-white" size={32} strokeWidth={2.5} />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="text-2xl sm:text-3xl font-bold text-white mb-2"
              >
                Crypto<span className="text-[#BE123C]">Gifting</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-xs text-[#94A3B8]"
              >
                powered by <span className="text-[#D97706]">sher</span>
              </motion.p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="bg-[#1E293B]/60 rounded-full h-2 mb-3 overflow-hidden backdrop-blur-sm border border-white/5">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#BE123C] via-[#FCD34D] to-[#06B6D4] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              
              {/* Progress percentage */}
              <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-2">
                <span>{displayMessage}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>

            {/* Loading spinner */}
            <div className="flex justify-center mb-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="text-[#06B6D4]" size={24} />
              </motion.div>
            </div>

            {/* Tips Section */}
            <div 
              role="status" 
              aria-live="polite"
              aria-atomic="true"
              className="mt-6"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTipIndex}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="bg-[#0F172A]/60 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
                >
                  <div className="flex items-start gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
                      style={{
                        background: currentTip.color === 'text-[#BE123C]' 
                          ? 'linear-gradient(to bottom right, rgba(190, 18, 60, 0.2), transparent)'
                          : currentTip.color === 'text-[#06B6D4]'
                          ? 'linear-gradient(to bottom right, rgba(6, 182, 212, 0.2), transparent)'
                          : currentTip.color === 'text-[#FCD34D]'
                          ? 'linear-gradient(to bottom right, rgba(252, 211, 77, 0.2), transparent)'
                          : currentTip.color === 'text-[#10B981]'
                          ? 'linear-gradient(to bottom right, rgba(16, 185, 129, 0.2), transparent)'
                          : currentTip.color === 'text-[#FFB217]'
                          ? 'linear-gradient(to bottom right, rgba(255, 178, 23, 0.2), transparent)'
                          : 'linear-gradient(to bottom right, rgba(190, 18, 60, 0.2), transparent)',
                        borderColor: currentTip.color === 'text-[#BE123C]' 
                          ? 'rgba(190, 18, 60, 0.3)'
                          : currentTip.color === 'text-[#06B6D4]'
                          ? 'rgba(6, 182, 212, 0.3)'
                          : currentTip.color === 'text-[#FCD34D]'
                          ? 'rgba(252, 211, 77, 0.3)'
                          : currentTip.color === 'text-[#10B981]'
                          ? 'rgba(16, 185, 129, 0.3)'
                          : currentTip.color === 'text-[#FFB217]'
                          ? 'rgba(255, 178, 23, 0.3)'
                          : 'rgba(190, 18, 60, 0.3)'
                      }}
                    >
                      <IconComponent className={currentTip.color} size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white text-lg font-bold mb-2">
                        {currentTip.title}
                      </h3>
                      <p className="text-[#94A3B8] text-sm leading-relaxed">
                        {currentTip.text}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Progress Dots */}
              <div className="flex justify-center gap-2 mt-6">
                {loadingTips.map((_, index) => (
                  <motion.button
                    key={index}
                    className={`transition-all duration-300 rounded-full ${
                      index === currentTipIndex
                        ? 'bg-[#BE123C] w-8 h-2'
                        : 'bg-white/20 w-2 h-2 hover:bg-white/30'
                    }`}
                    aria-label={`Tip ${index + 1} of ${loadingTips.length}`}
                    onClick={() => setCurrentTipIndex(index)}
                  />
                ))}
              </div>
            </div>

            {/* Status message */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center text-xs text-[#64748B] mt-6"
            >
              {progress < 100 ? 'This will only take a moment' : 'Ready!'}
            </motion.p>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
};






