import React, { useState } from 'react';

interface OnrampCreditData {
  id: string;
  creditsRemaining: number;
  cardAddsFreeRemaining: number;
  cardAddsAllowed: number;
  daysRemaining: number;
  expiresAt: string;
}

interface OnrampCreditPopupProps {
  credit: OnrampCreditData;
  onClose: () => void;
}

/**
 * OnrampCreditPopup
 * 
 * Beautiful popup showing:
 * - "You got a gift!" 🎁
 * - $5 credit breakdown
 * - How many free cards they have
 * - When it expires
 * 
 * Appears when user opens "Send Gift"
 * and has active onramp credit
 */
export function OnrampCreditPopup({
  credit,
  onClose,
}: OnrampCreditPopupProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleDismiss}
    >
      <div
        className="max-w-md w-[90%] bg-slate-800 border border-slate-700 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          {/* Header Icon */}
          <div
            className="text-center text-6xl mb-6 animate-bounce"
            style={{
              animation: 'bounce 0.6s ease-in-out',
            }}
          >
            🎁
          </div>

          {/* Title */}
          <h2 className="text-center mb-3 text-3xl font-semibold text-white">
            You Got a Gift! 🎉
          </h2>

          {/* Description */}
          <p className="text-center mb-7 text-sm text-slate-400 leading-relaxed">
            We know MoonPay charges a fee for onramping. Here's what we're
            giving back to thank you for joining!
          </p>

          {/* Credit Box */}
          <div className="bg-sky-500/10 border-2 border-sky-500/30 rounded-xl p-5 mb-6 text-center">
            {/* Amount */}
            <div className="text-4xl font-bold text-sky-400 mb-2">
              ${credit.creditsRemaining.toFixed(2)}
            </div>

            {/* Description */}
            <div className="text-base font-medium text-white mb-1">
              in Gift Credits
            </div>

            {/* What it means */}
            <div className="text-sm text-slate-300">
              = {credit.cardAddsAllowed} free card transfers
            </div>

            {/* Remaining counter */}
            <div className="text-sm font-semibold text-green-400 mt-2">
              ({credit.cardAddsFreeRemaining} of {credit.cardAddsAllowed} remaining)
            </div>
          </div>

          {/* Benefits List */}
          <div className="bg-slate-900/50 rounded-xl p-4 mb-7">
            {/* Item 1: Normal price */}
            <div className="flex items-start mb-3.5 text-sm">
              <span className="mr-2.5 text-lg text-white">✓</span>
              <div className="text-white">
                <strong>Usually $1</strong> per card transfer
              </div>
            </div>

            {/* Item 2: Free now */}
            <div className="flex items-start mb-3.5 text-sm">
              <span className="mr-2.5 text-lg text-green-400">✨</span>
              <div className="text-white">
                <strong>Now: FREE</strong> (up to {credit.cardAddsAllowed} times)
              </div>
            </div>

            {/* Item 3: Expiry */}
            <div className="flex items-start text-sm">
              <span className="mr-2.5 text-lg">⏰</span>
              <div className="text-white">
                Valid for <strong>{credit.daysRemaining} more days</strong>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <button
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-3 px-5 rounded-lg mb-2.5 transition-colors text-base"
            onClick={handleDismiss}
          >
            Got It! Start Sending 🚀
          </button>

          <button
            className="w-full bg-transparent border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white font-medium py-3 px-5 rounded-lg transition-colors text-sm"
            onClick={handleDismiss}
          >
            Learn More
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }
      `}</style>
    </div>
  );
}

