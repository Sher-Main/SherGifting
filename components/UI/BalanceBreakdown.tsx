import React, { useState, useEffect } from 'react';
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
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second to refresh "Last updated" display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((currentTime - timestamp) / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Get SOL balance first, then other tokens
  const solBalance = balances.find(b => b.symbol === 'SOL');
  const otherTokens = balances
    .filter((b) => b.symbol !== 'SOL' && b.usdValue && b.usdValue > 0)
    .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
    .slice(0, 2); // Show SOL + 2 other tokens

  return (
    <div className="space-y-2">
      {/* Token breakdown */}
      {(solBalance || otherTokens.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {/* Show SOL balance with actual amount */}
          {solBalance && (
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{solBalance.symbol}</span>
              <span className="text-[#94A3B8]">
                {solBalance.balance.toFixed(4)}
              </span>
            </div>
          )}
          
          {/* Show other tokens with USD value */}
          {otherTokens.map((token, index) => (
            <div key={token.address} className="flex items-center gap-2">
              {(solBalance || index > 0) && <span className="text-[#64748B]">•</span>}
              <span className="text-white font-medium">{token.symbol}</span>
              <span className="text-[#94A3B8]">
                {formatCurrency(token.usdValue || 0)}
              </span>
            </div>
          ))}
          
          {balances.length > (solBalance ? 3 : 2) && (
            <>
              <span className="text-[#64748B]">•</span>
              <span className="text-[#64748B] text-xs">
                +{balances.length - (solBalance ? 3 : 2)} more
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


