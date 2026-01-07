'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets, useFundWallet } from '@privy-io/react-auth/solana';
import { useAuth } from '../context/AuthContext';
import { loadPendingGift, clearPendingGift, PendingGift } from '../lib/giftStore';
import { bundleService, usernameService, giftService, priceService } from '../services/api';
import { getApiUrl } from '../services/apiConfig';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
import bs58 from 'bs58';
import Spinner from '../components/Spinner';

type CustomGiftStep = 'confirm' | 'waiting_payment' | 'payment_confirmed' | 'funding' | 'sent' | 'failed';

export const ConfirmGiftPage: React.FC = () => {
  const navigate = useNavigate();
  const { authenticated, login, user: privyUser, ready, getAccessToken } = usePrivy();
  const { user } = useAuth();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets, ready: walletsReady } = useWallets();
  const { fundWallet } = useFundWallet();
  
  const [giftData, setGiftData] = useState<PendingGift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState<string>('');
  const [customGiftStep, setCustomGiftStep] = useState<CustomGiftStep>('confirm');
  const [customGiftId, setCustomGiftId] = useState<string | null>(null);
  const [onrampAmount, setOnrampAmount] = useState<number>(0);
  const [feeBreakdown, setFeeBreakdown] = useState<any>(null);
  const [feesLoading, setFeesLoading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState(false);
  const loginTriggeredRef = useRef(false);

  useEffect(() => {
    // Load pending gift from localStorage
    const pending = loadPendingGift();
    
    if (!pending) {
      // No pending gift - redirect to send page
      navigate('/send');
      return;
    }
    
    // Ensure amount is preserved correctly
    if (pending && typeof pending.amount !== 'number') {
      // Try to parse amount if it's a string
      const parsedAmount = parseFloat(pending.amount as any);
      if (!isNaN(parsedAmount)) {
        pending.amount = parsedAmount;
      }
    }
    
    setGiftData(pending);
    
    // Resolve recipient email if needed
    if (pending.recipientType === 'username') {
      usernameService.resolveRecipient(pending.recipient)
        .then((result) => {
          setResolvedEmail(result.email);
        })
        .catch((err) => {
          console.error('Failed to resolve username:', err);
          setError('Failed to resolve username. Please try again.');
        });
    } else if (pending.recipientType === 'email') {
      setResolvedEmail(pending.recipient);
    } else {
      // For wallet addresses, we'll need to handle differently
      setResolvedEmail(pending.recipient);
    }
    
    // Calculate fees immediately (before user clicks confirm)
    if (pending) {
      setFeesLoading(true);
      
      if (pending.bundle && pending.bundle.id) {
        // Calculate bundle fees
        bundleService.calculateBundleFees(pending.bundle.id, false)
          .then((fees) => {
            if (fees.success) {
              setFeeBreakdown(fees);
              setOnrampAmount(fees.totalCost || fees.totalCostUSD);
            }
          })
          .catch((err) => {
            console.error('Failed to calculate bundle fees:', err);
            setError('Failed to load fee breakdown. Please try again.');
          })
          .finally(() => {
            setFeesLoading(false);
          });
      } else if (!pending.bundle && pending.token === 'SOL' && typeof pending.amount === 'number' && pending.amount > 0) {
        // Calculate custom SOL fees
        giftService.calculateCustomGiftFees(pending.amount)
          .then((result) => {
            if (result.success) {
              setFeeBreakdown(result.feeBreakdown);
              setOnrampAmount(result.onrampAmount);
            }
          })
          .catch((err) => {
            console.error('Failed to calculate fees:', err);
            setError('Failed to load fee breakdown. Please try again.');
          })
          .finally(() => {
            setFeesLoading(false);
          });
      } else {
        // No fees to calculate (not a bundle or custom SOL)
        setFeesLoading(false);
      }
    }
    
    // Trigger login if not authenticated
    // Only trigger once when component mounts and user is not authenticated
    if (!authenticated && ready && !loginTriggeredRef.current) {
      loginTriggeredRef.current = true;
      // Call login immediately - Privy will handle showing the modal
      try {
        login();
      } catch (loginError) {
        console.error('Error triggering login:', loginError);
        // Reset ref on error so user can retry
        loginTriggeredRef.current = false;
        // Don't set error here - let Privy handle it
      }
    }
    
    // Reset login trigger if user becomes authenticated
    if (authenticated) {
      loginTriggeredRef.current = false;
    }
  }, [authenticated, ready, login, navigate]);

  // Poll for balance and gift completion (works for both custom SOL and bundles)
  const startBalancePolling = async (giftId: string, walletAddress: string, expectedAmountUsd: number, isBundle: boolean = false) => {
    const pollInterval = 30000; // 30 seconds
    const maxAttempts = 20; // 10 minutes total

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
              console.log('✅ SOL detected! Completing gift...');
              setCustomGiftStep('payment_confirmed');
              
              // Complete the gift (create TipLink and transfer SOL)
              await completeCustomGift(giftId);
              return; // Stop balance polling
            }
          }
        }

        // Check gift status
        if (isBundle) {
          // For bundles, check bundle status
          try {
            const statusResponse = await bundleService.pollBundleStatus(giftId);
            if (statusResponse.onrampStatus === 'completed' || statusResponse.status === 'SENT') {
              setCustomGiftStep('sent');
              setLoading(false);
              clearPendingGift();
              setTimeout(() => {
                navigate(`/history?giftId=${giftId}`);
              }, 2000);
              return;
            }
          } catch (err) {
            console.warn('Error checking bundle status:', err);
          }
        } else {
          // For custom SOL gifts, check custom gift status
          const statusResponse = await giftService.pollCustomGiftStatus(giftId);
          if (statusResponse.onrampStatus === 'completed') {
            setCustomGiftStep('payment_confirmed');
            await completeCustomGift(giftId);
            return;
          }

          if (statusResponse.status === 'SENT') {
            setCustomGiftStep('sent');
            setLoading(false);
            clearPendingGift();
            setTimeout(() => {
              navigate(`/history?giftId=${giftId}`);
            }, 2000);
            return;
          }
        }

        // Continue polling if not done
        if (attempts < maxAttempts) {
          setTimeout(pollForBalance, pollInterval);
        } else {
          setError('Payment timeout. Please contact support if payment was completed.');
          setCustomGiftStep('failed');
          setLoading(false);
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (attempts < maxAttempts) {
          setTimeout(pollForBalance, pollInterval);
        } else {
          setError('Failed to detect payment. Please contact support.');
          setCustomGiftStep('failed');
          setLoading(false);
        }
      }
    };

    // Start polling after a short delay
    setTimeout(pollForBalance, 5000);
  };

  // Complete custom SOL gift after payment is detected
  const completeCustomGift = async (giftId: string) => {
    try {
      setCustomGiftStep('funding');
      setLoading(true);

      // Get completion details from backend
      const completeResponse = await giftService.completeCustomGift(giftId);
      
      // Deserialize and sign the transaction
      const transactionBuf = Buffer.from(completeResponse.transaction, 'base64');
      const transaction = Transaction.from(transactionBuf);

      // Find wallet
      const embeddedWallet = wallets.find(w => {
        if (w.chainType === 'solana') return true;
        const addr = w.address || (w as any).walletAddress;
        return addr && !addr.startsWith('0x') && addr.length >= 32 && addr.length <= 44;
      });

      if (!embeddedWallet) {
        throw new Error('No Solana wallet found');
      }

      // Sign and send transaction
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const result = await signAndSendTransaction({
        transaction: serializedTransaction,
        wallet: embeddedWallet,
        chain: 'solana:mainnet',
      });

      // Extract signature
      const signature = result.signature as string | Uint8Array;
      let signatureString: string;
      if (typeof signature === 'string') {
        if (signature.length >= 80 && signature.length <= 90 && !signature.includes('/') && !signature.includes('+') && !signature.includes('=')) {
          signatureString = signature;
        } else if (signature.includes('/') || signature.includes('+') || signature.includes('=')) {
          signatureString = bs58.encode(Buffer.from(signature, 'base64'));
        } else {
          signatureString = signature;
        }
      } else if (signature instanceof Uint8Array) {
        signatureString = bs58.encode(signature);
      } else {
        throw new Error('Invalid signature format');
      }

      console.log('✅ Funding transaction sent:', signatureString);

      // Wait for confirmation
      await connection.confirmTransaction(signatureString, 'confirmed');
      console.log('✅ Funding transaction confirmed');

      // Update gift with funding signature
      const { setAuthToken } = await import('../services/api');
      const token = await getAccessToken() || '';
      setAuthToken(token);

      const updateResponse = await fetch(getApiUrl(`gifts/${giftId}/update-funding`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          funding_signature: signatureString,
          tiplink_ref_id: completeResponse.tiplinkRefId,
          tiplink_public_key: completeResponse.tiplinkPublicKey,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update gift with funding signature');
      }

      setCustomGiftStep('sent');
      clearPendingGift();
      
      // Redirect to history after a short delay
      setTimeout(() => {
        navigate(`/history?giftId=${giftId}`);
      }, 2000);
    } catch (err: any) {
      console.error('Error completing custom gift:', err);
      setError(err.message || 'Failed to complete gift');
      setCustomGiftStep('failed');
      setLoading(false);
    }
  };

  const handleSendGift = async () => {
    if (!giftData) {
      setError('No gift data found');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Get wallet address - simple fallback chain
      const walletAddress = (wallets && wallets.length > 0 && wallets[0]?.address) 
        || privyUser?.wallet?.address 
        || user?.wallet_address;
      
      if (!walletAddress) {
        setError('Wallet not ready. Please wait a moment and try again.');
        setLoading(false);
        return;
      }

      const recipientEmail = resolvedEmail || giftData.recipient || '';
      if (!recipientEmail) {
        setError('Recipient email is required');
        setLoading(false);
        return;
      }

      // Check if it's a bundle or custom gift
      if (giftData.bundle) {
        // Bundle gift flow - open onramp directly (DUPLICATED FROM BundleGiftPage)
        setIsSending(true);
        setError(null);
        
        try {
          // Check if wallets are ready
          if (!walletsReady) {
            throw new Error('Wallets are not ready yet. Please wait a moment and try again.');
          }

          // Get wallet address (EXACT PATTERN FROM WORKING CODE)
          const solWalletAddress = wallets?.[0]?.address || privyUser?.wallet?.address || user?.wallet_address;
          if (!solWalletAddress) {
            throw new Error('No wallet address found. Please ensure your wallet is connected.');
          }

          // Step 1: Initiate gift and get onramp amount
          console.log('🎁 Initiating bundle gift with onramp...');
          const response = await bundleService.initiateBundleGift({
            bundleId: giftData.bundle.id,
            recipientEmail,
            customMessage: giftData.message,
            includeCard: false,
          });

          setCustomGiftId(response.giftId);
          setOnrampAmount(response.onrampAmount);
          setFeeBreakdown(response.breakdown || response);

          // Step 2: Open Privy onramp popup (EXACT PATTERN FROM BundleGiftPage)
          console.log('🚀 Opening Privy funding flow for bundle gift...');
          setCustomGiftStep('waiting_payment');
          
          // Store amount for reference
          localStorage.setItem('sher_onramp_amount_usd', response.onrampAmount.toString());
          
          // Use the correct Solana-specific fundWallet (EXACT FROM BundleGiftPage)
          await fundWallet({
            address: solWalletAddress,
          });

          console.log('✅ Funding modal opened - starting polling for transaction...');

          // Step 3: Start polling for SOL arrival (bundle)
          startBalancePolling(response.giftId, solWalletAddress, response.onrampAmount, true);
        } catch (bundleError: any) {
          console.error('Bundle gift initiation error:', bundleError);
          const errorMsg = bundleError?.response?.data?.error || bundleError?.message || 'Failed to initiate bundle gift. Please try again.';
          setError(errorMsg);
          setIsSending(false);
          setLoading(false);
          if (customGiftStep !== 'confirm') {
            setCustomGiftStep('confirm');
          }
          return;
        }
      } else if (giftData.token === 'SOL') {
        // Custom SOL gift flow - use onramp (DUPLICATED FROM WORKING CODE)
        setIsSending(true);
        setError(null);
        
        try {
          // Check if wallets are ready
          if (!walletsReady) {
            throw new Error('Wallets are not ready yet. Please wait a moment and try again.');
          }

          // Get wallet address (EXACT PATTERN FROM WORKING CODE)
          const solWalletAddress = wallets?.[0]?.address || privyUser?.wallet?.address || user?.wallet_address;
          if (!solWalletAddress) {
            throw new Error('No wallet address found. Please ensure your wallet is connected.');
          }

          // Step 1: Initiate gift and get onramp amount with fees
          console.log('🎁 Initiating custom SOL gift with onramp...');
          const initiateResponse = await giftService.initiateCustomGift({
            recipientEmail,
            amountUSD: giftData.amount, // Amount in USD
            message: giftData.message,
          });

          setCustomGiftId(initiateResponse.giftId);
          setOnrampAmount(initiateResponse.onrampAmount);
          setFeeBreakdown(initiateResponse.feeBreakdown);

          // Step 2: Open Privy onramp popup (EXACT PATTERN FROM AddFundsPage)
          console.log('🚀 Opening Privy funding flow for custom SOL gift...');
          setCustomGiftStep('waiting_payment');
          
          // Store amount for reference
          localStorage.setItem('sher_onramp_amount_usd', initiateResponse.onrampAmount.toString());
          
          // Use the correct Solana-specific fundWallet (EXACT FROM AddFundsPage)
          await fundWallet({
            address: solWalletAddress,
          });

          console.log('✅ Funding modal opened - starting polling for transaction...');

          // Step 3: Start polling for SOL arrival
          startBalancePolling(initiateResponse.giftId, solWalletAddress, initiateResponse.onrampAmount);
        } catch (solError: any) {
          console.error('Custom SOL gift initiation error:', solError);
          const errorMsg = solError?.response?.data?.error || solError?.message || 'Failed to initiate custom SOL gift. Please try again.';
          setError(errorMsg);
          setIsSending(false);
          setLoading(false);
          if (customGiftStep !== 'confirm') {
            setCustomGiftStep('confirm');
          }
          return;
        }
      } else {
        // Other tokens not yet supported
        setError('Only SOL custom gifts are currently supported. Please use a bundle or select SOL.');
        setLoading(false);
        return;
      }
      
    } catch (err: any) {
      console.error('Unexpected error in handleSendGift:', err);
      const errorMessage = err?.response?.data?.error || err?.message || 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      setLoading(false);
      // Reset step if error occurs
      if (customGiftStep !== 'confirm') {
        setCustomGiftStep('confirm');
      }
    }
  };

  // Loading state while Privy initializes
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="8" color="border-sky-400" />
          <h2 className="text-2xl font-bold mb-2 mt-4 text-white">Initializing...</h2>
        </div>
      </div>
    );
  }

  // If authenticated but user not loaded yet, show loading
  if (authenticated && ready && !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="8" color="border-sky-400" />
          <h2 className="text-2xl font-bold mb-2 mt-4 text-white">Setting up your account...</h2>
          <p className="text-slate-400">
            Almost there! We're preparing your account.
          </p>
        </div>
      </div>
    );
  }

  // No gift data - shouldn't happen
  if (!giftData) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Continue to render the page even when not authenticated
  // Privy modal will overlay on top - this ensures the page is fully rendered

  // Show different UI based on custom gift step
  if (customGiftStep === 'waiting_payment' || customGiftStep === 'payment_confirmed' || customGiftStep === 'funding') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Spinner size="8" color="border-sky-400" />
          <h2 className="text-2xl font-bold mb-2 mt-4 text-white">
            {customGiftStep === 'waiting_payment' && 'Waiting for Payment...'}
            {customGiftStep === 'payment_confirmed' && 'Payment Confirmed!'}
            {customGiftStep === 'funding' && 'Funding Gift...'}
          </h2>
          <p className="text-slate-400">
            {customGiftStep === 'waiting_payment' && 'Please complete the payment in the popup window.'}
            {customGiftStep === 'payment_confirmed' && 'Processing your gift...'}
            {customGiftStep === 'funding' && 'Transferring SOL to TipLink...'}
          </p>
          {customGiftStep === 'waiting_payment' && (
            <p className="text-sm text-slate-500 mt-2">
              Amount: ${onrampAmount.toFixed(2)} USD
            </p>
          )}
        </div>
      </div>
    );
  }

  if (customGiftStep === 'sent') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2 text-white">Gift Sent Successfully!</h2>
          <p className="text-slate-400">Redirecting to history...</p>
        </div>
      </div>
    );
  }

  // Don't render if giftData is not loaded yet
  if (!giftData) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="8" color="border-sky-400" />
          <h2 className="text-2xl font-bold mb-2 mt-4 text-white">Loading gift details...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 py-12">
      <div className="container mx-auto px-4 max-w-lg">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg p-8 space-y-6">
          {/* Welcome back */}
          <div className="text-center">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-2xl font-bold mb-2 text-white">
              Welcome{privyUser && privyUser.email && privyUser.email.address ? `, ${privyUser.email.address}` : ''}!
            </h2>
            <p className="text-slate-400">Ready to send your gift?</p>
          </div>
          
          {/* Auto-filled gift summary */}
          <div className="bg-gradient-to-br from-sky-500/10 to-cyan-500/10 border-2 border-sky-500 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-slate-400">To:</span>
              <span className="font-semibold text-white">{giftData?.recipient || 'Loading...'}</span>
            </div>
            
            <div className="h-px bg-sky-500/30"></div>
            
            <div className="flex justify-between">
              <span className="text-slate-400">Gift Amount:</span>
              <span className="font-bold text-xl text-sky-400">
                ${typeof giftData.amount === 'number' ? giftData.amount.toLocaleString() : giftData.amount} USD
                {giftData.bundle ? '' : ` (${giftData.token})`}
              </span>
            </div>
            
            {/* Show detailed fee breakdown for custom SOL gifts */}
            {!giftData.bundle && giftData.token === 'SOL' && feeBreakdown && !feesLoading && (
              <>
                <div className="h-px bg-sky-500/30"></div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300">Cost Breakdown</h3>
                  <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Gift Amount</span>
                      <span className="text-slate-300">${feeBreakdown.baseValueUSD?.toFixed(2) || giftData.amount}</span>
                    </div>
                    
                    {/* Network Fees Breakdown */}
                    {feeBreakdown.networkFeeUSD > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-700">
                        <div className="text-xs text-slate-500 mb-2 font-medium">Network Fees:</div>
                        {feeBreakdown.details?.baseTxsLamports && (
                          <div className="flex justify-between text-xs ml-2 mb-1">
                            <span className="text-slate-500">• Transaction Fees</span>
                            <span className="text-slate-400">
                              ${((feeBreakdown.details.baseTxsLamports / 1_000_000_000) * (feeBreakdown.details.solPriceUSD || 150)).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm mt-2 pt-2 border-t border-slate-700">
                          <span className="text-slate-400">Network Fees Total</span>
                          <span className="text-slate-300">${feeBreakdown.networkFeeUSD?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                    )}

                    {/* Payment Processing Fee */}
                    {feeBreakdown.moonpayFeeUSD > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Payment Processing (MoonPay)</span>
                        <span className="text-slate-300">${feeBreakdown.moonpayFeeUSD?.toFixed(2) || '0.00'}</span>
                      </div>
                    )}
                    
                    {/* Total */}
                    <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between items-center">
                      <span className="font-semibold text-white">Total Amount</span>
                      <div className="text-right">
                        <div className="font-bold text-sky-400 text-lg">
                          ${feeBreakdown.totalCostUSD?.toFixed(2) || onrampAmount.toFixed(2)}
                        </div>
                        {feeBreakdown.totalCostSOL && (
                          <div className="text-xs text-slate-400 mt-1">
                            {feeBreakdown.totalCostSOL.toFixed(6)} SOL
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {giftData.bundle && (
              <>
                <div className="h-px bg-sky-500/30"></div>
                <div>
                  <span className="text-slate-400 block mb-1">Bundle:</span>
                  <p className="text-white font-semibold">{giftData.bundle.name}</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {giftData.bundle.tokens.map(item => `${item.percentage}% ${item.tokenSymbol}`).join(' + ')}
                  </p>
                </div>
                
                {/* Show detailed fee breakdown for bundles */}
                {feeBreakdown && !feesLoading && (
                  <>
                    <div className="h-px bg-sky-500/30"></div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-300">Cost Breakdown</h3>
                      <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Bundle Value</span>
                          <span className="text-slate-300">${(feeBreakdown.baseValueUSD || feeBreakdown.baseValue).toFixed(2)}</span>
                        </div>
                        
                        {/* Network Fees Breakdown */}
                        {feeBreakdown.networkFeeUSD > 0 && (
                          <div className="mt-3 pt-2 border-t border-slate-700">
                            <div className="text-xs text-slate-500 mb-2 font-medium">Network Fees:</div>
                            {feeBreakdown.details?.ataCostUSD > 0 && (
                              <div className="flex justify-between text-xs ml-2 mb-1">
                                <span className="text-slate-500">• Token Accounts</span>
                                <span className="text-slate-400">${feeBreakdown.details.ataCostUSD.toFixed(2)}</span>
                              </div>
                            )}
                            {feeBreakdown.details?.swapFeesUSD > 0 && (
                              <div className="flex justify-between text-xs ml-2 mb-1">
                                <span className="text-slate-500">• Swap Priority Fees</span>
                                <span className="text-slate-400">${feeBreakdown.details.swapFeesUSD.toFixed(2)}</span>
                              </div>
                            )}
                            {feeBreakdown.details?.dexFeeUSD > 0 && (
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
                        )}

                        {/* Payment Processing Fee */}
                        {(feeBreakdown.paymentProcessingFee > 0 || feeBreakdown.moonpayFeeUSD > 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Payment Processing (MoonPay)</span>
                            <span className="text-slate-300">
                              ${(feeBreakdown.moonpayFeeUSD || feeBreakdown.paymentProcessingFee).toFixed(2)}
                            </span>
                          </div>
                        )}
                        
                        {/* Total */}
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
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            
            {giftData.message && (
              <>
                <div className="h-px bg-sky-500/30"></div>
                <div>
                  <span className="text-slate-400 block mb-1">Message:</span>
                  <p className="italic text-slate-300 text-sm">"{giftData.message}"</p>
                </div>
              </>
            )}
          </div>
          
          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
              {error}
            </div>
          )}
          
          {/* Send button */}
          <button
            onClick={handleSendGift}
            disabled={loading || !resolvedEmail || feesLoading || !authenticated}
            className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-4 rounded-lg font-semibold text-lg hover:from-sky-600 hover:to-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="4" color="border-white" />
                Sending...
              </span>
            ) : feesLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="4" color="border-white" />
                Loading fees...
              </span>
            ) : (
              'Confirm & Send 🚀'
            )}
          </button>
          
          {/* Security note */}
          <p className="text-xs text-slate-500 text-center">
            🔒 Secured by <a href="https://sher-app.vercel.app/home" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline">Sher</a> • Gas fees covered
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfirmGiftPage;

