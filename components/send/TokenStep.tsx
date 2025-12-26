'use client';

import React, { useState, useEffect } from 'react';
import { Bundle } from '../../types';
import { bundleService } from '../../services/api';
import { PendingGift } from '../../lib/giftStore';

interface TokenStepProps {
  initialValue?: string;
  initialBundle?: Bundle;
  onNext: (data: { token: string; bundle?: Bundle }) => void;
  onBack: () => void;
}

// Available individual tokens
const TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', icon: '💵', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { symbol: 'SOL', name: 'Solana', icon: '◎' },
  { symbol: 'USDT', name: 'Tether', icon: '💰', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
];

export const TokenStep: React.FC<TokenStepProps> = ({ 
  initialValue = '', 
  initialBundle,
  onNext, 
  onBack 
}) => {
  const [selectedToken, setSelectedToken] = useState(initialValue);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | undefined>(initialBundle);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bundleService.getBundles()
      .then((fetchedBundles) => {
        setBundles(fetchedBundles);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching bundles:', error);
        setLoading(false);
      });
  }, []);

  const handleTokenSelect = (token: string) => {
    setSelectedToken(token);
    setSelectedBundle(undefined);
  };

  const handleBundleSelect = (bundle: Bundle) => {
    setSelectedBundle(bundle);
    setSelectedToken(bundle.id);
  };

  const handleSubmit = () => {
    if (selectedBundle) {
      onNext({ token: selectedBundle.id, bundle: selectedBundle });
    } else if (selectedToken) {
      onNext({ token: selectedToken });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">What do you want to send?</h2>
        <p className="text-slate-400">Choose a token or a pre-made bundle</p>
      </div>
      
      {/* Individual tokens */}
      <div>
        <p className="font-semibold mb-3 text-white">Individual Tokens</p>
        <div className="grid grid-cols-3 gap-4">
          {TOKENS.map(token => (
            <button
              key={token.symbol}
              onClick={() => handleTokenSelect(token.symbol)}
              className={`
                p-4 border-2 rounded-lg transition text-center
                ${selectedToken === token.symbol && !selectedBundle
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-600 hover:border-sky-400'}
              `}
            >
              <div className="text-3xl mb-2">{token.icon}</div>
              <div className="font-semibold text-white">{token.symbol}</div>
              <div className="text-xs text-slate-400">{token.name}</div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Bundles */}
      <div>
        <p className="font-semibold mb-3 text-white">Gift Bundles</p>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading bundles...</div>
        ) : (
          <div className="space-y-3">
            {bundles.map(bundle => (
              <button
                key={bundle.id}
                onClick={() => handleBundleSelect(bundle)}
                className={`
                  w-full p-4 border-2 rounded-lg transition text-left
                  ${selectedBundle?.id === bundle.id
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-slate-600 hover:border-sky-400'}
                `}
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl">🎁</div>
                  <div className="flex-1">
                    <div className="font-semibold text-white">{bundle.name}</div>
                    <div className="text-sm text-slate-400">{bundle.description}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {bundle.tokens.map(item => `${item.percentage}% ${item.tokenSymbol}`).join(' + ')}
                    </div>
                  </div>
                  <div className="font-bold text-lg text-sky-400">${bundle.totalUsdValue}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border-2 border-slate-600 text-slate-300 py-3 rounded-lg font-semibold hover:bg-slate-700 transition"
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedToken}
          className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-3 rounded-lg font-semibold hover:from-sky-600 hover:to-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

