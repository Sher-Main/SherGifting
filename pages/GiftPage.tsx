import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { tokenService, giftService, tiplinkService, heliusService, feeService } from '../services/api';
import { Token, TokenBalance } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import QRCode from 'qrcode';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
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
    const [walletBalances, setWalletBalances] = useState<TokenBalance[]>([]);
    const [walletReady, setWalletReady] = useState(false);
    const [feeWalletAddress, setFeeWalletAddress] = useState<string | null>(null);
    const [feePercentage, setFeePercentage] = useState<number>(0.001); // Default 0.1%
    
    const [recipientEmail, setRecipientEmail] = useState('');
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    
    // Confirmation modal state
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState<{
        recipient: string;
        amount: number;
        fee: number;
        total: number;
        token: string;
        message: string;
    } | null>(null);
    
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
        const fetchTokensAndBalances = async () => {
            if (!user?.wallet_address) return;
            setIsLoadingTokens(true);
            try {
                // Fetch all wallet balances (non-zero tokens only)
                const balances = await heliusService.getTokenBalances(user.wallet_address);
                setWalletBalances(balances);
                
                // Filter to only non-zero tokens and sort alphabetically
                const nonZeroTokens = balances
                    .filter(b => b.balance > 0)
                    .sort((a, b) => a.symbol.localeCompare(b.symbol))
                    .map(b => ({
                        mint: b.address,
                        symbol: b.symbol,
                        name: b.name,
                        decimals: b.decimals,
                        isNative: b.symbol === 'SOL',
                    }));
                
                setTokens(nonZeroTokens);
                
                // Set default selected token (first non-zero token, or SOL if available)
                if (nonZeroTokens.length > 0) {
                    const defaultToken = nonZeroTokens.find(t => t.symbol === 'SOL') || nonZeroTokens[0];
                    setSelectedToken(defaultToken);
                    
                    // Set initial balance for selected token
                    const tokenBalance = balances.find(b => b.symbol === defaultToken.symbol);
                    setUserBalance(tokenBalance?.balance || 0);
                }
                
                console.log(`💰 Found ${nonZeroTokens.length} token(s) with non-zero balance`);
            } catch (e) {
                setError('Failed to fetch tokens and balances.');
                console.error(e);
            } finally {
                setIsLoadingTokens(false);
            }
        };
        fetchTokensAndBalances();
    }, [user]);
    
    // Update balance when token is selected
    useEffect(() => {
        if (selectedToken && walletBalances.length > 0) {
            const tokenBalance = walletBalances.find(b => b.symbol === selectedToken.symbol);
            setUserBalance(tokenBalance?.balance || 0);
            console.log(`💰 Balance for ${selectedToken.symbol}:`, tokenBalance?.balance || 0);
        }
    }, [selectedToken, walletBalances]);

    useEffect(() => {
        const fetchFeeConfig = async () => {
            try {
                const config = await feeService.getFeeConfig();
                setFeeWalletAddress(config.fee_wallet_address);
                setFeePercentage(config.fee_percentage);
                console.log('💼 Fee config loaded:', {
                    fee_wallet: config.fee_wallet_address,
                    fee_percentage: config.fee_percentage * 100 + '%'
                });
            } catch (e) {
                console.error('Failed to fetch fee config:', e);
            }
        };
        fetchFeeConfig();
    }, []);

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
        
        // Calculate fee (0.1% of gift amount)
        const feeAmount = numericAmount * feePercentage;
        const totalAmount = numericAmount + feeAmount;
        
        // Check user balance (including fee)
        if (selectedToken.isNative && totalAmount > userBalance) {
            setError(`Insufficient balance. You need ${totalAmount.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} gift + ${feeAmount.toFixed(4)} ${selectedToken.symbol} fee). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
            return;
        }
        
        // For SPL tokens, check if user has enough token balance AND enough SOL for fees
        if (!selectedToken.isNative) {
            if (totalAmount > userBalance) {
                setError(`Insufficient ${selectedToken.symbol} balance. You need ${totalAmount.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} gift + ${feeAmount.toFixed(4)} ${selectedToken.symbol} fee). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
                return;
            }
            
            // Check SOL balance for transaction fees (need at least 0.01 SOL for fees and rent)
            const solBalance = walletBalances.find(b => b.symbol === 'SOL')?.balance || 0;
            const MIN_SOL_FOR_FEES = 0.01; // Minimum SOL needed for transaction fees and rent
            if (solBalance < MIN_SOL_FOR_FEES) {
                setError(`Insufficient SOL for transaction fees. You need at least ${MIN_SOL_FOR_FEES} SOL to pay for transaction fees and rent. You have ${solBalance.toFixed(4)} SOL available. Please add more SOL to your wallet.`);
                return;
            }
        }

        // Show confirmation modal first
        setConfirmDetails({
            recipient: recipientEmail,
            amount: numericAmount,
            fee: feeAmount,
            total: totalAmount,
            token: selectedToken.symbol,
            message: message || '',
        });
        setShowConfirmModal(true);
        return;
    };

    const handleConfirmSend = async () => {
        if (!confirmDetails) return;
        
        setIsSending(true);
        setError(null);
        setSuccessMessage(null);
        setShowConfirmModal(false);

        const numericAmount = confirmDetails.amount;
        const feeAmount = confirmDetails.fee;
        const recipientEmail = confirmDetails.recipient;
        const message = confirmDetails.message;
        const tokenSymbol = confirmDetails.token;
        
        // Find the token from tokens array
        const currentToken = tokens.find(t => t.symbol === tokenSymbol) || selectedToken;
        if (!currentToken) {
            setError('Token not found. Please refresh the page.');
            setIsSending(false);
            return;
        }

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
            
            const isNative = currentToken.isNative || currentToken.mint === 'So11111111111111111111111111111111111111112';
            
            // Create transaction
            const transaction = new Transaction();
            
            // Add memo instruction to show total amount (for Privy modal display)
            const totalAmount = numericAmount + feeAmount;
            const memoText = `Total Transfer: ${totalAmount.toFixed(6)} ${currentToken.symbol} (Gift: ${numericAmount.toFixed(6)} + Fee: ${feeAmount.toFixed(6)})`;
            const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
            transaction.add({
                keys: [{ pubkey: new PublicKey(embeddedWallet.address), isSigner: true, isWritable: false }],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(memoText, 'utf-8'),
            });
            
            const senderPubkey = new PublicKey(embeddedWallet.address);
            const tipLinkPubkey = new PublicKey(tiplink_public_key);
            
            if (isNative) {
                // Native SOL transfer
                // Round lamports to integers to avoid floating-point precision errors
                const giftAmountLamports = Math.round(numericAmount * LAMPORTS_PER_SOL);
                const feeAmountLamports = Math.round(feeAmount * LAMPORTS_PER_SOL);
                
                console.log(`💰 Transaction breakdown (SOL):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountLamports} lamports)`);
                console.log(`  Fee (${feePercentage * 100}%): ${feeAmount} ${currentToken.symbol} (${feeAmountLamports} lamports)`);
                console.log(`  Total: ${numericAmount + feeAmount} ${currentToken.symbol} (${giftAmountLamports + feeAmountLamports} lamports)`);
                
                // Add gift amount transfer to TipLink
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: tipLinkPubkey,
                        lamports: giftAmountLamports,
                    })
                );
                
                // Add fee transfer to fee wallet if configured
                if (feeWalletAddress && feeAmountLamports > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress}`);
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: senderPubkey,
                            toPubkey: new PublicKey(feeWalletAddress),
                            lamports: feeAmountLamports,
                        })
                    );
                } else if (feeAmountLamports > 0) {
                    console.warn('⚠️ Fee wallet not configured. Fee will not be collected.');
                }
            } else {
                // SPL Token transfer - dynamically import @solana/spl-token to ensure Buffer is available
                const splToken = await import('@solana/spl-token');
                const {
                    getAssociatedTokenAddress,
                    createTransferInstruction,
                    createAssociatedTokenAccountInstruction,
                    TOKEN_PROGRAM_ID,
                    getAccount
                } = splToken;
                
                const mintPubkey = new PublicKey(currentToken.mint);
                const decimals = currentToken.decimals || 9;
                
                // Convert amount to token's smallest unit (like lamports for SOL)
                const giftAmountRaw = Math.round(numericAmount * Math.pow(10, decimals));
                const feeAmountRaw = Math.round(feeAmount * Math.pow(10, decimals));
                
                console.log(`💰 Transaction breakdown (SPL Token):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountRaw} raw units)`);
                console.log(`  Fee (${feePercentage * 100}%): ${feeAmount} ${currentToken.symbol} (${feeAmountRaw} raw units)`);
                console.log(`  Total: ${numericAmount + feeAmount} ${currentToken.symbol} (${giftAmountRaw + feeAmountRaw} raw units)`);
                
                // Get associated token addresses (ATAs)
                const senderATA = await getAssociatedTokenAddress(
                    mintPubkey,
                    senderPubkey,
                    false, // allowOwnerOffCurve
                    TOKEN_PROGRAM_ID
                );
                
                const tipLinkATA = await getAssociatedTokenAddress(
                    mintPubkey,
                    tipLinkPubkey,
                    true, // allowOwnerOffCurve (TipLink might not have ATA yet)
                    TOKEN_PROGRAM_ID
                );
                
                // Check if sender ATA exists and has balance
                try {
                    const senderAccount = await getAccount(connection, senderATA);
                    console.log(`✅ Sender ATA exists: ${senderATA.toBase58()}, balance: ${senderAccount.amount.toString()}`);
                    
                    if (senderAccount.amount < BigInt(giftAmountRaw + feeAmountRaw)) {
                        throw new Error(`Insufficient ${currentToken.symbol} balance. Required: ${numericAmount + feeAmount} ${currentToken.symbol}, Available: ${Number(senderAccount.amount) / Math.pow(10, decimals)} ${currentToken.symbol}`);
                    }
                } catch (error: any) {
                    if (error.name === 'TokenAccountNotFoundError') {
                        throw new Error(`No ${currentToken.symbol} token account found. Please ensure you have ${currentToken.symbol} in your wallet.`);
                    }
                    throw error;
                }
                
                // Check if TipLink ATA exists, create if not
                try {
                    await getAccount(connection, tipLinkATA);
                    console.log(`✅ TipLink ATA exists: ${tipLinkATA.toBase58()}`);
                } catch (error: any) {
                    if (error.name === 'TokenAccountNotFoundError') {
                        console.log(`📝 Creating TipLink ATA: ${tipLinkATA.toBase58()}`);
                        transaction.add(
                            createAssociatedTokenAccountInstruction(
                                senderPubkey, // payer
                                tipLinkATA, // ata
                                tipLinkPubkey, // owner
                                mintPubkey, // mint
                                TOKEN_PROGRAM_ID
                            )
                        );
                    } else {
                        throw error;
                    }
                }
                
                // Add gift amount transfer to TipLink
                transaction.add(
                    createTransferInstruction(
                        senderATA, // source
                        tipLinkATA, // destination
                        senderPubkey, // owner
                        BigInt(giftAmountRaw), // amount
                        [], // multiSigners
                        TOKEN_PROGRAM_ID
                    )
                );
                
                // Add fee transfer to fee wallet if configured
                if (feeWalletAddress && feeAmountRaw > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress}`);
                    const feeWalletPubkey = new PublicKey(feeWalletAddress);
                    const feeWalletATA = await getAssociatedTokenAddress(
                        mintPubkey,
                        feeWalletPubkey,
                        true, // allowOwnerOffCurve
                        TOKEN_PROGRAM_ID
                    );
                    
                    // Check if fee wallet ATA exists, create if not
                    try {
                        await getAccount(connection, feeWalletATA);
                        console.log(`✅ Fee wallet ATA exists: ${feeWalletATA.toBase58()}`);
                    } catch (error: any) {
                        if (error.name === 'TokenAccountNotFoundError') {
                            console.log(`📝 Creating fee wallet ATA: ${feeWalletATA.toBase58()}`);
                            transaction.add(
                                createAssociatedTokenAccountInstruction(
                                    senderPubkey, // payer
                                    feeWalletATA, // ata
                                    feeWalletPubkey, // owner
                                    mintPubkey, // mint
                                    TOKEN_PROGRAM_ID
                                )
                            );
                        } else {
                            throw error;
                        }
                    }
                    
                    transaction.add(
                        createTransferInstruction(
                            senderATA, // source
                            feeWalletATA, // destination
                            senderPubkey, // owner
                            BigInt(feeAmountRaw), // amount
                            [], // multiSigners
                            TOKEN_PROGRAM_ID
                        )
                    );
                } else if (feeAmountRaw > 0) {
                    console.warn('⚠️ Fee wallet not configured. Fee will not be collected.');
                }
            }

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
                chain: 'solana:mainnet',
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
                token_mint: currentToken.mint,
                amount: numericAmount,
                message: message,
                sender_did: user.privy_did,
                tiplink_url,
                tiplink_public_key,
                funding_signature: signatureString,
                token_symbol: currentToken.symbol,
                token_decimals: currentToken.decimals,
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


    if (isLoadingTokens) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Confirmation Modal */}
            {showConfirmModal && confirmDetails && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-md w-full animate-scale-in">
                        <h2 className="text-2xl font-bold text-white mb-4 text-center">Confirm Transaction</h2>
                        
                        <div className="space-y-4 mb-6">
                            <div className="bg-slate-900/50 rounded-lg p-4">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Recipient:</span>
                                    <span className="text-white">{confirmDetails.recipient}</span>
                                </div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Gift Amount:</span>
                                    <span className="text-white">{confirmDetails.amount.toFixed(6)} {confirmDetails.token}</span>
                                </div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Fee (0.1%):</span>
                                    <span className="text-slate-300">{confirmDetails.fee.toFixed(6)} {confirmDetails.token}</span>
                                </div>
                                <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                                    <span className="text-slate-300 font-medium">Total Transfer:</span>
                                    <span className="text-white font-bold text-lg">{confirmDetails.total.toFixed(6)} {confirmDetails.token}</span>
                                </div>
                            </div>
                            
                            {confirmDetails.message && (
                                <div className="bg-slate-900/50 rounded-lg p-4">
                                    <p className="text-slate-400 text-sm mb-1">Message:</p>
                                    <p className="text-white text-sm italic">"{confirmDetails.message}"</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    setConfirmDetails(null);
                                }}
                                className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmSend}
                                disabled={isSending}
                                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSending ? 'Sending...' : 'Confirm & Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Success Modal */}
            {showSuccessModal && giftDetails && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-2xl max-w-md w-full animate-scale-in">
                        <div className="text-center mb-4">
                            <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-1">Gift Sent Successfully! 🎁</h2>
                            <p className="text-slate-400 text-sm">
                                {giftDetails.amount} {giftDetails.token} sent to {giftDetails.recipient}
                            </p>
                        </div>

                        {/* QR Code */}
                        <div className="bg-white p-3 rounded-lg mb-4">
                            <img src={giftDetails.qrCode} alt="Gift QR Code" className="w-full" />
                        </div>

                        {/* Gift Link */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Gift Link</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={giftDetails.claim_url}
                                    readOnly
                                    className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs"
                                />
                                <button
                                    onClick={() => copyToClipboard(giftDetails.claim_url)}
                                    className="bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg transition-colors text-sm"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={() => {
                                setShowSuccessModal(false);
                                setGiftDetails(null);
                            }}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
                        >
                            Done
                        </button>
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
                    <p className="text-2xl font-bold text-white">
                        {userBalance.toFixed(4)} {selectedToken?.symbol || 'SOL'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Available for gifting</p>
                    {userBalance < 0.01 && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <p className="text-yellow-200 text-sm">
                                ⚠️ Low balance. Add {selectedToken?.symbol || 'tokens'} to your wallet in the "Add Funds" page.
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
                        {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && feeWalletAddress && (() => {
                            const displayAmount = parseFloat(amount);
                            const displayFee = displayAmount * feePercentage;
                            const displayTotal = displayAmount + displayFee;
                            return (
                                <div className="mt-3 p-3 bg-slate-900/30 border border-slate-700 rounded-lg">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Gift Amount:</span>
                                        <span className="text-white">{displayAmount.toFixed(6)} {selectedToken?.symbol}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Fee ({feePercentage * 100}%):</span>
                                        <span className="text-slate-300">{displayFee.toFixed(6)} {selectedToken?.symbol}</span>
                                    </div>
                                    <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                                        <span className="text-slate-300 font-medium">Total:</span>
                                        <span className="text-white font-medium">{displayTotal.toFixed(6)} {selectedToken?.symbol}</span>
                                    </div>
                                </div>
                            );
                        })()}
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
