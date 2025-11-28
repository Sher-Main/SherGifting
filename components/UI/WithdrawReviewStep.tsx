import React from 'react';
import { Edit2, ArrowUpRight } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';

interface WithdrawReviewStepProps {
  withdrawalAddress: string;
  amount: number;
  tokenSymbol: string;
  tokenName: string;
  usdValue: number | null;
  fee: number;
  total: number;
  usdFee: number | null;
  usdTotal: number | null;
  remainingBalance: number;
  remainingBalanceUsd: number | null;
  onEditStep: (step: number) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
}

const WithdrawReviewStep: React.FC<WithdrawReviewStepProps> = ({
  withdrawalAddress,
  amount,
  tokenSymbol,
  tokenName,
  usdValue,
  fee,
  total,
  usdFee,
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

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Review Withdrawal</h2>
        <p className="text-[#94A3B8] text-sm">Double-check everything before sending</p>
      </div>

      <GlassCard>
        <div className="space-y-6">
          {/* Recipient Address */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight size={16} className="text-[#94A3B8]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Withdrawal Address</span>
              </div>
              <p className="text-white font-mono text-sm break-all">{withdrawalAddress}</p>
              <p className="text-xs text-[#64748B] mt-1">Solana network</p>
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

          <div className="h-px bg-white/10" />

          {/* Amount */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Amount</span>
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

          {/* Cost Breakdown */}
          <div className="h-px bg-white/10" />
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-3">Cost Breakdown</span>
            
            <div className="flex justify-between text-sm">
              <span className="text-[#94A3B8]">Withdrawal amount</span>
              <span className="text-white font-medium">
                {amount.toFixed(4)} {tokenSymbol}
                {usdValue && <span className="ml-2 text-[#94A3B8]">({formatCurrency(usdValue)})</span>}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-[#94A3B8]">Network fee</span>
              <span className="text-white font-medium">
                {fee.toFixed(6)} SOL
                {usdFee && <span className="ml-2 text-[#94A3B8]">({formatCurrency(usdFee)})</span>}
              </span>
            </div>

            <div className="flex justify-between text-base font-bold pt-2 border-t border-white/10">
              <span className="text-white">Total</span>
              <span className="text-white">
                {total.toFixed(6)} SOL
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
        {isSubmitting ? 'Processing Withdrawal...' : 'Confirm Withdrawal'}
      </GlowButton>
    </div>
  );
};

export default WithdrawReviewStep;


