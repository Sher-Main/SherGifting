import React, { useState, useEffect } from 'react';
import { Bundle, BundleCalculation } from '../types';
import { getApiUrl } from '../services/apiConfig';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';

interface BundlePreviewModalProps {
  bundle: Bundle;
  bundleCalculation: BundleCalculation;
  recipientEmail: string;
  recipientLabel: string;
  message?: string;
  includeCard: boolean;
  onConfirm: (paymentMethod: 'wallet' | 'moonpay') => void;
  onCancel: () => void;
}

interface FeeBreakdown {
  baseValue: number;
  networkFee: number;
  paymentProcessingFee: number;
  totalCost: number;
  overheadPercent: number;
  details: {
    ataCount: number;
    ataCostSOL: number;
    ataCostUSD: number;
    swapFeeUSD: number;
    priorityFeeUSD: number;
    tiplinkCreationFeeUSD: number;
  };
}

interface WalletBalance {
  available: boolean;
  reason?: string;
  balance: {
    solBalance: number;
    hasSufficientSOL: boolean;
    hasSufficientTokens: boolean;
    tokenBalances: Array<{
      symbol: string;
      mint: string;
      balance: number;
      required: number;
      sufficient: boolean;
    }>;
  };
}

export const BundlePreviewModal: React.FC<BundlePreviewModalProps> = ({
  bundle,
  bundleCalculation,
  recipientEmail,
  recipientLabel,
  message,
  includeCard,
  onConfirm,
  onCancel,
}) => {
  const { user: privyUser, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFeeBreakdown();
    checkWalletBalance();
  }, [bundle.id, includeCard]);

  const fetchFeeBreakdown = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        getApiUrl(`bundles/${bundle.id}/fees?includeCard=${includeCard}&paymentMethod=wallet`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setFeeBreakdown(data);
      }
    } catch (err: any) {
      console.error('Error fetching fee breakdown:', err);
    }
  };

  const checkWalletBalance = async () => {
    try {
      const walletAddress = wallets?.[0]?.address || privyUser?.wallet?.address;
      if (!walletAddress) {
        setWalletBalance({
          available: false,
          reason: 'No wallet connected',
          balance: {
            solBalance: 0,
            hasSufficientSOL: false,
            hasSufficientTokens: false,
            tokenBalances: [],
          },
        });
        setLoading(false);
        return;
      }

      const token = await getAccessToken();
      const response = await fetch(getApiUrl('wallet/check-balance'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          walletAddress,
          bundleId: bundle.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setWalletBalance(data);
      } else {
        setWalletBalance({
          available: false,
          reason: 'Failed to check balance',
          balance: {
            solBalance: 0,
            hasSufficientSOL: false,
            hasSufficientTokens: false,
            tokenBalances: [],
          },
        });
      }
    } catch (err: any) {
      console.error('Error checking wallet balance:', err);
      setWalletBalance({
        available: false,
        reason: 'Error checking balance',
        balance: {
          solBalance: 0,
          hasSufficientSOL: false,
          hasSufficientTokens: false,
          tokenBalances: [],
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentMethod = (method: 'wallet' | 'moonpay') => {
    if (method === 'wallet' && !walletBalance?.available) {
      setError(walletBalance?.reason || 'Wallet payment not available');
      return;
    }
    onConfirm(method);
  };

  // Map token symbols to display names
  const getTokenDisplayName = (symbol: string): string => {
    const displayNames: Record<string, string> = {
      SOL: 'Solana',
      wBTC: 'Bitcoin',
      wETH: 'Ethereum',
      USDC: 'USD Coin',
    };
    return displayNames[symbol] || symbol;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-6">Gift Summary</h2>

          {/* Bundle Summary */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-3">{bundle.name}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
              {bundleCalculation.tokens.map((token, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="font-medium text-slate-300">
                    {getTokenDisplayName(token.symbol)}
                  </span>
                  <span className="text-slate-400">
                    {token.percentage}% (${token.usdValue.toFixed(2)})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Fee Breakdown */}
          {feeBreakdown && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Cost Breakdown</h3>
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Bundle Value</span>
                  <span className="text-slate-300">${feeBreakdown.baseValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Network Fees</span>
                  <span className="text-slate-300">${feeBreakdown.networkFee.toFixed(2)}</span>
                </div>
                {feeBreakdown.paymentProcessingFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Payment Processing</span>
                    <span className="text-slate-300">
                      ${feeBreakdown.paymentProcessingFee.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                  <span className="font-semibold text-white">Total Amount</span>
                  <span className="font-bold text-sky-400 text-lg">
                    ${feeBreakdown.totalCost.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {feeBreakdown.overheadPercent.toFixed(1)}% network overhead
                </div>
              </div>
            </div>
          )}

          {/* Recipient */}
          <div className="mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Sending to:</span>
              <span className="text-slate-300 font-medium">{recipientLabel}</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-rose-900/50 border border-rose-700 rounded-lg text-rose-300 text-sm">
              {error}
            </div>
          )}

          {/* Payment Options */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handlePaymentMethod('wallet')}
              disabled={loading || !walletBalance?.available}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
                loading || !walletBalance?.available
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
            >
              <div className="flex flex-col items-center">
                <span>Pay from Wallet</span>
                {!loading && walletBalance && (
                  <span className="text-xs mt-1">
                    {walletBalance.available
                      ? walletBalance.balance.hasSufficientTokens
                        ? 'Tokens available'
                        : 'Will swap via Jupiter'
                      : walletBalance.reason}
                  </span>
                )}
              </div>
            </button>

            <button
              onClick={() => handlePaymentMethod('moonpay')}
              className="w-full py-3 px-4 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white transition-all duration-200"
            >
              <div className="flex flex-col items-center">
                <span>Pay via Card/Bank</span>
                {feeBreakdown && (
                  <span className="text-xs mt-1">
                    Onramp ${feeBreakdown.totalCost.toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

