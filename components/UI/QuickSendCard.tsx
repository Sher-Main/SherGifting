import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Token } from '../../types';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import InputField from './InputField';
import { Gift, Mail } from 'lucide-react';

interface QuickSendCardProps {
  tokens: Token[];
  defaultToken?: Token | null;
  className?: string;
}

const QuickSendCard: React.FC<QuickSendCardProps> = ({
  tokens,
  defaultToken,
  className = '',
}) => {
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<Token | null>(defaultToken || tokens[0] || null);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  useEffect(() => {
    if (tokens.length > 0 && !selectedToken) {
      const solToken = tokens.find(t => t.symbol === 'SOL') || tokens[0];
      setSelectedToken(solToken);
    }
  }, [tokens, selectedToken]);

  const quickAmounts = [
    { label: '$10', value: '10' },
    { label: '$25', value: '25' },
    { label: '$50', value: '50' },
    { label: '$100', value: '100' },
    { label: 'Custom', value: 'custom' },
  ];

  const handleChipClick = (value: string) => {
    if (value === 'custom') {
      setSelectedChip('custom');
      setAmount('');
    } else {
      setSelectedChip(value);
      setAmount(value);
    }
  };

  const handleSendGift = () => {
    if (!recipient.trim() || !amount || !selectedToken) {
      return;
    }

    // Navigate to gift page with pre-filled state
    navigate('/gift', {
      state: {
        recipient: recipient.trim(),
        amount: amount,
        tokenMint: selectedToken.mint,
        tokenSymbol: selectedToken.symbol,
      },
    });
  };

  const canSend = recipient.trim().length > 0 && amount.length > 0 && selectedToken;

  return (
    <GlassCard variant="gift" className={className}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Gift size={18} className="text-[#BE123C]" />
          <h3 className="text-lg font-bold text-white">Quick Send</h3>
        </div>

        {/* Recipient Input */}
        <InputField
          label="Recipient"
          placeholder="recipient@example.com or @username"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          icon={Mail}
          helperText="We'll send a secure claim link"
        />

        {/* Amount Input with Quick Chips */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1 mb-2 block">
            Amount (USD)
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {quickAmounts.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => handleChipClick(chip.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedChip === chip.value
                    ? 'bg-[#06B6D4] text-white shadow-lg'
                    : 'bg-[#0F172A]/50 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white border border-white/10'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {selectedChip === 'custom' && (
            <InputField
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText="Amount in USD"
            />
          )}
        </div>

        {/* Token Selector */}
        {tokens.length > 0 && (
          <div>
            <label htmlFor="quick-token" className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1 mb-2 block">
              Token
            </label>
            <div className="relative">
              <select
                id="quick-token"
                value={selectedToken?.mint || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.mint === e.target.value);
                  setSelectedToken(token || null);
                }}
                className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none appearance-none focus:border-[#BE123C] focus:ring-4 focus:ring-[#BE123C]/10 transition"
              >
                {tokens.map(token => (
                  <option key={token.mint} value={token.mint}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#94A3B8]">▼</div>
            </div>
          </div>
        )}

        {/* Send Gift Button */}
        <GlowButton
          variant="cyan"
          fullWidth
          icon={Gift}
          onClick={handleSendGift}
          disabled={!canSend}
        >
          Send Gift
        </GlowButton>
      </div>
    </GlassCard>
  );
};

export default QuickSendCard;


