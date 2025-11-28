import React from 'react';
import { Edit2, Gift, Mail } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import { CARD_TEMPLATES } from '../../lib/cardTemplates';

interface ReviewStepProps {
  recipientLabel: string;
  recipientEmail: string;
  amount: number;
  tokenSymbol: string;
  tokenName: string;
  usdValue: number | null;
  message: string;
  selectedCard: string | null;
  serviceFee: number;
  cardFee: number;
  total: number;
  usdServiceFee: number | null;
  usdCardFee: number | null;
  usdTotal: number | null;
  remainingBalance: number;
  remainingBalanceUsd: number | null;
  onEditStep: (step: number) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
}

const ReviewStep: React.FC<ReviewStepProps> = React.memo(({
  recipientLabel,
  recipientEmail,
  amount,
  tokenSymbol,
  tokenName,
  usdValue,
  message,
  selectedCard,
  serviceFee,
  cardFee,
  total,
  usdServiceFee,
  usdCardFee,
  usdTotal,
  remainingBalance,
  remainingBalanceUsd,
  onEditStep,
  onSubmit,
  isSubmitting = false,
  disabled = false,
}) => {
  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const selectedCardTemplate = selectedCard
    ? CARD_TEMPLATES.find(card => card.id === selectedCard)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Review Your Gift</h2>
        <p className="text-[#94A3B8] text-sm">Double-check everything before sending</p>
      </div>

      <GlassCard>
        <div className="space-y-6">
          {/* Recipient */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={16} className="text-[#94A3B8]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Recipient</span>
              </div>
              <p className="text-white font-medium">{recipientLabel}</p>
              <p className="text-sm text-[#94A3B8]">{recipientEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => onEditStep(1)}
              className="flex items-center gap-1 text-xs text-[#06B6D4] hover:text-[#0891B2] transition-colors"
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>

          <div className="h-px bg-white/10" />

          {/* Token & Amount */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Gift size={16} className="text-[#94A3B8]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Gift Amount</span>
              </div>
              <p className="text-white font-bold text-lg">
                {amount.toFixed(4)} {tokenSymbol}
              </p>
              {usdValue && (
                <p className="text-sm text-[#94A3B8]">{formatCurrency(usdValue)}</p>
              )}
              <p className="text-xs text-[#64748B] mt-1">{tokenName}</p>
            </div>
            <button
              type="button"
              onClick={() => onEditStep(2)}
              className="flex items-center gap-1 text-xs text-[#06B6D4] hover:text-[#0891B2] transition-colors"
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>

          {/* Greeting Card */}
          {selectedCardTemplate && (
            <>
              <div className="h-px bg-white/10" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2 block">Greeting Card</span>
                  <div className="flex items-center gap-3">
                    <img
                      src={selectedCardTemplate.previewUrl}
                      alt={selectedCardTemplate.displayName}
                      className="w-16 h-16 rounded-lg object-cover border border-white/10"
                    />
                    <div>
                      <p className="text-white font-medium text-sm">{selectedCardTemplate.displayName}</p>
                      <p className="text-xs text-[#94A3B8]">{selectedCardTemplate.occasion}</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditStep(3)}
                  className="flex items-center gap-1 text-xs text-[#06B6D4] hover:text-[#0891B2] transition-colors"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
              </div>
            </>
          )}

          {/* Message */}
          {message && (
            <>
              <div className="h-px bg-white/10" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2 block">Message</span>
                  <p className="text-sm text-white italic line-clamp-3">"{message}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => onEditStep(3)}
                  className="flex items-center gap-1 text-xs text-[#06B6D4] hover:text-[#0891B2] transition-colors"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
              </div>
            </>
          )}

          {/* Cost Breakdown */}
          <div className="h-px bg-white/10" />
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-3">Cost Breakdown</span>
            
            <div className="flex justify-between text-sm">
              <span className="text-[#94A3B8]">Gift amount</span>
              <span className="text-white font-medium">
                {amount.toFixed(4)} {tokenSymbol}
                {usdValue && <span className="ml-2 text-[#94A3B8]">({formatCurrency(usdValue)})</span>}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-[#94A3B8]">Service fee</span>
              <span className="text-white font-medium">
                {serviceFee.toFixed(4)} {tokenSymbol}
                {usdServiceFee && <span className="ml-2 text-[#94A3B8]">({formatCurrency(usdServiceFee)})</span>}
              </span>
            </div>

            {cardFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#94A3B8]">Card fee</span>
                <span className="text-white font-medium">
                  {cardFee.toFixed(4)} {tokenSymbol}
                  {usdCardFee && <span className="ml-2 text-[#94A3B8]">({formatCurrency(usdCardFee)})</span>}
                </span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold pt-2 border-t border-white/10">
              <span className="text-white">Total</span>
              <span className="text-white">
                {total.toFixed(4)} {tokenSymbol}
                {usdTotal && <span className="ml-2 text-[#06B6D4]">({formatCurrency(usdTotal)})</span>}
              </span>
            </div>
          </div>

          {/* Remaining Balance */}
          <div className="bg-[#0F172A]/30 rounded-lg p-3 border border-white/5">
            <div className="flex justify-between text-sm">
              <span className="text-[#94A3B8]">Remaining balance</span>
              <span className="text-white font-medium">
                {remainingBalance.toFixed(4)} {tokenSymbol}
                {remainingBalanceUsd && <span className="ml-2 text-[#94A3B8]">({formatCurrency(remainingBalanceUsd)})</span>}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Submit Button */}
      <GlowButton
        variant="cyan"
        fullWidth
        onClick={onSubmit}
        disabled={disabled || isSubmitting}
        type="button"
      >
        {isSubmitting ? 'Creating Gift Link...' : 'Create Gift Link'}
      </GlowButton>
    </div>
  );
});

ReviewStep.displayName = 'ReviewStep';

export default ReviewStep;

