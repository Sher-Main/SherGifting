import React, { useEffect, useState } from 'react';

interface ProgressLoaderProps {
  stage: 'authenticating' | 'setting-up' | 'preparing' | 'ready';
  message?: string;
}

interface LoadingTip {
  emoji: string;
  title: string;
  text: string;
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
    emoji: '🎁',
    title: 'Quick Start',
    text: 'Send crypto gifts in 3 steps: Select token → Enter amount → Share link'
  },
  {
    emoji: '👥',
    title: 'Gift to Anyone',
    text: 'Recipients don\'t need a wallet—they can claim and set one up instantly'
  },
  {
    emoji: '💰',
    title: 'Add Funds',
    text: 'Connect Phantom, Solflare, or any Solana wallet to deposit tokens'
  },
  {
    emoji: '🔒',
    title: 'Secure & Safe',
    text: 'Every gift is secured on Solana blockchain with unique claim links'
  },
  {
    emoji: '📊',
    title: 'Track Gifts',
    text: 'View all your sent gifts and their status from your dashboard'
  },
  {
    emoji: '✨',
    title: 'Personalize',
    text: 'Add a custom message to make your crypto gift more meaningful'
  },
  {
    emoji: '⚡',
    title: 'Low Fees',
    text: 'Solana\'s low transaction costs mean more value reaches your recipient'
  },
  {
    emoji: '♾️',
    title: 'No Expiry',
    text: 'Gift links never expire—recipients can claim whenever they\'re ready'
  },
  {
    emoji: '🌐',
    title: 'Email or Phone',
    text: 'Send gifts to anyone using just their email address'
  },
  {
    emoji: '🚀',
    title: 'Instant Claims',
    text: 'Recipients can claim gifts and create a wallet in under 30 seconds'
  }
];

const fallbackTip: LoadingTip = {
  emoji: '🎁',
  title: 'Loading',
  text: 'Please wait while we prepare your experience...'
};

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({ stage, message }) => {
  const [progress, setProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const targetProgress = STAGE_PROGRESS[stage];
  const displayMessage = message || STAGE_MESSAGES[stage];

  // Defensive programming: ensure we always have a valid tip
  const currentTip = loadingTips[currentTipIndex] || fallbackTip;

  useEffect(() => {
    // Smooth progress bar animation
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

  // Tip rotation logic - rotate every 3 seconds
  useEffect(() => {
    // CRITICAL: Clean up on unmount to prevent memory leaks
    const intervalId = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % loadingTips.length);
    }, 3000); // 3 second intervals

    // Cleanup function
    return () => clearInterval(intervalId);
  }, []); // Empty deps array - only run once on mount

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-4xl">🎁</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Crypto Gifting App</h1>
        </div>

        {/* Progress Bar */}
        <div className="bg-white/20 rounded-full h-3 mb-4 overflow-hidden backdrop-blur-sm">
          <div 
            className="h-full bg-gradient-to-r from-green-400 to-blue-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-white text-lg font-medium mb-2">
            {displayMessage}
          </p>
          <p className="text-white/70 text-sm">
            {progress < 100 ? 'This will only take a moment' : 'Ready!'}
          </p>
        </div>

        {/* Tips Section */}
        <div 
          role="status" 
          aria-live="polite"
          aria-atomic="true"
          className="mt-6 mb-6"
        >
          <div 
            key={currentTipIndex}
            className="bg-white/10 backdrop-blur-sm rounded-lg p-4 sm:p-6 border border-white/20 fade-in"
          >
            <div className="text-center">
              <h3 className="text-white text-lg sm:text-xl font-bold mb-2 flex items-center justify-center gap-2">
                <span>{currentTip.emoji}</span>
                <span>{currentTip.title}</span>
              </h3>
              <p className="text-white/90 text-sm sm:text-base leading-relaxed">
                {currentTip.text}
              </p>
            </div>
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mt-4">
            {loadingTips.map((_, index) => (
              <div
                key={index}
                className={`transition-all duration-300 rounded-full ${
                  index === currentTipIndex
                    ? 'bg-white w-6 h-2'
                    : 'bg-white/30 w-2 h-2'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* Animated dots */}
        <div className="flex justify-center space-x-2 mt-6">
          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
        </div>
      </div>
    </div>
  );
};






