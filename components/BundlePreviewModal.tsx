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
  baseValueUSD: number;
  baseValueSOL: number;
  networkFee: number;
  networkFeeUSD: number;
  networkFeeSOL: number;
  paymentProcessingFee: number;
  moonpayFeeUSD: number;
  moonpayFeeSOL: number;
  totalCost: number;
  totalCostUSD: number;
  totalCostSOL: number;
  totalCostLamports: number;
  overheadPercent: number;
  details: {
    solPriceUSD: number;
    ataCount: number;
    ataCostSOL: number;
    ataCostUSD: number;
    swapFeeUSD: number;
    swapFeesUSD: number;
    swapFeesSOL: number;
    priorityFeeUSD: number;
    dexFeeUSD: number;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFeeBreakdown();
    checkWalletBalance();
  }, [bundle.id, includeCard]);

  // Auto-refresh fees every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshFeeBreakdown();
    }, 30_000); // 30 seconds

    return () => clearInterval(interval);
  }, [bundle.id, includeCard]);

  const fetchFeeBreakdown = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        getApiUrl(`bundles/${bundle.id}/fees?includeCard=${includeCard}&paymentMethod=moonpay`),
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

  const refreshFeeBreakdown = async () => {
    setRefreshing(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(
        getApiUrl(`bundles/${bundle.id}/fees?includeCard=${includeCard}&paymentMethod=moonpay`),
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
      console.error('Error refreshing fee breakdown:', err);
    } finally {
      setRefreshing(false);
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

          {/* Real-time Price Indicator */}
          {feeBreakdown && (
            <div className="mb-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-full text-xs text-slate-400">
                <span>SOL Price: ${feeBreakdown.details?.solPriceUSD?.toFixed(2) || 'Loading...'}</span>
                {refreshing && <span className="animate-spin">🔄</span>}
              </div>
            </div>
          )}

          {/* Fee Breakdown */}
          {feeBreakdown && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Cost Breakdown</h3>
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Bundle Value</span>
                  <span className="text-slate-300">${(feeBreakdown.baseValueUSD || feeBreakdown.baseValue).toFixed(2)}</span>
                </div>
                
                {/* Network Fees Breakdown */}
                <div className="mt-3 pt-2 border-t border-slate-700">
                  <div className="text-xs text-slate-500 mb-2 font-medium">Network Fees:</div>
                  {feeBreakdown.details?.ataCostUSD && (
                    <div className="flex justify-between text-xs ml-2 mb-1">
                      <span className="text-slate-500">• Token Accounts</span>
                      <span className="text-slate-400">${feeBreakdown.details.ataCostUSD.toFixed(2)}</span>
                    </div>
                  )}
                  {feeBreakdown.details?.swapFeesUSD && (
                    <div className="flex justify-between text-xs ml-2 mb-1">
                      <span className="text-slate-500">• Swap Priority Fees</span>
                      <span className="text-slate-400">${feeBreakdown.details.swapFeesUSD.toFixed(2)}</span>
                    </div>
                  )}
                  {feeBreakdown.details?.dexFeeUSD && (
                    <div className="flex justify-between text-xs ml-2 mb-1">
                      <span className="text-slate-500">• DEX Fees (0.3%)</span>
                      <span className="text-slate-400">${feeBreakdown.details.dexFeeUSD.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-slate-700">
                    <span className="text-slate-400">Network Fees Total</span>
                    <span className="text-slate-300">${(feeBreakdown.networkFeeUSD || feeBreakdown.networkFee).toFixed(2)}</span>
                  </div>
                </div>

                {(feeBreakdown.paymentProcessingFee > 0 || feeBreakdown.moonpayFeeUSD > 0) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Payment Processing (MoonPay)</span>
                    <span className="text-slate-300">
                      ${(feeBreakdown.moonpayFeeUSD || feeBreakdown.paymentProcessingFee).toFixed(2)}
                    </span>
                  </div>
                )}
                
                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between items-center">
                  <span className="font-semibold text-white">Total Amount</span>
                  <div className="text-right">
                    <div className="font-bold text-sky-400 text-lg">
                      ${(feeBreakdown.totalCostUSD || feeBreakdown.totalCost).toFixed(2)}
                    </div>
                    {feeBreakdown.totalCostSOL && (
                      <div className="text-xs text-slate-400 mt-1">
                        {feeBreakdown.totalCostSOL.toFixed(6)} SOL
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1 text-center">
                  {feeBreakdown.overheadPercent.toFixed(1)}% total fees
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
                    Onramp ${(feeBreakdown.totalCostUSD || feeBreakdown.totalCost).toFixed(2)}
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

          {/* Auto-refresh notice */}
          <p className="text-center text-xs text-slate-500 mt-4">
            Prices update every 30 seconds
          </p>
        </div>
      </div>
    </div>
  );
};

