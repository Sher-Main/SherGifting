import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet, useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { bundleService } from '../services/api';
import { getApiUrl } from '../services/apiConfig';
import { Bundle } from '../types';
import { BundleSelector } from '../components/BundleSelector';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import { VersionedTransaction, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import { connection } from '../services/solana';
import { priceService } from '../services/api';
import bs58 from 'bs58';

type StatusStep = 'select' | 'waiting_payment' | 'payment_confirmed' | 'swapping' | 'packaging' | 'sent' | 'failed';

export const BundleGiftPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { user: privyUser, getAccessToken } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets, ready: walletsReady } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [includeCard, setIncludeCard] = useState(false);
  const [recipientName, setRecipientName] = useState('');

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<StatusStep>('select');
  const [error, setError] = useState<string | null>(null);

  const [giftId, setGiftId] = useState<string | null>(null);
  const [onrampAmount, setOnrampAmount] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<any>(null);

  // Get wallet address
  const walletAddress = wallets?.[0]?.address || privyUser?.wallet?.address || user?.wallet_address;

  const handleSendGift = async () => {
    if (!selectedBundle || !recipientEmail || !user || !walletAddress) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Step 1: Initiate gift and get onramp amount
      const response = await bundleService.initiateBundleGift({
        bundleId: selectedBundle.id,
        recipientEmail,
        customMessage,
        includeCard,
      });

      setGiftId(response.giftId);
      setOnrampAmount(response.onrampAmount);
      setBreakdown(response.breakdown);

      // Step 2: Open Privy onramp popup
      setCurrentStep('waiting_payment');
      await fundWallet({
        address: walletAddress,
      });

      // Step 3: Start polling for SOL arrival
      startBalancePolling(response.giftId, walletAddress, response.onrampAmount);
    } catch (error: any) {
      console.error('Gift initiation error:', error);
      setError('Failed to initiate gift: ' + (error.message || 'Unknown error'));
      setLoading(false);
      setCurrentStep('select');
    }
  };

  const startBalancePolling = async (giftId: string, walletAddress: string, expectedAmountUsd: number) => {
    // Poll every 30 seconds (twice per minute)
    // Total 20 polls = 10 minutes
    const pollInterval = 30000; // 30 seconds
    const maxAttempts = 20;

    let attempts = 0;

    const pollForBalance = async () => {
      attempts++;
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts}...`);

      try {
        // Check balance via backend endpoint
        const response = await fetch(getApiUrl(`wallet/balances/${walletAddress}`));
        if (response.ok) {
          const balances = await response.json();
          const solBalance = balances.find((b: any) => b.symbol === 'SOL');
          const currentBalance = solBalance?.balance || 0;

          // Get SOL price to calculate expected SOL amount
          const solPriceResponse = await fetch(
            'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112'
          );
          const solPriceData = await solPriceResponse.json();
          const solPrice = solPriceData.data?.['So11111111111111111111111111111111111111112']?.price || 0;

          if (solPrice > 0) {
            const expectedSol = expectedAmountUsd / solPrice;

            console.log(
              `📊 Current balance: ${currentBalance.toFixed(6)} SOL (expecting ${expectedSol.toFixed(6)} SOL)`
            );

            // Check if balance increased significantly (95% threshold)
            if (currentBalance >= expectedSol * 0.95) {
              console.log('✅ SOL detected! Triggering swaps...');
              setCurrentStep('payment_confirmed');

              // Trigger swap preparation
              await bundleService.executeSwaps(giftId);
              setCurrentStep('swapping');

              // Sign and send swap transactions
              await signAndSendSwaps(giftId);

              // Start polling for completion
              pollForStatus(giftId);
              return; // Stop balance polling
            }
          }
        }

        // Check gift status as well
        const statusResponse = await bundleService.pollBundleStatus(giftId);
        if (statusResponse.onrampStatus === 'completed') {
          setCurrentStep('payment_confirmed');
          await bundleService.executeSwaps(giftId);
          setCurrentStep('swapping');
          
          // Sign and send swap transactions
          await signAndSendSwaps(giftId);
          
          pollForStatus(giftId);
          return;
        }

        if (statusResponse.status === 'SENT') {
          setCurrentStep('sent');
          setLoading(false);
          return;
        }

        // Continue polling if not done
        if (attempts < maxAttempts) {
          setTimeout(pollForBalance, pollInterval);
        } else {
          setError('Payment timeout. Please contact support if payment was completed.');
          setCurrentStep('failed');
          setLoading(false);
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (attempts < maxAttempts) {
          setTimeout(pollForBalance, pollInterval);
        } else {
          setError('Failed to detect payment. Please contact support.');
          setCurrentStep('failed');
          setLoading(false);
        }
      }
    };

    // Start polling after a short delay
    setTimeout(pollForBalance, 5000);
  };

  const signAndSendSwaps = async (giftId: string) => {
    try {
      // Get pending swap transactions
      const swapsResponse = await bundleService.getPendingSwaps(giftId);
      
      if (!swapsResponse.success || swapsResponse.swaps.length === 0) {
        console.log('No pending swaps to sign');
        return;
      }

      // Find embedded Privy wallet
      const embeddedWallet = wallets.find(
        (w) => w.standardWallet?.name === 'Privy'
      );

      if (!embeddedWallet) {
        throw new Error('No Privy embedded wallet found');
      }

      // Sign and send each swap transaction
      for (const swap of swapsResponse.swaps) {
        try {
          // Deserialize transaction
          const swapTransactionBuf = Buffer.from(swap.transaction, 'base64');
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

          // Sign and send
          const result = await signAndSendTransaction({
            transaction: swapTransactionBuf,
            wallet: embeddedWallet,
            chain: 'solana:mainnet',
          });

          // Get signature string
          const signature = result.signature as string | Uint8Array;
          const signatureString = typeof signature === 'string' 
            ? signature 
            : bs58.encode(signature);

          // Confirm swap with backend
          await bundleService.confirmSwap(giftId, swap.id, signatureString);
          
          console.log(`✅ Swap signed and sent: ${signatureString}`);
        } catch (error: any) {
          console.error(`❌ Failed to sign swap ${swap.id}:`, error);
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Error signing swaps:', error);
      throw error;
    }
  };

  const fundTipLink = async (giftId: string) => {
    try {
      // Get TipLink details and transfer instructions
      const tiplinkResponse = await bundleService.getTipLinkDetails(giftId);
      
      if (!tiplinkResponse.success) {
        throw new Error('Failed to get TipLink details');
      }

      const { tiplinkUrl, tiplinkPublicKey, transfers } = tiplinkResponse;
      const tiplinkPubkey = new PublicKey(tiplinkPublicKey);

      // Find embedded Privy wallet
      const embeddedWallet = wallets.find(
        (w) => w.standardWallet?.name === 'Privy'
      );

      if (!embeddedWallet) {
        throw new Error('No Privy embedded wallet found');
      }

      const userPubkey = new PublicKey(embeddedWallet.address);
      const fundingSignatures: string[] = [];

      // Get SOL price for USD to SOL conversion
      const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');

      // Fund TipLink with each token
      for (const transfer of transfers) {
        try {
          if (transfer.mint === 'So11111111111111111111111111111111111111112') {
            // SOL transfer
            const solAmount = solPrice > 0 ? transfer.amount / solPrice : transfer.amount;
            
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: userPubkey,
                toPubkey: tiplinkPubkey,
                lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
              })
            );

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPubkey;
            if (lastValidBlockHeight) {
              transaction.lastValidBlockHeight = lastValidBlockHeight;
            }

            const serializedTransaction = transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });

            const result = await signAndSendTransaction({
              transaction: serializedTransaction,
              wallet: embeddedWallet,
              chain: 'solana:mainnet',
            });

            const signature = result.signature as string | Uint8Array;
            const signatureString = typeof signature === 'string' 
              ? signature 
              : bs58.encode(signature);

            fundingSignatures.push(signatureString);
            console.log(`✅ Funded ${solAmount.toFixed(6)} SOL: ${signatureString}`);
          } else {
            // SPL token transfer
            const mintPubkey = new PublicKey(transfer.mint);
            const mintInfo = await connection.getAccountInfo(mintPubkey);
            const tokenProgramId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
              ? TOKEN_2022_PROGRAM_ID
              : TOKEN_PROGRAM_ID;

            const senderATA = await getAssociatedTokenAddress(mintPubkey, userPubkey, false, tokenProgramId);
            const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tiplinkPubkey, true, tokenProgramId);

            // Get token decimals
            const mint = await getMint(connection, mintPubkey, undefined, tokenProgramId);
            const decimals = mint.decimals;
            const amountRaw = BigInt(Math.floor(transfer.amount * Math.pow(10, decimals)));

            const transaction = new Transaction();

            // Check if TipLink ATA exists
            const tiplinkAccountInfo = await connection.getAccountInfo(tiplinkATA);
            if (!tiplinkAccountInfo) {
              // Create ATA (sender pays)
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  userPubkey,
                  tiplinkATA,
                  tiplinkPubkey,
                  mintPubkey,
                  tokenProgramId
                )
              );
            }

            transaction.add(
              createTransferCheckedInstruction(
                senderATA,
                mintPubkey,
                tiplinkATA,
                userPubkey,
                amountRaw,
                decimals,
                [],
                tokenProgramId
              )
            );

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPubkey;
            if (lastValidBlockHeight) {
              transaction.lastValidBlockHeight = lastValidBlockHeight;
            }

            const serializedTransaction = transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });

            const result = await signAndSendTransaction({
              transaction: serializedTransaction,
              wallet: embeddedWallet,
              chain: 'solana:mainnet',
            });

            const signature = result.signature as string | Uint8Array;
            const signatureString = typeof signature === 'string' 
              ? signature 
              : bs58.encode(signature);

            fundingSignatures.push(signatureString);
            console.log(`✅ Funded ${transfer.amount.toFixed(6)} ${transfer.symbol}: ${signatureString}`);
          }
        } catch (error: any) {
          console.error(`❌ Failed to fund ${transfer.symbol}:`, error);
          throw error;
        }
      }

      // Mark gift as sent and trigger email
      await bundleService.completeBundleGift(giftId);
      console.log('✅ TipLink funded with all tokens, gift completed');
    } catch (error: any) {
      console.error('Error funding TipLink:', error);
      throw error;
    }
  };

  const pollForStatus = async (giftId: string) => {
    const pollInterval = 5000; // 5 seconds for status polling
    const maxAttempts = 60; // 5 minutes max

    let attempts = 0;

    const poll = async () => {
      attempts++;

      try {
        const status = await bundleService.pollBundleStatus(giftId);

        if (status.status === 'SENT') {
          setCurrentStep('sent');
          setLoading(false);
          return;
        }

        if (status.swapStatus === 'pending_signature') {
          // Swaps are ready to sign
          setCurrentStep('swapping');
          try {
            await signAndSendSwaps(giftId);
          } catch (error: any) {
            setError('Failed to sign swap transactions: ' + error.message);
            setCurrentStep('failed');
            setLoading(false);
            return;
          }
        } else if (status.swapStatus === 'processing' || status.swapStatus === 'completed') {
          setCurrentStep('swapping');
        } else if (status.swapStatus === 'completed' && status.status !== 'SENT') {
          // All swaps complete, now fund TipLink
          setCurrentStep('packaging');
          try {
            await fundTipLink(giftId);
          } catch (error: any) {
            setError('Failed to fund TipLink: ' + error.message);
            setCurrentStep('failed');
            setLoading(false);
            return;
          }
        }

        if (status.swapStatus === 'failed') {
          setError('Swap failed. Please contact support.');
          setCurrentStep('failed');
          setLoading(false);
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setError('Processing timeout. Please contact support.');
          setCurrentStep('failed');
          setLoading(false);
        }
      } catch (error) {
        console.error('Status polling error:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setError('Failed to check status. Please contact support.');
          setCurrentStep('failed');
          setLoading(false);
        }
      }
    };

    poll();
  };

  if (currentStep === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </button>

          <h1 className="text-4xl font-bold mb-2">Send a Crypto Gift Bundle</h1>
          <p className="text-slate-400 mb-8">Choose a curated pack. We handle the rest.</p>

          <BundleSelector
            onBundleSelect={setSelectedBundle}
            selectedBundleId={selectedBundle?.id || null}
          />

          {selectedBundle && (
            <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4">Send {selectedBundle.name}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="friend@example.com"
                    required
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Personal Message (Optional)
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Happy birthday! Enjoy your first crypto..."
                    rows={3}
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="include-card"
                    checked={includeCard}
                    onChange={(e) => setIncludeCard(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-sky-500"
                  />
                  <label htmlFor="include-card" className="text-slate-300">
                    Add greeting card (+$1.00)
                  </label>
                </div>

                {includeCard && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Recipient Name (for card)
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Friend"
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleSendGift}
                  disabled={!recipientEmail || loading || !walletAddress}
                  className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-bold py-4 px-6 rounded-lg hover:from-sky-600 hover:to-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : 'Continue to Payment'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Status screens
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center">
      <div className="text-center">
        <Spinner size="12" color="border-sky-400" />
        <h2 className="text-2xl font-bold mt-6 mb-2">{getStatusTitle(currentStep)}</h2>
        <p className="text-slate-400">{getStatusMessage(currentStep)}</p>
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 max-w-md mx-auto">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {currentStep === 'sent' && (
          <button
            onClick={() => navigate('/history')}
            className="mt-6 bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-bold py-3 px-6 rounded-lg hover:from-sky-600 hover:to-cyan-500 transition-all"
          >
            View Gift History
          </button>
        )}
      </div>
    </div>
  );
};

function getStatusTitle(step: StatusStep): string {
  switch (step) {
    case 'waiting_payment':
      return 'Complete payment in popup';
    case 'payment_confirmed':
      return 'Payment received!';
    case 'swapping':
      return 'Converting SOL to bundle tokens';
    case 'packaging':
      return 'Creating your gift';
    case 'sent':
      return 'Gift sent successfully!';
    case 'failed':
      return 'Something went wrong';
    default:
      return 'Processing...';
  }
}

function getStatusMessage(step: StatusStep): string {
  switch (step) {
    case 'waiting_payment':
      return 'Do not close the payment window';
    case 'payment_confirmed':
      return 'Processing your gift...';
    case 'swapping':
      return 'Swapping via Jupiter... (2/3 done)';
    case 'packaging':
      return 'Packaging tokens and sending email...';
    case 'sent':
      return 'Your gift has been sent to the recipient!';
    case 'failed':
      return 'Please try again or contact support';
    default:
      return 'Please wait...';
  }
}

