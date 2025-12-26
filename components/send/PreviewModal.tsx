'use client';

import React from 'react';
import { PendingGift } from '../../lib/giftStore';

interface PreviewModalProps {
  giftData: PendingGift;
  onConfirm: () => void;
  onBack: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ 
  giftData, 
  onConfirm, 
  onBack 
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🎁</div>
        <h2 className="text-3xl font-bold mb-2 text-white">Preview Your Gift</h2>
        <p className="text-slate-400">Everything look good?</p>
      </div>
      
      {/* Gift summary card */}
      <div className="bg-gradient-to-br from-sky-500/10 to-cyan-500/10 border-2 border-sky-500 rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">To:</span>
          <span className="font-semibold text-lg text-white">{giftData.recipient}</span>
        </div>
        
        <div className="h-px bg-sky-500/30"></div>
        
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Amount:</span>
          <span className="font-bold text-2xl text-sky-400">
            ${giftData.amount} {giftData.token}
          </span>
        </div>
        
        {giftData.bundle && (
          <>
            <div className="h-px bg-sky-500/30"></div>
            <div>
              <span className="text-slate-400 block mb-2">Bundle includes:</span>
              <div className="space-y-1">
                {giftData.bundle.tokens.map((item, i) => (
                  <div key={i} className="text-sm text-slate-300">
                    • {item.percentage}% {item.tokenSymbol}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        
        {giftData.message && (
          <>
            <div className="h-px bg-sky-500/30"></div>
            <div>
              <span className="text-slate-400 block mb-2">Message:</span>
              <p className="italic text-slate-300">"{giftData.message}"</p>
            </div>
          </>
        )}
      </div>
      
      {/* Info box */}
      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-4 text-sm">
        <p className="text-sky-300">
          💡 You'll be asked to sign in on the next step to complete your gift.
        </p>
      </div>
      
      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border-2 border-slate-600 text-slate-300 py-3 rounded-lg font-semibold hover:bg-slate-700 transition"
        >
          ← Edit
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-3 rounded-lg font-semibold hover:from-sky-600 hover:to-cyan-500 transition"
        >
          Confirm & Send 🚀
        </button>
      </div>
    </div>
  );
};

