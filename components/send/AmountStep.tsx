'use client';

import React, { useState } from 'react';

interface AmountStepProps {
  selectedToken: string;
  initialValue?: number;
  onNext: (data: { amount: number }) => void;
  onBack: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500];

export const AmountStep: React.FC<AmountStepProps> = ({ 
  selectedToken, 
  initialValue = 0, 
  onNext, 
  onBack 
}) => {
  const [amount, setAmount] = useState(initialValue || 0);
  const [customAmount, setCustomAmount] = useState('');

  const handlePresetClick = (value: number) => {
    setAmount(value);
    setCustomAmount('');
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleSubmit = () => {
    if (amount > 0) {
      onNext({ amount });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">How much {selectedToken}?</h2>
        <p className="text-slate-400">Choose a preset amount or enter your own</p>
      </div>
      
      {/* Preset amounts */}
      <div className="grid grid-cols-3 gap-3">
        {PRESET_AMOUNTS.map(preset => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`
              py-4 rounded-lg font-semibold transition
              ${amount === preset && !customAmount
                ? 'bg-gradient-to-r from-sky-500 to-cyan-400 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}
            `}
          >
            ${preset}
          </button>
        ))}
      </div>
      
      {/* Custom amount */}
      <div>
        <label className="block text-sm font-medium mb-2 text-slate-300">Or enter custom amount:</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">$</span>
          <input
            type="number"
            placeholder="0.00"
            value={customAmount}
            onChange={(e) => handleCustomChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border-2 border-slate-600 bg-slate-900 text-white rounded-lg focus:border-sky-500 focus:outline-none text-lg"
            min="0"
            step="0.01"
          />
        </div>
      </div>
      
      {/* Selected amount display */}
      {amount > 0 && (
        <div className="bg-sky-500/10 border-2 border-sky-500 rounded-lg p-4 text-center">
          <p className="text-sm text-slate-400 mb-1">You're sending</p>
          <p className="text-3xl font-bold text-sky-400">
            ${amount.toLocaleString()} {selectedToken}
          </p>
        </div>
      )}
      
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
          disabled={amount <= 0}
          className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-3 rounded-lg font-semibold hover:from-sky-600 hover:to-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

