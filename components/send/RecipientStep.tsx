'use client';

import React, { useState } from 'react';
import { PendingGift } from '../../lib/giftStore';

interface RecipientStepProps {
  initialValue?: string;
  initialRecipientType?: 'username' | 'wallet' | 'email';
  onNext: (data: { recipient: string; recipientType: 'username' | 'wallet' | 'email' }) => void;
}

export const RecipientStep: React.FC<RecipientStepProps> = ({ 
  initialValue = '', 
  initialRecipientType,
  onNext 
}) => {
  const [recipient, setRecipient] = useState(initialValue);
  const [error, setError] = useState('');

  const detectRecipientType = (value: string): 'username' | 'wallet' | 'email' => {
    // Only accept emails - must have @ and .
    if (value.includes('@') && value.includes('.')) return 'email';
    // Reject usernames starting with @
    if (value.startsWith('@')) {
      return 'email'; // Force to email type but will show error
    }
    // For wallet addresses, check length
    if (value.length > 32) return 'wallet';
    // Default to email (will validate)
    return 'email';
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!recipient.trim()) {
      setError('Please enter a recipient email');
      return;
    }
    
    const recipientType = initialRecipientType || detectRecipientType(recipient);
    
    // Validate email format
    if (recipientType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipient.trim())) {
        setError('Please enter a valid email address');
        return;
      }
    }
    
    // Reject usernames
    if (recipient.trim().startsWith('@')) {
      setError('Please enter an email address, not a username');
      return;
    }

    onNext({
      recipient: recipient.trim(),
      recipientType: recipientType === 'email' ? 'email' : recipientType,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">Who are you sending to?</h2>
        <p className="text-slate-400">Enter their email address</p>
      </div>
      
      {/* Input field */}
      <div>
        <input 
          type="email"
          placeholder="recipient@example.com"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setError('');
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSubmit();
            }
          }}
          className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-900 text-white rounded-lg focus:border-sky-500 focus:outline-none text-lg"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>
      
      {/* Next button */}
      <button
        onClick={handleSubmit}
        disabled={!recipient.trim()}
        className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-3 rounded-lg font-semibold hover:from-sky-600 hover:to-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition"
      >
        Next →
      </button>
    </div>
  );
};

