import React from 'react';
import { Token, TokenBalance } from '../../types';

interface TokenPickerProps {
  tokens: Token[];
  selectedToken: Token | null;
  onSelect: (token: Token) => void;
  balances: TokenBalance[];
}

const TokenPicker: React.FC<TokenPickerProps> = React.memo(({
  tokens,
  selectedToken,
  onSelect,
  balances,
}) => {
  const getTokenBalance = (token: Token) => {
    const balance = balances.find(b => b.symbol === token.symbol);
    return balance?.balance || 0;
  };

  const getTokenLogo = (token: Token) => {
    const balance = balances.find(b => b.symbol === token.symbol);
    return balance?.logoURI;
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {tokens.map((token) => {
        const isSelected = selectedToken?.mint === token.mint;
        const balance = getTokenBalance(token);
        const logoURI = getTokenLogo(token);

        return (
          <button
            key={token.mint}
            type="button"
            onClick={() => onSelect(token)}
            className={`
              relative p-4 rounded-xl border-2 transition-all
              ${isSelected
                ? 'border-[#06B6D4] bg-[#06B6D4]/10 shadow-lg shadow-[#06B6D4]/20'
                : 'border-white/10 bg-[#0F172A]/50 hover:border-white/20 hover:bg-[#1E293B]/50'
              }
              active:scale-95
            `}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-[#06B6D4] rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1E293B] border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoURI ? (
                  <img src={logoURI} alt={token.symbol} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm">{token.symbol.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="font-bold text-white text-sm truncate">{token.symbol}</div>
                <div className="text-xs text-[#94A3B8] truncate">{token.name}</div>
                <div className="text-xs text-[#64748B] mt-1">
                  {balance.toFixed(4)} {token.symbol}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});

TokenPicker.displayName = 'TokenPicker';

export default TokenPicker;

