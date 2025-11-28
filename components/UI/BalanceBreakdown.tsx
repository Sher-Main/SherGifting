import React from 'react';
import { TokenBalance } from '../../types';

interface BalanceBreakdownProps {
  balances: TokenBalance[];
  lastUpdated: number | null;
  totalBalance: number;
}

const BalanceBreakdown: React.FC<BalanceBreakdownProps> = ({
  balances,
  lastUpdated,
  totalBalance,
}) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Get top 3 tokens by USD value
  const topTokens = balances
    .filter((b) => b.usdValue && b.usdValue > 0)
    .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
    .slice(0, 3);

  return (
    <div className="space-y-2">
      {/* Token breakdown */}
      {topTokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {topTokens.map((token, index) => (
            <div key={token.address} className="flex items-center gap-2">
              {index > 0 && <span className="text-[#64748B]">•</span>}
              <span className="text-white font-medium">{token.symbol}</span>
              <span className="text-[#94A3B8]">
                {formatCurrency(token.usdValue || 0)}
              </span>
            </div>
          ))}
          {balances.length > 3 && (
            <>
              <span className="text-[#64748B]">•</span>
              <span className="text-[#64748B] text-xs">
                +{balances.length - 3} more
              </span>
            </>
          )}
        </div>
      )}

      {/* Last updated timestamp */}
      {lastUpdated && (
        <p className="text-xs text-[#64748B]">
          Last updated: {getRelativeTime(lastUpdated)}
        </p>
      )}
    </div>
  );
};

export default BalanceBreakdown;


