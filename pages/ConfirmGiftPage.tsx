'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { useAuth } from '../context/AuthContext';
import { loadPendingGift, clearPendingGift, PendingGift } from '../lib/giftStore';
import { bundleService, usernameService, tiplinkService, giftService, priceService } from '../services/api';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
import bs58 from 'bs58';
import Spinner from '../components/Spinner';

export const ConfirmGiftPage: React.FC = () => {
  const navigate = useNavigate();
  const { authenticated, login, user: privyUser, ready } = usePrivy();
  const { user } = useAuth();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets } = useWallets();
  
  const [giftData, setGiftData] = useState<PendingGift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState<string>('');

  useEffect(() => {
    // Load pending gift from localStorage
    const pending = loadPendingGift();
    
    if (!pending) {
      // No pending gift - redirect to send page
      navigate('/send');
      return;
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
    
    // Trigger login if not authenticated
    if (!authenticated && ready) {
      login();
    }
  }, [authenticated, ready, login, navigate]);

  const handleSendGift = async () => {
    if (!giftData || !authenticated || !user) return;
    
    setLoading(true);
    setError('');
    
    try {
      const walletAddress = user.wallet_address;
      if (!walletAddress) {
        throw new Error('No wallet address found');
      }

      const recipientEmail = resolvedEmail || giftData.recipient;
      if (!recipientEmail) {
        throw new Error('Recipient email could not be determined');
      }

      // Check if it's a bundle or custom gift
      if (giftData.bundle) {
        // Bundle gift flow - use onramp for simplicity
        const response = await bundleService.initiateBundleGift({
          bundleId: giftData.bundle.id,
          recipientEmail,
          customMessage: giftData.message,
          includeCard: false, // No card for progressive flow initially
        });

        // Clear localStorage before redirecting
        clearPendingGift();
        
        // Redirect to bundle gift page to complete the flow
        navigate(`/bundle-gift?giftId=${response.giftId}`);
      } else if (giftData.token === 'SOL') {
        // Custom SOL gift flow
        console.log('🎁 Creating custom SOL gift...');
        
        try {
          // Step 1: Create TipLink
          console.log('📝 Step 1: Creating TipLink...');
          const { tiplink_ref_id, tiplink_public_key } = await tiplinkService.create();
          const tipLinkPubkey = new PublicKey(tiplink_public_key);
          console.log('✅ TipLink created:', tiplink_public_key);
          
          // Step 2: Build transaction to transfer SOL to TipLink
          console.log('📝 Step 2: Finding Solana wallet...');
          const embeddedWallet = wallets.find(w => {
            // Check chainType first (most reliable)
            if (w.chainType === 'solana') return true;
            // Check address format (Solana addresses are base58, not 0x)
            const addr = w.address || (w as any).walletAddress;
            return addr && !addr.startsWith('0x') && addr.length >= 32 && addr.length <= 44;
          });
          
          if (!embeddedWallet) {
            throw new Error('No Solana wallet found. Please connect your wallet.');
          }
          
          const walletAddress = embeddedWallet.address || (embeddedWallet as any).walletAddress;
          if (!walletAddress) {
            throw new Error('Wallet address not found.');
          }
          
          const senderPubkey = new PublicKey(walletAddress);
          const solAmount = giftData.amount; // Amount in USD, need to convert to SOL
          
          // Get SOL price to convert USD to SOL
          console.log('📝 Step 3: Fetching SOL price...');
          const SOL_MINT = 'So11111111111111111111111111111111111111112';
          const priceResponse = await priceService.getTokenPrice(SOL_MINT);
          const solPrice = priceResponse.price;
          
          if (!solPrice || solPrice <= 0) {
            throw new Error('Unable to fetch SOL price. Please try again.');
          }
          
          const solAmountInSol = solAmount / solPrice;
          const solAmountLamports = Math.round(solAmountInSol * LAMPORTS_PER_SOL);
          
          console.log(`💰 Transferring ${solAmountInSol.toFixed(6)} SOL (${solAmountLamports} lamports) to TipLink`);
          
          // Build transaction
          console.log('📝 Step 4: Building transaction...');
          const transaction = new Transaction();
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: senderPubkey,
              toPubkey: tipLinkPubkey,
              lamports: solAmountLamports,
            })
          );
          
          // Get fresh blockhash
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = senderPubkey;
          if (lastValidBlockHeight) {
            transaction.lastValidBlockHeight = lastValidBlockHeight;
          }
          
          // Step 5: Sign and send transaction
          console.log('📝 Step 5: Signing and sending transaction...');
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
            // Check if it's already a base58 string (Solana signature format)
            if (signature.length >= 80 && signature.length <= 90 && !signature.includes('/') && !signature.includes('+') && !signature.includes('=')) {
              signatureString = signature;
            } else if (signature.includes('/') || signature.includes('+') || signature.includes('=')) {
              // Base64 encoded, decode it
              signatureString = bs58.encode(Buffer.from(signature, 'base64'));
            } else {
              signatureString = signature;
            }
          } else if (signature instanceof Uint8Array) {
            signatureString = bs58.encode(signature);
          } else {
            throw new Error('Invalid signature format received');
          }
          
          console.log('✅ Transaction sent:', signatureString);
          
          // Wait for confirmation
          console.log('⏳ Waiting for transaction confirmation...');
          await connection.confirmTransaction(signatureString, 'confirmed');
          console.log('✅ Transaction confirmed');
          
          // Step 6: Create gift record
          console.log('📝 Step 6: Creating gift record...');
          const createResponse = await giftService.createGift({
            recipient_email: recipientEmail,
            token_mint: SOL_MINT,
            amount: solAmountInSol,
            message: giftData.message,
            sender_did: user.privy_did,
            tiplink_ref_id,
            tiplink_public_key,
            funding_signature: signatureString,
            token_symbol: 'SOL',
            token_decimals: 9,
          });
          
          console.log('✅ Gift created:', createResponse.gift_id);
          
          // Clear localStorage
          clearPendingGift();
          
          // Redirect to success/history page
          navigate(`/history?giftId=${createResponse.gift_id}`);
        } catch (stepError: any) {
          console.error('❌ Error in custom SOL gift flow:', stepError);
          throw stepError; // Re-throw to be caught by outer catch
        }
      } else {
        // Other tokens not yet supported
        throw new Error('Only SOL custom gifts are currently supported. Please use a bundle or select SOL.');
      }
      
    } catch (err: any) {
      console.error('Transaction failed:', err);
      setError(err.message || 'Failed to send gift. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Loading state while auth happens
  if (!ready || (!authenticated && ready)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="8" color="border-sky-400" />
          <h2 className="text-2xl font-bold mb-2 mt-4 text-white">Sign in to continue</h2>
          <p className="text-slate-400">
            Almost there! Sign in to send your gift.
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

  return (
    <div className="min-h-screen bg-slate-900 py-12">
      <div className="container mx-auto px-4 max-w-lg">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg p-8 space-y-6">
          {/* Welcome back */}
          <div className="text-center">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-2xl font-bold mb-2 text-white">
              Welcome{privyUser?.email?.address ? `, ${privyUser.email.address}` : ''}!
            </h2>
            <p className="text-slate-400">Ready to send your gift?</p>
          </div>
          
          {/* Auto-filled gift summary */}
          <div className="bg-gradient-to-br from-sky-500/10 to-cyan-500/10 border-2 border-sky-500 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-slate-400">To:</span>
              <span className="font-semibold text-white">{giftData.recipient}</span>
            </div>
            
            <div className="h-px bg-sky-500/30"></div>
            
            <div className="flex justify-between">
              <span className="text-slate-400">Amount:</span>
              <span className="font-bold text-xl text-sky-400">
                ${giftData.amount.toLocaleString()} USD
                {giftData.bundle ? '' : ` (${giftData.token})`}
              </span>
            </div>
            
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
            disabled={loading || !resolvedEmail}
            className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white py-4 rounded-lg font-semibold text-lg hover:from-sky-600 hover:to-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="4" color="border-white" />
                Sending...
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

