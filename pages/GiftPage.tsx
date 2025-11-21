import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { tokenService, giftService, tiplinkService, heliusService, feeService, priceService, usernameService } from '../services/api';
import { Token, TokenBalance, ResolveRecipientResponse } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import { CARD_UPSELL_PRICE } from '../lib/cardTemplates';
import QRCode from 'qrcode';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
import bs58 from 'bs58';

const CardUpsellSection = React.lazy(() =>
    import('../components/CardUpsellSection').then((module) => ({
        default: module.CardUpsellSection,
    }))
);

const GiftPage: React.FC = () => {
    const { user, refreshUser, isLoading: authLoading } = useAuth();
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
    const showFormSkeleton = authLoading || isLoadingTokens || !walletReady || !user?.wallet_address;
    
    const [recipientInput, setRecipientInput] = useState('');
    const [resolvedRecipient, setResolvedRecipient] = useState<ResolveRecipientResponse | null>(null);
    const [resolvingRecipient, setResolvingRecipient] = useState(false);
    const [recipientError, setRecipientError] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    const trimmedRecipient = recipientInput.trim();
    const isUsernameRecipient = trimmedRecipient.startsWith('@');
    const resolvedRecipientEmail = isUsernameRecipient
        ? (resolvedRecipient?.email ?? '')
        : trimmedRecipient.toLowerCase();
    const recipientDisplayLabel = isUsernameRecipient
        ? (resolvedRecipient?.username ?? trimmedRecipient)
        : trimmedRecipient;
    
    // USD/Token conversion state
    const [amountMode, setAmountMode] = useState<'token' | 'usd'>('usd'); // Default to USD
    const [tokenPrice, setTokenPrice] = useState<number | null>(null);
    const [priceLastUpdated, setPriceLastUpdated] = useState<number | null>(null);
    const [usdAmount, setUsdAmount] = useState<string>('');
    const [tokenAmount, setTokenAmount] = useState<string>('');
    const [priceLoading, setPriceLoading] = useState(false);
    const [priceError, setPriceError] = useState<string | null>(null);
    
    // Card upsell state
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    const [recipientName, setRecipientName] = useState<string>('');
    
    // Confirmation modal state
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmDetails, setConfirmDetails] = useState<{
        recipientLabel: string;
        recipientEmail: string;
        amount: number;
        fee: number;
        total: number;
        token: string;
        tokenName: string;
        usdValue: number | null;
        usdFee: number | null;
        usdTotal: number | null;
        remainingBalance: number;
        remainingBalanceUsd: number | null;
        message: string;
        cardFee: number;
        cardFeeUsd: number | null;
        hasCard: boolean;
    } | null>(null);
    
    // Success modal state
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [giftDetails, setGiftDetails] = useState<{
        claim_url: string;
        amount: string;
        token: string;
        usdValue: number | null;
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
        if (!user?.wallet_address) {
            setIsLoadingTokens(false);
            return;
        }

        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const fetchTokensAndBalances = async () => {
            if (cancelled) return;
            setIsLoadingTokens(true);
            try {
                const balances = await heliusService.getTokenBalances(user.wallet_address!);
                setWalletBalances(balances);
                
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
                
                if (nonZeroTokens.length > 0) {
                    const defaultToken = nonZeroTokens.find(t => t.symbol === 'SOL') || nonZeroTokens[0];
                    setSelectedToken(defaultToken);
                    
                    const tokenBalance = balances.find(b => b.symbol === defaultToken.symbol);
                    setUserBalance(tokenBalance?.balance || 0);
                }
                
                console.log(`💰 Found ${nonZeroTokens.length} token(s) with non-zero balance`);
            } catch (e) {
                setError('Failed to fetch tokens and balances.');
                console.error(e);
            } finally {
                if (!cancelled) {
                    setIsLoadingTokens(false);
                }
            }
        };

        const scheduleFetch = () => {
            if (typeof window !== 'undefined' && (window as any).requestIdleCallback) {
                idleHandle = (window as any).requestIdleCallback(() => {
                    if (!cancelled) {
                        fetchTokensAndBalances();
                    }
                }, { timeout: 1200 });
            } else {
                timeoutId = setTimeout(() => {
                    if (!cancelled) {
                        fetchTokensAndBalances();
                    }
                }, 80);
            }
        };

        scheduleFetch();

        return () => {
            cancelled = true;
            if (idleHandle !== null && typeof (window as any).cancelIdleCallback === 'function') {
                (window as any).cancelIdleCallback(idleHandle);
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [user]);
    
    // Price fetching function
    const fetchTokenPrice = async (mintAddress: string) => {
        setPriceLoading(true);
        setPriceError(null);
        
        try {
            const response = await priceService.getTokenPrice(mintAddress);
            
            if (response.price) {
                setTokenPrice(response.price);
                setPriceLastUpdated(Date.now());
                console.log(`💰 Token price fetched: $${response.price} (source: ${response.source})`);
            } else {
                throw new Error('Price unavailable');
            }
        } catch (error) {
            console.error('Failed to fetch token price:', error);
            setPriceError('Unable to fetch current price');
            setAmountMode('token'); // Force token mode if price fails
            setTokenPrice(null);
        } finally {
            setPriceLoading(false);
        }
    };
    
    // Update balance when token is selected
    useEffect(() => {
        if (selectedToken && walletBalances.length > 0) {
            const tokenBalance = walletBalances.find(b => b.symbol === selectedToken.symbol);
            setUserBalance(tokenBalance?.balance || 0);
            console.log(`💰 Balance for ${selectedToken.symbol}:`, tokenBalance?.balance || 0);
        }
        
        // Fetch price when token is selected
        if (selectedToken?.mint) {
            fetchTokenPrice(selectedToken.mint);
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

    useEffect(() => {
        if (!isUsernameRecipient) {
            setResolvedRecipient(null);
            setRecipientError(null);
            setResolvingRecipient(false);
            return;
        }

        if (trimmedRecipient.length < 4) {
            setResolvedRecipient(null);
            setRecipientError('Username must be at least 4 characters.');
            return;
        }

        setResolvingRecipient(true);
        setRecipientError(null);

        const timeoutId = setTimeout(async () => {
            try {
                const result = await usernameService.resolveRecipient(trimmedRecipient);
                setResolvedRecipient(result);
                setRecipientError(null);
            } catch (err: any) {
                console.error('❌ Error resolving recipient username:', err);
                if (err?.response?.status === 404) {
                    setRecipientError('Username not found.');
                } else {
                    setRecipientError('Unable to resolve username.');
                }
                setResolvedRecipient(null);
            } finally {
                setResolvingRecipient(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [isUsernameRecipient, trimmedRecipient]);

    // Extract recipient name for card personalization
    useEffect(() => {
        if (isUsernameRecipient && resolvedRecipient) {
            // Try to get name from resolved recipient (if available)
            const name = resolvedRecipient.username?.replace('@', '') || resolvedRecipient.email.split('@')[0];
            setRecipientName(name);
        } else if (!isUsernameRecipient && trimmedRecipient.includes('@')) {
            // Extract name from email (part before @)
            const name = trimmedRecipient.split('@')[0];
            setRecipientName(name);
        } else {
            setRecipientName('');
        }
    }, [isUsernameRecipient, resolvedRecipient, trimmedRecipient]);

    // Helper function to parse simulation errors into user-friendly messages
    const parseSimulationError = (err: any): string => {
        if (!err) return 'Transaction simulation failed. Please check your balance and try again.';
        
        // Handle different error formats
        let errStr = '';
        if (typeof err === 'string') {
            errStr = err;
        } else if (err.toString) {
            errStr = err.toString();
        } else {
            errStr = JSON.stringify(err);
        }
        
        // Also check for nested error objects
        const errObj = typeof err === 'object' ? err : null;
        const errCode = errObj?.InstructionError?.[1]?.Custom || errObj?.Err || errObj?.code;
        
        console.log('🔍 Parsing simulation error:', { errStr, errObj, errCode });
        
        // Check error code first (most reliable)
        if (errCode !== undefined) {
            // Solana error codes: https://github.com/solana-labs/solana/blob/master/sdk/src/transaction/error.rs
            if (errCode === 1 || errStr.includes('InsufficientFunds')) {
                return 'Not enough SOL in your wallet to pay for transaction fees. Please add more SOL to your wallet.';
            }
            if (errCode === 2 || errStr.includes('InsufficientLamports')) {
                return 'Not enough SOL in your wallet. Please add more SOL to cover transaction fees.';
            }
        }
        
        // Common Solana error patterns (case-insensitive)
        const lowerErrStr = errStr.toLowerCase();
        
        if (lowerErrStr.includes('insufficient funds') || lowerErrStr.includes('insufficientfunds')) {
            return 'Not enough SOL in your wallet to pay for transaction fees. Please add more SOL to your wallet.';
        }
        if (lowerErrStr.includes('insufficient lamports') || lowerErrStr.includes('insufficientlamports')) {
            return 'Not enough SOL in your wallet. Please add more SOL to cover transaction fees.';
        }
        if (lowerErrStr.includes('insufficient token') || lowerErrStr.includes('insufficienttoken')) {
            return 'Not enough tokens in your wallet. Please check your balance and try again.';
        }
        if (lowerErrStr.includes('tokenaccountnotfound') || lowerErrStr.includes('token account not found')) {
            return 'Token account not found. Please ensure you have the token in your wallet.';
        }
        if (lowerErrStr.includes('accountnotfound') || lowerErrStr.includes('account not found')) {
            return 'Account not found. Please refresh and try again.';
        }
        if (lowerErrStr.includes('blockhashnotfound') || lowerErrStr.includes('blockhash not found')) {
            return 'Transaction expired. Please try again.';
        }
        if (lowerErrStr.includes('already in use') || lowerErrStr.includes('alreadyinuse')) {
            return 'Transaction is already being processed. Please wait a moment and try again.';
        }
        if (lowerErrStr.includes('custom program error') || lowerErrStr.includes('programerror')) {
            return 'Transaction failed. Please check your balance and try again.';
        }
        if (lowerErrStr.includes('invalid account') || lowerErrStr.includes('invalidaccount')) {
            return 'Invalid account. Please refresh and try again.';
        }
        if (lowerErrStr.includes('owner mismatch') || lowerErrStr.includes('ownermismatch')) {
            return 'Account ownership mismatch. Please refresh and try again.';
        }
        
        return 'Transaction simulation failed. Please check your balance and try again.';
    };

    // Helper function to parse transaction errors into user-friendly messages
    const parseTransactionError = (error: any): string => {
        if (!error) return 'Transaction failed. Please check your balance and try again.';
        
        const errorMessage = error?.message || error?.toString() || JSON.stringify(error);
        const lowerErrorMessage = errorMessage.toLowerCase();
        console.log('🔍 Parsing transaction error:', { errorMessage, error });
        
        // Check for common error patterns (case-insensitive)
        if (lowerErrorMessage.includes('insufficient funds') || lowerErrorMessage.includes('insufficientfunds')) {
            return 'Not enough SOL in your wallet to pay for transaction fees. Please add more SOL to your wallet.';
        }
        if (lowerErrorMessage.includes('insufficient lamports') || lowerErrorMessage.includes('insufficientlamports')) {
            return 'Not enough SOL in your wallet. Please add more SOL to cover transaction fees.';
        }
        if (lowerErrorMessage.includes('insufficient token') || lowerErrorMessage.includes('insufficienttoken')) {
            return 'Not enough tokens in your wallet. Please check your balance and try again.';
        }
        if (lowerErrorMessage.includes('simulation failed') || lowerErrorMessage.includes('transaction simulation failed')) {
            return 'Transaction failed. Please check that you have enough SOL for fees and enough tokens for the gift.';
        }
        if (lowerErrorMessage.includes('user rejected') || lowerErrorMessage.includes('userrejected') || lowerErrorMessage.includes('cancelled')) {
            return 'Transaction was cancelled. Please try again when ready.';
        }
        if (lowerErrorMessage.includes('blockhashnotfound') || lowerErrorMessage.includes('blockhash not found')) {
            return 'Transaction expired. Please try again.';
        }
        if (lowerErrorMessage.includes('network') || lowerErrorMessage.includes('connection')) {
            return 'Network error. Please check your connection and try again.';
        }
        if (lowerErrorMessage.includes('timeout') || lowerErrorMessage.includes('timed out')) {
            return 'Transaction timed out. Please try again.';
        }
        if (lowerErrorMessage.includes('signature') && lowerErrorMessage.includes('invalid')) {
            return 'Transaction signature invalid. Please try again.';
        }
        if (lowerErrorMessage.includes('rate limit') || lowerErrorMessage.includes('ratelimit')) {
            return 'Too many requests. Please wait a moment and try again.';
        }
        
        // Default user-friendly message
        return 'Transaction failed. Please check your balance and try again.';
    };

    // Helper function to get SOL balance (with fallback to direct connection fetch)
    const getSolBalance = async (): Promise<number> => {
        // First try to get from walletBalances
        const solFromBalances = walletBalances.find(b => b.symbol === 'SOL')?.balance;
        if (solFromBalances !== undefined && solFromBalances >= 0) {
            console.log(`💰 SOL balance from walletBalances: ${solFromBalances.toFixed(6)} SOL`);
            return solFromBalances;
        }
        
        // Fallback: fetch directly from connection
        if (user?.wallet_address) {
            try {
                const solBalanceLamports = await connection.getBalance(new PublicKey(user.wallet_address));
                const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
                console.log(`💰 Fetched SOL balance directly: ${solBalance.toFixed(6)} SOL`);
                return solBalance;
            } catch (error) {
                console.error('Error fetching SOL balance:', error);
                return 0;
            }
        }
        
        return 0;
    };

    // Mode switch handler
    const handleModeSwitch = (newMode: 'token' | 'usd') => {
        if (!tokenPrice && newMode === 'usd') {
            setPriceError('Price unavailable - cannot switch to USD mode');
            return;
        }
        
        if (newMode === 'usd' && tokenAmount) {
            // Convert current token amount to USD
            const usd = (parseFloat(tokenAmount) * tokenPrice!).toFixed(2);
            setUsdAmount(usd);
        } else if (newMode === 'token' && usdAmount) {
            // Convert current USD amount to tokens
            const tokens = (parseFloat(usdAmount) / tokenPrice!).toFixed(6);
            setTokenAmount(tokens);
            setAmount(tokens); // Update main amount state
        }
        
        setAmountMode(newMode);
    };

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

        if (!selectedToken || !trimmedRecipient) {
            setError("Please fill in all required fields.");
            return;
        }

        if (isUsernameRecipient) {
            if (resolvingRecipient) {
                setError("Resolving username, please wait a moment.");
                return;
            }
            if (!resolvedRecipientEmail) {
                setError(recipientError || "Unable to resolve username.");
                return;
            }
        } else if (!trimmedRecipient.includes('@')) {
            setError("Please enter a valid email address.");
            return;
        }

        const recipientEmailValue = resolvedRecipientEmail;
        if (!recipientEmailValue) {
            setError("Recipient could not be determined. Please try again.");
            return;
        }

        const recipientLabel = recipientDisplayLabel || recipientEmailValue;

        // Calculate final amount based on mode
        const numericAmount = amountMode === 'usd' && tokenPrice
            ? parseFloat(usdAmount) / tokenPrice
            : parseFloat(amount || tokenAmount);
            
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
            
            // Get SOL balance (with fallback to direct fetch)
            const solBalance = await getSolBalance();
            
            // Conservative estimate for initial check (base fee + 1 ATA rent + buffer)
            // We'll do accurate estimation in handleConfirmSend after TipLink is created
            const BASE_FEE = 0.000005; // Base transaction fee (~5,000 lamports)
            const RENT_PER_ATA = 0.00203928; // Rent exemption for token account
            const estimatedRequiredSol = (BASE_FEE + RENT_PER_ATA) * 1.2; // Add 20% buffer
            
            console.log('🔍 SOL Balance Check (Initial):', {
                solBalance: solBalance.toFixed(6),
                estimatedRequired: estimatedRequiredSol.toFixed(6),
                hasEnough: solBalance >= estimatedRequiredSol
            });
            
            if (solBalance < estimatedRequiredSol) {
                setError(`Insufficient SOL for transaction fees. You need approximately ${estimatedRequiredSol.toFixed(6)} SOL to pay for transaction fees and rent. You have ${solBalance.toFixed(6)} SOL available. Please add more SOL to your wallet.`);
                return;
            }
        }

        // Calculate card fee if selected (currently free for testing)
        const hasCard = !!selectedCard;
        const cardFeeUsd = hasCard ? CARD_UPSELL_PRICE : 0;
        const cardFeeInTokens = 0; // Free, so no token fee
        
        // Calculate USD values if price is available
        const usdValue = tokenPrice ? numericAmount * tokenPrice : null;
        const usdFee = tokenPrice ? feeAmount * tokenPrice : null;
        const totalWithCard = totalAmount; // No card fee added to transaction
        const usdTotal = tokenPrice ? (totalAmount * tokenPrice) + cardFeeUsd : null;
        
        // Check if user has enough balance (card is free, so no additional balance check needed)
        if (selectedToken.isNative && totalWithCard > userBalance) {
            setError(`Insufficient balance. You need ${totalWithCard.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} gift + ${feeAmount.toFixed(4)} ${selectedToken.symbol} fee). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
            return;
        }
        
        if (!selectedToken.isNative && totalWithCard > userBalance) {
            setError(`Insufficient ${selectedToken.symbol} balance. You need ${totalWithCard.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} gift + ${feeAmount.toFixed(4)} ${selectedToken.symbol} fee). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
            return;
        }
        
        // Calculate remaining balance after transaction
        const remainingBalance = userBalance - totalWithCard;
        const remainingBalanceUsd = tokenPrice ? remainingBalance * tokenPrice : null;
        
        // Show confirmation modal first
        setConfirmDetails({
            recipientLabel,
            recipientEmail: recipientEmailValue,
            amount: numericAmount,
            fee: feeAmount,
            total: totalWithCard,
            token: selectedToken.symbol,
            tokenName: selectedToken.name,
            usdValue,
            usdFee,
            usdTotal,
            remainingBalance,
            remainingBalanceUsd,
            message: message || '',
            cardFee: cardFeeInTokens,
            cardFeeUsd: hasCard ? cardFeeUsd : null,
            hasCard,
        });
        setShowConfirmModal(true);
        return;
    };

    const handleConfirmSend = async () => {
        if (!confirmDetails) return;
        
        setIsSending(true);
        setError(null);
        setSuccessMessage(null);
        // Keep modal open to show loading overlay during transaction processing

        const numericAmount = confirmDetails.amount;
        const feeAmount = confirmDetails.fee;
        const cardFee = confirmDetails.cardFee || 0;
        const recipientEmail = confirmDetails.recipientEmail;
        const recipientLabel = confirmDetails.recipientLabel;
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

            // For SPL tokens, verify SOL balance with accurate fee estimation
            if (!currentToken.isNative && currentToken.mint !== 'So11111111111111111111111111111111111111112') {
                // Get actual SOL balance
                const solBalance = await getSolBalance();
                
                // Estimate required SOL based on actual transaction
                const BASE_FEE = 0.000005; // Base transaction fee (~5,000 lamports)
                const RENT_PER_ATA = 0.00203928; // Rent exemption for token account (~2,039,280 lamports)
                let estimatedRequiredSol = BASE_FEE;
                
                const splToken = await import('@solana/spl-token');
                const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = splToken;
                const senderPubkey = new PublicKey(embeddedWallet.address);
                const tipLinkPubkey = new PublicKey(tiplink_public_key);
                const mintPubkey = new PublicKey(currentToken.mint);
                
                // Check TipLink ATA
                const tipLinkATA = await getAssociatedTokenAddress(
                    mintPubkey,
                    tipLinkPubkey,
                    true,
                    TOKEN_PROGRAM_ID
                );
                try {
                    await getAccount(connection, tipLinkATA);
                    console.log('✅ TipLink ATA already exists');
                } catch (error: any) {
                    if (error.name === 'TokenAccountNotFoundError') {
                        estimatedRequiredSol += RENT_PER_ATA;
                        console.log('📝 TipLink ATA needs to be created (+0.00203928 SOL)');
                    } else {
                        throw error;
                    }
                }
                
                // Check fee wallet ATA (if fee wallet is configured)
                if (feeWalletAddress) {
                    const feeWalletPubkey = new PublicKey(feeWalletAddress);
                    const feeWalletATA = await getAssociatedTokenAddress(
                        mintPubkey,
                        feeWalletPubkey,
                        true,
                        TOKEN_PROGRAM_ID
                    );
                    try {
                        await getAccount(connection, feeWalletATA);
                        console.log('✅ Fee wallet ATA already exists');
                    } catch (error: any) {
                        if (error.name === 'TokenAccountNotFoundError') {
                            estimatedRequiredSol += RENT_PER_ATA;
                            console.log('📝 Fee wallet ATA needs to be created (+0.00203928 SOL)');
                        } else {
                            throw error;
                        }
                    }
                }
                
                // Add 10% buffer for safety
                estimatedRequiredSol *= 1.1;
                
                console.log('🔍 SOL Balance Check (Accurate):', {
                    solBalance: solBalance.toFixed(6),
                    estimatedRequired: estimatedRequiredSol.toFixed(6),
                    hasEnough: solBalance >= estimatedRequiredSol
                });
                
                if (solBalance < estimatedRequiredSol) {
                    throw new Error(`Insufficient SOL for transaction fees. You need approximately ${estimatedRequiredSol.toFixed(6)} SOL to pay for transaction fees and rent. You have ${solBalance.toFixed(6)} SOL available. Please add more SOL to your wallet.`);
                }
            }

            // Step 3: Build transaction using @solana/web3.js (compatible with @solana/kit@3.0.0)
            console.log('📝 Step 3: Building transaction...');
            
            const isNative = currentToken.isNative || currentToken.mint === 'So11111111111111111111111111111111111111112';
            
            // Create transaction
            const transaction = new Transaction();
            
            // Add memo instruction to show total amount (for Privy modal display)
            const totalAmount = numericAmount + feeAmount; // Card is free, no fee added
            // Calculate USD value for memo if price is available
            const memoUsdValue = tokenPrice ? numericAmount * tokenPrice : null;
            const memoText = memoUsdValue !== null
                ? `Gift: $${memoUsdValue.toFixed(3)} USD (${numericAmount.toFixed(6)} ${currentToken.symbol}) to ${recipientLabel}${cardFee > 0 ? ' + Card' : ''}`
                : `Gift: ${numericAmount.toFixed(6)} ${currentToken.symbol} to ${recipientLabel}${cardFee > 0 ? ' + Card' : ''}`;
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
                // Card is free, so no card fee in transaction
                
                console.log(`💰 Transaction breakdown (SOL):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountLamports} lamports)`);
                console.log(`  Fee (${feePercentage * 100}%): ${feeAmount} ${currentToken.symbol} (${feeAmountLamports} lamports)`);
                if (cardFee > 0) {
                    console.log(`  Card fee: ${cardFee} ${currentToken.symbol} (FREE - not charged)`);
                }
                console.log(`  Total: ${numericAmount + feeAmount} ${currentToken.symbol} (${giftAmountLamports + feeAmountLamports} lamports)`);
                
                // Add gift amount transfer to TipLink
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: tipLinkPubkey,
                        lamports: giftAmountLamports,
                    })
                );
                
                // Add fee transfer to fee wallet if configured (only transaction fee, card is free)
                if (feeWalletAddress && feeAmountLamports > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress} (transaction fee only)`);
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
                // Card is free, so no card fee in transaction
                
                console.log(`💰 Transaction breakdown (SPL Token):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountRaw} raw units)`);
                console.log(`  Fee (${feePercentage * 100}%): ${feeAmount} ${currentToken.symbol} (${feeAmountRaw} raw units)`);
                if (cardFee > 0) {
                    console.log(`  Card fee: ${cardFee} ${currentToken.symbol} (FREE - not charged)`);
                }
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
                
                // Add fee transfer to fee wallet if configured (only transaction fee, card is free)
                if (feeWalletAddress && feeAmountRaw > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress} (transaction fee only)`);
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
                            BigInt(feeAmountRaw), // amount (transaction fee only, card is free)
                            [], // multiSigners
                            TOKEN_PROGRAM_ID
                        )
                    );
                } else if (feeAmountRaw > 0) {
                    console.warn('⚠️ Fee wallet not configured. Fee will not be collected.');
                }
            }

            // ✅ CRITICAL: Get fresh blockhash RIGHT BEFORE signing (prevents expiration)
            console.log('🔄 Getting fresh blockhash for transaction...');
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            
            // Set transaction properties
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new PublicKey(embeddedWallet.address);
            
            // ✅ Set last valid block height to prevent expiration
            if (lastValidBlockHeight) {
                transaction.lastValidBlockHeight = lastValidBlockHeight;
            }
            
            console.log(`✅ Transaction blockhash: ${blockhash.substring(0, 8)}... (valid until block ${lastValidBlockHeight})`);

            // Step 3.5: Simulate transaction to catch errors early (before serialization)
            console.log('🔍 Step 3.5: Simulating transaction to check for errors...');
            try {
                // For @solana/web3.js v1.98.4, simulateTransaction accepts Transaction object directly
                // No options needed - it will use defaults and handle blockhash automatically
                const simulation = await connection.simulateTransaction(transaction);
                
                if (simulation.value.err) {
                    const errorMessage = parseSimulationError(simulation.value.err);
                    console.error('❌ Transaction simulation failed:', simulation.value.err);
                    console.error('📋 Simulation logs:', simulation.value.logs);
                    if (simulation.value.logs) {
                        console.error('📋 Full simulation logs:', simulation.value.logs.join('\n'));
                    }
                    throw new Error(errorMessage);
                }
                
                console.log('✅ Transaction simulation passed:', {
                    fee: simulation.value.fee ? `${(simulation.value.fee / LAMPORTS_PER_SOL).toFixed(6)} SOL` : 'N/A',
                    unitsConsumed: simulation.value.unitsConsumed || 'N/A',
                });
            } catch (simError: any) {
                console.error('❌ Transaction simulation error:', simError);
                
                // If it's an API error (Invalid arguments), log warning but don't block transaction
                // The transaction will still be validated when sent to the network
                // Gas fees will be paid in SOL automatically by Solana network
                if (simError.message?.includes('Invalid arguments') || simError.message?.includes('simulateTransaction')) {
                    console.warn('⚠️ Simulation API error - proceeding without simulation. Transaction will be validated on send.');
                    console.warn('💡 Gas fees will be automatically deducted from SOL balance when transaction is sent.');
                    // Don't throw - allow transaction to proceed
                } else if (simError.message && !simError.message.includes('simulation') && !simError.message.includes('Transaction simulation')) {
                    // If it's a real simulation error (like insufficient funds), throw it
                    throw simError;
                } else {
                    // Otherwise, parse and throw
                    const errorMessage = parseTransactionError(simError);
                    throw new Error(errorMessage);
                }
            }

            // Serialize transaction to Uint8Array (required by Privy's signAndSendTransaction)
            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            });

            console.log('✅ Transaction built and serialized successfully');

            // Step 4: Sign and send transaction using Privy's Solana hook
            console.log('📝 Step 4: Signing and sending transaction...');
            
            let signatureString: string;
            let result: any;

            try {
                // ✅ Send transaction immediately after building (prevents blockhash expiration)
                result = await signAndSendTransaction({
                    transaction: serializedTransaction,
                    wallet: embeddedWallet,
                    chain: 'solana:mainnet',
                });
                
                // Normal success path
                const signature = result.signature as string | Uint8Array;
                
                if (typeof signature === 'string') {
                    if (signature.includes('/') || signature.includes('+') || signature.includes('=')) {
                        const signatureBytes = Buffer.from(signature, 'base64');
                        signatureString = bs58.encode(signatureBytes);
                    } else {
                        signatureString = signature;
                    }
                } else if (signature instanceof Uint8Array) {
                    signatureString = bs58.encode(signature);
                } else {
                    throw new Error(`Unknown signature format: ${typeof signature}`);
                }
                
                console.log('✅ Transaction sent (success path):', signatureString);
                
            } catch (error: any) {
                // Log detailed error information for debugging
                console.error('❌ Transaction failed:', error);
                console.error('📋 Error details:', {
                    message: error?.message,
                    code: error?.code,
                    name: error?.name,
                    stack: error?.stack,
                    data: error?.data,
                    transaction: error?.transaction,
                });
                
                // Check if error contains a signature (unlikely if transaction failed)
                if (error?.signature) {
                    console.log('⚠️ Found signature in error object, checking if transaction succeeded...');
                    const sig = error.signature;
                    
                    if (typeof sig === 'string') {
                        signatureString = sig.includes('/') || sig.includes('+') || sig.includes('=')
                            ? bs58.encode(Buffer.from(sig, 'base64'))
                            : sig;
                    } else if (sig instanceof Uint8Array) {
                        signatureString = bs58.encode(sig);
                    } else {
                        throw new Error('Could not extract signature from error');
                    }
                    
                    // Verify transaction actually succeeded
                    try {
                        const tx = await connection.getTransaction(signatureString, {
                            commitment: 'confirmed',
                        });
                        
                        if (tx && tx.meta?.err === null) {
                            console.log('✅ Transaction actually succeeded despite error!');
                            // Continue with success flow
                        } else {
                            const onChainError = parseSimulationError(tx?.meta?.err);
                            throw new Error(onChainError);
                        }
                    } catch (verifyError: any) {
                        const errorMessage = parseTransactionError(verifyError);
                        throw new Error(errorMessage);
                    }
                } else {
                    // Transaction definitely failed - parse error for user-friendly message
                    const errorMessage = parseTransactionError(error);
                    throw new Error(errorMessage);
                }
            }

            console.log('✅ Transaction signature:', signatureString);
            console.log('⏳ Waiting for confirmation...');

            // Wait for confirmation - this will verify the transaction actually succeeded
            try {
                const confirmation = await connection.confirmTransaction(signatureString, 'confirmed');
                console.log('✅ Transaction confirmed!', confirmation);
            } catch (confirmError: any) {
                // If confirmation fails, check if transaction exists on-chain
                console.log('⚠️ Confirmation failed, checking if transaction exists on-chain...');
                const tx = await connection.getTransaction(signatureString, {
                    commitment: 'confirmed',
                });
                
                if (tx && tx.meta?.err === null) {
                    console.log('✅ Transaction found on-chain and succeeded!');
                } else if (tx) {
                    throw new Error(`Transaction failed on-chain: ${tx.meta?.err}`);
                } else {
                    throw new Error('Transaction not found on-chain. Please check your wallet and try again.');
                }
            }

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
                card_type: selectedCard || null,
                card_recipient_name: recipientName || null,
                card_price_usd: selectedCard ? CARD_UPSELL_PRICE : undefined,
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

            // Use USD value from confirmDetails if available, otherwise calculate from tokenPrice
            const giftUsdValue = confirmDetails?.usdValue !== null && confirmDetails?.usdValue !== undefined
                ? confirmDetails.usdValue
                : (tokenPrice ? numericAmount * tokenPrice : null);
            
            // Close confirmation modal and show success modal
            setShowConfirmModal(false);
            setConfirmDetails(null);
            
            // Set gift details and show success modal
            setGiftDetails({
                claim_url: fullClaimUrl,
                amount: numericAmount.toString(),
                token: selectedToken.symbol,
                usdValue: giftUsdValue,
                recipient: recipientLabel,
                signature: signatureString,
                qrCode: qrCodeDataUrl
            });
            setShowSuccessModal(true);
            
            // Update user balance
            await refreshUser();
            
            // Clear form
            setRecipientInput('');
            setResolvedRecipient(null);
            setRecipientError(null);
            setResolvingRecipient(false);
            setAmount('');
            setTokenAmount('');
            setUsdAmount('');
            setMessage('');
            setAmountMode('token'); // Reset to token mode
            setSelectedCard(null); // Reset card selection
            setRecipientName(''); // Reset recipient name
            
        } catch (err: any) {
            console.error('❌ Error sending gift:', err);
            setError(err.response?.data?.error || err.message || 'Failed to send gift. Please try again.');
            // Close confirmation modal on error so user can see the error message
            setShowConfirmModal(false);
            setConfirmDetails(null);
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
    return (
        <div className="animate-fade-in">
            {/* Confirmation Modal */}
            {showConfirmModal && confirmDetails && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-md w-full animate-scale-in relative">
                        {/* Loading Overlay */}
                        {isSending && (
                            <div className="absolute inset-0 bg-slate-800/95 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
                                <Spinner size="8" color="border-sky-400" />
                                <p className="text-white font-medium mt-4 text-lg">Processing Transaction...</p>
                                <p className="text-slate-400 text-sm mt-2">Please wait while we sign and send your gift</p>
                            </div>
                        )}
                        
                        <h2 className="text-2xl font-bold text-white mb-4 text-center">Confirm Transaction</h2>
                        
                        <div className="space-y-4 mb-6">
                            <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                                {/* What I am sending - Token */}
                                <div className="pb-3 border-b border-slate-700">
                                    <p className="text-slate-400 text-xs mb-1">What I am sending</p>
                                    <p className="text-white font-medium">{confirmDetails.token} - {confirmDetails.tokenName}</p>
                                </div>
                                
                                {/* Amount being sent - USD value */}
                                <div className="pb-3 border-b border-slate-700">
                                    <p className="text-slate-400 text-xs mb-1">Amount being sent</p>
                                    {confirmDetails.usdValue !== null ? (
                                        <p className="text-white font-bold text-xl">${confirmDetails.usdValue.toFixed(3)} USD</p>
                                    ) : (
                                        <p className="text-white font-bold text-xl">{confirmDetails.amount.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                    {confirmDetails.usdValue !== null && (
                                        <p className="text-slate-400 text-xs mt-1">{confirmDetails.amount.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                </div>
                                
                                {/* Transaction fee - USD */}
                                <div className="pb-3 border-b border-slate-700">
                                    <p className="text-slate-400 text-xs mb-1">Transaction fee</p>
                                    {confirmDetails.usdFee !== null ? (
                                        <p className="text-slate-300 font-medium">${confirmDetails.usdFee.toFixed(3)} USD</p>
                                    ) : (
                                        <p className="text-slate-300 font-medium">{confirmDetails.fee.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                    {confirmDetails.usdFee !== null && (
                                        <p className="text-slate-500 text-xs mt-1">{confirmDetails.fee.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                </div>
                                
                                {/* Greeting Card (free) */}
                                {confirmDetails.hasCard && (
                                    <div className="pb-3 border-b border-slate-700">
                                        <p className="text-slate-400 text-xs mb-1">Greeting Card</p>
                                        <p className="text-green-400 font-medium">FREE</p>
                                    </div>
                                )}
                                
                                {/* To whom */}
                                <div className="pb-3 border-b border-slate-700">
                                    <p className="text-slate-400 text-xs mb-1">To whom</p>
                                    <p className="text-white font-medium">{confirmDetails.recipientLabel}</p>
                                </div>
                                
                                {/* Wallet balance - What's left */}
                                <div>
                                    <p className="text-slate-400 text-xs mb-1">What's left in your wallet</p>
                                    {confirmDetails.remainingBalanceUsd !== null ? (
                                        <>
                                            <p className="text-white font-medium">${confirmDetails.remainingBalanceUsd.toFixed(3)} USD</p>
                                            <p className="text-slate-400 text-xs mt-1">{confirmDetails.remainingBalance.toFixed(6)} {confirmDetails.token}</p>
                                        </>
                                    ) : (
                                        <p className="text-white font-medium">{confirmDetails.remainingBalance.toFixed(6)} {confirmDetails.token}</p>
                                    )}
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
                                    if (!isSending) {
                                        setShowConfirmModal(false);
                                        setConfirmDetails(null);
                                    }
                                }}
                                disabled={isSending}
                                className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                {giftDetails.usdValue !== null ? (
                                    <>
                                        <span className="text-white font-semibold">${giftDetails.usdValue.toFixed(3)} USD</span>
                                        {' '}({parseFloat(giftDetails.amount).toFixed(3)} {giftDetails.token}) sent to {giftDetails.recipient}
                                    </>
                                ) : (
                                    <>
                                        {parseFloat(giftDetails.amount).toFixed(3)} {giftDetails.token} sent to {giftDetails.recipient}
                                    </>
                                )}
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

                {showFormSkeleton ? (
                    <GiftFormSkeleton />
                ) : (
                    <>
                        {/* User Balance Info */}
                        <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border border-sky-500/30 rounded-lg p-4 mb-6">
                            <p className="text-slate-400 text-sm">Your Balance</p>
                            {tokenPrice && tokenPrice > 0 ? (
                                <>
                                    <p className="text-2xl font-bold text-white">
                                        ${(userBalance * tokenPrice).toFixed(3)} USD
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1">
                                        {userBalance.toFixed(4)} {selectedToken?.symbol || 'SOL'}
                                    </p>
                                </>
                            ) : (
                                <p className="text-2xl font-bold text-white">
                                    {userBalance.toFixed(4)} {selectedToken?.symbol || 'SOL'}
                                </p>
                            )}
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
                                // Reset amount fields when token changes
                                setAmount('');
                                setTokenAmount('');
                                setUsdAmount('');
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

                    {/* Recipient (Email or Username) */}
                    <div>
                        <label htmlFor="recipientIdentifier" className="block text-sm font-medium text-slate-300 mb-2">
                            Recipient Email / @Username
                        </label>
                        <input
                            type="text"
                            id="recipientIdentifier"
                            value={recipientInput}
                            onChange={(e) => setRecipientInput(e.target.value)}
                            required
                            placeholder="recipient@example.com or @username"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                        <div className="mt-2 text-sm">
                            {recipientError && (
                                <p className="text-rose-400">{recipientError}</p>
                            )}
                            {isUsernameRecipient ? (
                                <>
                                    {resolvingRecipient && (
                                        <p className="text-slate-400">Resolving username...</p>
                                    )}
                                    {!resolvingRecipient && resolvedRecipient && (
                                        <p className="text-emerald-300">✓ Username linked to {resolvedRecipient.email}</p>
                                    )}
                                </>
                            ) : (
                                trimmedRecipient && (
                                    <p className="text-slate-400">Gift will be sent to {trimmedRecipient}</p>
                                )
                            )}
                        </div>
                    </div>

                    {/* Card Upsell Section */}
                    <Suspense fallback={<CardUpsellFallback />}>
                        <CardUpsellSection
                            recipientName={recipientName}
                            selectedCard={selectedCard}
                            onCardSelect={setSelectedCard}
                        />
                    </Suspense>

                    {/* Amount Input with Mode Toggle */}
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-slate-300 mb-2">
                            Amount
                        </label>
                        
                        {/* Mode Toggle */}
                        <div className="flex gap-2 mb-3">
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('token')}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                                    amountMode === 'token'
                                        ? 'bg-sky-500 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                            >
                                Token Amount
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('usd')}
                                disabled={!tokenPrice || priceLoading}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                                    amountMode === 'usd'
                                        ? 'bg-sky-500 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                USD Amount
                            </button>
                        </div>
                        
                        {/* Amount Input */}
                        {amountMode === 'token' ? (
                            <input
                                type="number"
                                id="amount"
                                value={tokenAmount}
                                onChange={(e) => {
                                    setTokenAmount(e.target.value);
                                    setAmount(e.target.value); // Keep existing amount state for compatibility
                                }}
                                required
                                min="0"
                                step="0.000001"
                                placeholder="0.00"
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                            />
                        ) : (
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white text-lg font-medium">$</span>
                                <input
                                    type="number"
                                    id="amount"
                                    value={usdAmount}
                                    onChange={(e) => {
                                        setUsdAmount(e.target.value);
                                        // Calculate token amount but don't update amount state until submission
                                        if (tokenPrice) {
                                            const calculatedTokenAmount = (parseFloat(e.target.value) / tokenPrice).toString();
                                            setTokenAmount(calculatedTokenAmount);
                                            setAmount(calculatedTokenAmount);
                                        }
                                    }}
                                    required
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-8 pr-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                                />
                            </div>
                        )}
                        
                        {/* Conversion Preview */}
                        {tokenPrice && (
                            <div className="mt-2 text-sm text-slate-400">
                                {amountMode === 'token' && tokenAmount && !isNaN(parseFloat(tokenAmount)) ? (
                                    <span>≈ ${(parseFloat(tokenAmount) * tokenPrice).toFixed(2)} USD</span>
                                ) : amountMode === 'usd' && usdAmount && !isNaN(parseFloat(usdAmount)) ? (
                                    <span>≈ {(parseFloat(usdAmount) / tokenPrice).toFixed(6)} {selectedToken?.symbol}</span>
                                ) : null}
                            </div>
                        )}
                        
                        {/* Price Status */}
                        {priceLastUpdated && (
                            <div className="mt-1 text-xs text-slate-500">
                                Price updated {Math.floor((Date.now() - priceLastUpdated) / 1000)}s ago
                            </div>
                        )}
                        
                        {/* Price Error */}
                        {priceError && (
                            <div className="mt-2 text-xs text-yellow-400">
                                {priceError}
                            </div>
                        )}
                        
                        {/* Loading Indicator */}
                        {priceLoading && (
                            <div className="mt-2 text-xs text-slate-400">
                                Loading price...
                            </div>
                        )}
                        
                        {/* Available Balance Info */}
                        {selectedToken?.isNative && (
                            <p className="text-xs text-slate-400 mt-2">
                                Available: {userBalance.toFixed(4)} {selectedToken.symbol}
                            </p>
                        )}
                        
                        {/* Fee Breakdown */}
                        {((amountMode === 'token' && tokenAmount) || (amountMode === 'usd' && usdAmount)) && 
                         !isNaN(parseFloat(amountMode === 'token' ? tokenAmount : (usdAmount && tokenPrice ? (parseFloat(usdAmount) / tokenPrice).toString() : '0'))) && 
                         parseFloat(amountMode === 'token' ? tokenAmount : (usdAmount && tokenPrice ? (parseFloat(usdAmount) / tokenPrice).toString() : '0')) > 0 && 
                         feeWalletAddress && (() => {
                            const tokenAmountValue = amountMode === 'token' 
                                ? parseFloat(tokenAmount) 
                                : (usdAmount && tokenPrice ? parseFloat(usdAmount) / tokenPrice : 0);
                            const tokenFee = tokenAmountValue * feePercentage;
                            const tokenTotal = tokenAmountValue + tokenFee;
                            
                            // Calculate USD values if in USD mode
                            const usdAmountValue = amountMode === 'usd' && tokenPrice
                                ? parseFloat(usdAmount)
                                : (amountMode === 'token' && tokenPrice ? parseFloat(tokenAmount) * tokenPrice : 0);
                            const usdFee = usdAmountValue * feePercentage;
                            const usdTotal = usdAmountValue + usdFee;
                            
                            return (
                                <div className="mt-3 p-3 bg-slate-900/30 border border-slate-700 rounded-lg">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Gift Amount:</span>
                                        <span className="text-white">
                                            {amountMode === 'usd' && tokenPrice
                                                ? `$${usdAmountValue.toFixed(3)}`
                                                : `${tokenAmountValue.toFixed(6)} ${selectedToken?.symbol}`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Fee ({feePercentage * 100}%):</span>
                                        <span className="text-slate-300">
                                            {amountMode === 'usd' && tokenPrice
                                                ? `$${usdFee.toFixed(3)}`
                                                : `${tokenFee.toFixed(6)} ${selectedToken?.symbol}`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                                        <span className="text-slate-300 font-medium">Total:</span>
                                        <span className="text-white font-medium">
                                            {amountMode === 'usd' && tokenPrice
                                                ? `$${usdTotal.toFixed(3)}`
                                                : `${tokenTotal.toFixed(6)} ${selectedToken?.symbol}`}
                                        </span>
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
                    </>
                )}
            </div>
        </div>
    );
};

const GiftFormSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-xl bg-slate-900/40 border border-slate-700" />
        {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-xl bg-slate-900/40 border border-slate-700" />
        ))}
        <div className="h-12 rounded-xl bg-slate-900/40 border border-slate-700" />
    </div>
);

const CardUpsellFallback: React.FC = () => (
    <div className="h-48 rounded-2xl border border-slate-700 bg-slate-900/40 animate-pulse" />
);

export default GiftPage;
