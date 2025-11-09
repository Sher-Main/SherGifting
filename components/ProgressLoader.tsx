import React, { useEffect, useState } from 'react';

interface ProgressLoaderProps {
  stage: 'authenticating' | 'setting-up' | 'preparing' | 'ready';
  message?: string;
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

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({ stage, message }) => {
  const [progress, setProgress] = useState(0);
  const targetProgress = STAGE_PROGRESS[stage];
  const displayMessage = message || STAGE_MESSAGES[stage];

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

