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
    if (value.includes('@') && value.includes('.')) return 'email';
    if (value.startsWith('@')) return 'username';
    if (value.length > 32) return 'wallet'; // Solana wallet address
    return 'username';
  };

  const handleSubmit = () => {
    if (!recipient.trim()) {
      setError('Please enter a recipient');
      return;
    }
    
    const recipientType = initialRecipientType || detectRecipientType(recipient);
    
    onNext({ 
      recipient: recipient.trim(),
      recipientType 
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-white">Who are you sending to?</h2>
        <p className="text-slate-400">Enter their username, email, or wallet address</p>
      </div>
      
      {/* Input field */}
      <div>
        <input 
          type="text"
          placeholder="@username, email, or wallet address"
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
      
      {/* Quick select contacts (optional) */}
      <div>
        <p className="text-sm text-slate-500 mb-3">Or choose from recent:</p>
        <div className="grid grid-cols-3 gap-3">
          {['@john', '@sarah', '@alex'].map(contact => (
            <button
              key={contact}
              onClick={() => setRecipient(contact)}
              className="px-4 py-2 border-2 border-slate-600 rounded-lg hover:border-sky-500 transition text-slate-300"
            >
              {contact}
            </button>
          ))}
        </div>
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

