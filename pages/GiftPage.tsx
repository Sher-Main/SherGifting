import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { tokenService, giftService, tiplinkService, heliusService } from '../services/api';
import { Token } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import QRCode from 'qrcode';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

const GiftPage: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const { ready, authenticated, user: privyUser } = usePrivy();
    const { signAndSendTransaction } = useSignAndSendTransaction();
    const { wallets, ready: walletsReady } = useWallets();
    const navigate = useNavigate();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [isLoadingTokens, setIsLoadingTokens] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [userBalance, setUserBalance] = useState<number>(0);
    const [walletReady, setWalletReady] = useState(false);
    
    const [recipientEmail, setRecipientEmail] = useState('');
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    
    // Success modal state
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [giftDetails, setGiftDetails] = useState<{
        claim_url: string;
        amount: string;
        token: string;
        recipient: string;
        signature: string;
        qrCode: string;
    } | null>(null);

    // Solana connection
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Monitor wallets array for changes
    useEffect(() => {
        if (walletsReady && wallets.length > 0) {
            const solanaWallet = wallets.find(w => {
                const isSolanaAddress = w.address && !w.address.startsWith('0x');
                return isSolanaAddress;
            });
            if (solanaWallet) {
                setWalletReady(true);
                console.log('✅ Wallet ready:', solanaWallet.address);
            }
        } else if (privyUser?.wallet && privyUser.wallet.chainType === 'solana') {
            // Wallet exists in privyUser even if useWallets is empty
            setWalletReady(true);
            console.log('✅ Wallet ready from privyUser:', privyUser.wallet.address);
        }
    }, [wallets, walletsReady, privyUser]);

    useEffect(() => {
        const fetchTokens = async () => {
            setIsLoadingTokens(true);
            try {
                const supportedTokens = await tokenService.getSupportedTokens();
                setTokens(supportedTokens);
                if (supportedTokens.length > 0) {
                    setSelectedToken(supportedTokens[0]); // Default to SOL
                }
            } catch (e) {
                setError('Failed to fetch supported tokens.');
                console.error(e);
            } finally {
                setIsLoadingTokens(false);
            }
        };
        fetchTokens();
    }, []);

    useEffect(() => {
        const fetchUserBalance = async () => {
            if (!user?.wallet_address) return;
            try {
                const balances = await heliusService.getTokenBalances(user.wallet_address);
                const solBalance = balances.find(b => b.symbol === 'SOL');
                setUserBalance(solBalance?.balance || 0);
                console.log('💰 User balance:', solBalance?.balance || 0, 'SOL');
            } catch (e) {
                console.error('Failed to fetch user balance:', e);
            }
        };
        fetchUserBalance();
    }, [user]);

    const handleSendGift = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!user) {
            setError("Please log in first");
            return;
        }

        if (!ready || !authenticated) {
            setError("Please wait for authentication to complete.");
            return;
        }

        if (!user.wallet_address) {
            setError("Wallet address not found. Please refresh the page.");
            return;
        }

        if (!walletReady && !privyUser?.wallet) {
            setError("Wallet is not ready yet. Please wait a moment and try again.");
            return;
        }

        if (!selectedToken || !amount || !recipientEmail) {
            setError("Please fill in all required fields.");
            return;
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError("Please enter a valid amount.");
            return;
        }
        
        // Check user balance
        if (selectedToken.isNative && numericAmount > userBalance) {
            setError(`Insufficient balance. You have ${userBalance.toFixed(4)} SOL available.`);
            return;
        }

        setIsSending(true);
        setError(null);
        setSuccessMessage(null);

        try {
            console.log('🎁 Step 1: Creating TipLink...');
            
            // Step 1: Create TipLink on backend
            const { tiplink_url, tiplink_public_key } = await tiplinkService.create();
            console.log('✅ TipLink created:', tiplink_public_key);

            // Step 2: Fund TipLink from user's Privy wallet
            console.log('💸 Step 2: Funding TipLink from your wallet...');
            
            // Check if wallets are ready
            if (!walletsReady) {
                throw new Error('Wallets are not ready yet. Please wait a moment and try again.');
            }

            // Find embedded Privy wallet by name (reliable method)
            const embeddedWallet = wallets.find(
                (w) => w.standardWallet?.name === 'Privy'
            );

            if (!embeddedWallet) {
                console.error('❌ No Privy embedded wallet found');
                console.error('Available wallets:', wallets.map(w => ({
                    address: w.address,
                    name: w.standardWallet?.name
                })));
                throw new Error(
                    `No Privy embedded wallet found. Available: ${wallets.map(w => w.standardWallet?.name || 'unknown').join(', ')}`
                );
            }

            console.log('✅ Found embedded Privy wallet:', embeddedWallet.address);

            // Step 3: Build transaction using @solana/web3.js (compatible with @solana/kit@3.0.0)
            console.log('📝 Step 3: Building transaction...');
            
            // Create transaction to fund TipLink
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: new PublicKey(embeddedWallet.address),
                    toPubkey: new PublicKey(tiplink_public_key),
                    lamports: numericAmount * LAMPORTS_PER_SOL,
                })
            );

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new PublicKey(embeddedWallet.address);

            // Serialize transaction to Uint8Array (required by Privy's signAndSendTransaction)
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            });

            console.log('✅ Transaction built and serialized successfully');

            // Step 4: Sign and send transaction using Privy's Solana hook
            console.log('📝 Step 4: Signing and sending transaction...');
            
            const result = await signAndSendTransaction({
                transaction: serializedTransaction,
                wallet: embeddedWallet,
                chain: 'solana:devnet',
            });

            // Convert signature from base64 to base58 (Solana expects base58)
            let signatureString: string;
            const signature = result.signature as string | Uint8Array;
            
            if (typeof signature === 'string') {
                // Check if it's base64 or base58
                if (signature.includes('/') || signature.includes('+') || signature.includes('=')) {
                    // It's base64, convert to base58
                    console.log('🔄 Converting signature from base64 to base58...');
                    const signatureBytes = Buffer.from(signature, 'base64');
                    signatureString = bs58.encode(signatureBytes);
                } else {
                    // Already base58
                    signatureString = signature;
                }
            } else if (signature instanceof Uint8Array) {
                // Convert Uint8Array to base58
                console.log('🔄 Converting signature from Uint8Array to base58...');
                signatureString = bs58.encode(signature);
            } else {
                throw new Error(`Unknown signature format: ${typeof signature}`);
            }
            
            console.log('✅ Transaction sent:', signatureString);
            console.log('⏳ Waiting for confirmation...');

            // Wait for confirmation with the correct base58 signature
            await connection.confirmTransaction(signatureString, 'confirmed');
            console.log('✅ Transaction confirmed!');

            // Step 3: Create gift record on backend
            console.log('🎁 Step 3: Creating gift record...');
            
            const createResponse = await giftService.createGift({
                recipient_email: recipientEmail,
                token_mint: selectedToken.mint,
                amount: numericAmount,
                message: message,
                sender_did: user.privy_did,
                tiplink_url,
                tiplink_public_key,
                funding_signature: signatureString,
            });

            const { claim_url, gift_id } = createResponse;
            console.log('✅ Gift created! Gift ID:', gift_id);

            // Generate QR code for the claim URL
            const fullClaimUrl = `${window.location.origin}${claim_url}`;
            const qrCodeDataUrl = await QRCode.toDataURL(fullClaimUrl, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#0c4a6e',
                    light: '#ffffff'
                }
            });

            // Set gift details and show success modal
            setGiftDetails({
                claim_url: fullClaimUrl,
                amount: numericAmount.toString(),
                token: selectedToken.symbol,
                recipient: recipientEmail,
                signature: signatureString,
                qrCode: qrCodeDataUrl
            });
            setShowSuccessModal(true);
            
            // Update user balance
            await refreshUser();
            
            // Clear form
            setRecipientEmail('');
            setAmount('');
            setMessage('');
            
        } catch (err: any) {
            console.error('❌ Error sending gift:', err);
            setError(err.response?.data?.error || err.message || 'Failed to send gift. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setSuccessMessage('Link copied to clipboard!');
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch (err) {
            setError('Failed to copy link');
        }
    };

    const shareViaEmail = () => {
        if (!giftDetails) return;
        const subject = encodeURIComponent('You received a crypto gift! 🎁');
        const body = encodeURIComponent(
            `You've received ${giftDetails.amount} ${giftDetails.token}!\n\n` +
            `Click here to claim your gift:\n${giftDetails.claim_url}\n\n` +
            `Happy gifting! 🎉`
        );
        window.open(`mailto:${giftDetails.recipient}?subject=${subject}&body=${body}`, '_blank');
    };

    if (isLoadingTokens) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Success Modal */}
            {showSuccessModal && giftDetails && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl max-w-md w-full animate-scale-in">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Gift Sent Successfully! 🎁</h2>
                            <p className="text-slate-400">
                                {giftDetails.amount} {giftDetails.token} sent to {giftDetails.recipient}
                            </p>
                        </div>

                        {/* QR Code */}
                        <div className="bg-white p-4 rounded-lg mb-6">
                            <img src={giftDetails.qrCode} alt="Gift QR Code" className="w-full" />
                        </div>

                        {/* Gift Link */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Gift Link</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={giftDetails.claim_url}
                                    readOnly
                                    className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm"
                                />
                                <button
                                    onClick={() => copyToClipboard(giftDetails.claim_url)}
                                    className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Transaction Details */}
                        <div className="bg-slate-900/50 rounded-lg p-4 mb-6 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Transaction:</span>
                                <a
                                    href={`https://explorer.solana.com/tx/${giftDetails.signature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sky-400 hover:text-sky-300 font-mono"
                                >
                                    {giftDetails.signature.slice(0, 8)}...{giftDetails.signature.slice(-8)}
                                </a>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={shareViaEmail}
                                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                Send via Email
                            </button>
                            <button
                                onClick={() => {
                                    setShowSuccessModal(false);
                                    setGiftDetails(null);
                                }}
                                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <button 
                onClick={() => navigate(-1)} 
                className="mb-4 text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors font-medium"
            >
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Back</span>
            </button>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg">
                <h1 className="text-3xl font-bold text-center mb-6">Send a Gift 🎁</h1>
                
                {/* User Balance Info */}
                <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border border-sky-500/30 rounded-lg p-4 mb-6">
                    <p className="text-slate-400 text-sm">Your Balance</p>
                    <p className="text-2xl font-bold text-white">{userBalance.toFixed(4)} SOL</p>
                    <p className="text-xs text-slate-500 mt-1">Available for gifting</p>
                    {userBalance < 0.01 && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <p className="text-yellow-200 text-sm">
                                ⚠️ Low balance. Add SOL to your wallet in the "Add Funds" page.
                            </p>
                        </div>
                    )}
                </div>
                
                <form onSubmit={handleSendGift} className="space-y-6">
                    {/* Token Selector */}
                    <div>
                        <label htmlFor="token" className="block text-sm font-medium text-slate-300 mb-2">
                            Token
                        </label>
                        <select
                            id="token"
                            value={selectedToken?.mint || ''}
                            onChange={(e) => {
                                const token = tokens.find(t => t.mint === e.target.value);
                                setSelectedToken(token || null);
                            }}
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        >
                            {tokens.map(token => (
                                <option key={token.mint} value={token.mint}>
                                    {token.symbol} - {token.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Recipient Email */}
                    <div>
                        <label htmlFor="recipientEmail" className="block text-sm font-medium text-slate-300 mb-2">
                            Recipient Email
                        </label>
                        <input
                            type="email"
                            id="recipientEmail"
                            value={recipientEmail}
                            onChange={(e) => setRecipientEmail(e.target.value)}
                            required
                            placeholder="recipient@example.com"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                    </div>

                    {/* Amount */}
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-slate-300 mb-2">
                            Amount ({selectedToken?.symbol || 'Token'})
                        </label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            min="0"
                            step="0.000001"
                            placeholder="0.00"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                        {selectedToken?.isNative && (
                            <p className="text-xs text-slate-400 mt-2">
                                Available: {userBalance.toFixed(4)} {selectedToken.symbol}
                            </p>
                        )}
                    </div>

                    {/* Message */}
                    <div>
                        <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                            Message (Optional)
                        </label>
                        <textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Add a personal message..."
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition resize-none"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}
                    
                    {successMessage && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                            <p className="text-green-400 text-sm">{successMessage}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSending || !user || userBalance < 0.001}
                        className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center text-lg shadow-lg"
                    >
                        {isSending ? (
                            <>
                                <Spinner size="6" color="border-white" />
                                <span className="ml-3">Sending Gift...</span>
                            </>
                        ) : (
                            '🎁 Send Gift'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default GiftPage;
