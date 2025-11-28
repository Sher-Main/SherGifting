import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';

interface BalanceResolutionPanelProps {
  balanceError: string | null;
  requiredAmount?: number;
  currentBalance?: number;
  onAddFunds?: () => void;
}

const BalanceResolutionPanel: React.FC<BalanceResolutionPanelProps> = ({
  balanceError,
  requiredAmount,
  currentBalance,
  onAddFunds,
}) => {
  const navigate = useNavigate();

  if (!balanceError) return null;

  const handleAddFunds = () => {
    if (onAddFunds) {
      onAddFunds();
    } else {
      navigate('/add-funds');
    }
  };

  // Extract shortfall from error message if not provided
  const extractShortfall = (error: string): number | null => {
    const match = error.match(/need ([\d.]+)/i);
    return match ? parseFloat(match[1]) : null;
  };

  const shortfall = requiredAmount || extractShortfall(balanceError) || 0;
  const balance = currentBalance || 0;

  return (
    <GlassCard className="border-[#EF4444]/20 bg-[#7F1D1D]/10">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#EF4444]/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-[#EF4444]" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-1">Insufficient Balance</h3>
            <p className="text-xs text-[#94A3B8] mb-3">
              {balanceError}
            </p>
            
            {shortfall > 0 && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94A3B8]">Required:</span>
                  <span className="text-white font-medium">{shortfall.toFixed(4)} SOL</span>
                </div>
                {balance > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[#94A3B8]">Current:</span>
                    <span className="text-white font-medium">{balance.toFixed(4)} SOL</span>
                  </div>
                )}
                <div className="flex justify-between text-xs border-t border-white/10 pt-2">
                  <span className="text-[#FCD34D] font-medium">Shortfall:</span>
                  <span className="text-[#FCD34D] font-bold">~{shortfall.toFixed(4)} SOL</span>
                </div>
              </div>
            )}

            <GlowButton
              variant="primary"
              fullWidth
              icon={ArrowUpRight}
              onClick={handleAddFunds}
            >
              Add Funds
            </GlowButton>
            <p className="text-xs text-[#64748B] mt-2 text-center">
              Add funds to your wallet to continue
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

export default BalanceResolutionPanel;


