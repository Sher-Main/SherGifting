import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { getApiUrl } from '../services/apiConfig';
import Spinner from '../components/Spinner';

interface TipLink {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenAmount: number;
  claimed: boolean;
}

interface GiftDetails {
  giftId: string;
  bundleName: string;
  totalUsdValue: number;
  tiplinks: TipLink[];
  claimed: boolean;
}

export default function ClaimPage() {
  const { giftId } = useParams<{ giftId: string }>();
  const navigate = useNavigate();
  const { user, login, authenticated, ready, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [gift, setGift] = useState<GiftDetails | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (giftId) {
      fetchGiftDetails();
    }
  }, [giftId]);

  const fetchGiftDetails = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(getApiUrl(`gifts/${giftId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Transform data to match our interface
        setGift({
          giftId: data.id,
          bundleName: data.bundle_name || 'Bundle Gift',
          totalUsdValue: data.usd_value || 0,
          tiplinks: data.tiplinks || [],
          claimed: data.status === 'CLAIMED',
        });
      } else {
        setError('Gift not found');
      }
    } catch (err: any) {
      console.error('Error fetching gift:', err);
      setError('Failed to load gift details');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAll = async () => {
    if (!user || !authenticated) {
      await login();
      return;
    }

    const walletAddress = wallets?.[0]?.address || user?.wallet?.address;
    if (!walletAddress) {
      setError('No wallet connected');
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch(getApiUrl(`gifts/${giftId}/claim-all`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientWallet: walletAddress,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Success - redirect to success page or show success message
        navigate(`/claim/success?giftId=${giftId}&claimed=${data.claimedCount}`);
      } else {
        setError(data.error || 'Failed to claim gift');
      }
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err.message || 'Error claiming gift');
    } finally {
      setClaiming(false);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Spinner size="12" color="border-sky-400" />
      </div>
    );
  }

  if (error && !gift) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
          <p className="text-slate-300 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!gift) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto pt-20">
        <div className="bg-slate-800 rounded-lg p-6 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-2">You received a gift! 🎁</h1>
          <p className="text-slate-400 mb-6">Someone sent you a crypto gift bundle</p>

          <div className="bg-slate-900/50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">{gift.bundleName}</h2>
            <p className="text-slate-400 mb-2">Total Value</p>
            <p className="text-3xl font-bold text-sky-400 mb-4">
              ${gift.totalUsdValue.toFixed(2)}
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Tokens Included:</h3>
              {gift.tiplinks.map((tiplink) => (
                <div
                  key={tiplink.id}
                  className="flex justify-between items-center bg-slate-800 rounded-lg p-3"
                >
                  <span className="text-slate-300 font-medium">
                    {getTokenDisplayName(tiplink.tokenSymbol)}
                  </span>
                  <span className="text-slate-400">
                    {tiplink.tokenAmount.toFixed(6)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-900/50 border border-rose-700 rounded-lg text-rose-300 text-sm">
              {error}
            </div>
          )}

          {gift.claimed ? (
            <div className="p-4 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-center">
              ✅ This gift has already been claimed
            </div>
          ) : (
            <button
              onClick={handleClaimAll}
              disabled={claiming || !ready || !authenticated}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
                claiming || !ready || !authenticated
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg'
              }`}
            >
              {claiming ? (
                <div className="flex items-center justify-center gap-3">
                  <Spinner size="6" color="border-white" />
                  <span>Claiming All Tokens...</span>
                </div>
              ) : !ready || !authenticated ? (
                'Please connect your wallet'
              ) : (
                'Claim All Tokens'
              )}
            </button>
          )}

          <p className="text-xs text-slate-500 text-center mt-4">
            Click once to claim all {gift.tiplinks.length} tokens together
          </p>
        </div>
      </div>
    </div>
  );
}
