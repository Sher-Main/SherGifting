import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { tokenService, giftService, tiplinkService, heliusService, feeService, priceService, usernameService } from '../services/api';
import { Token, TokenBalance, ResolveRecipientResponse } from '../types';
import Spinner from '../components/Spinner';
import { Gift, ChevronLeft, AlertTriangle, Mail, QrCode, Copy, ArrowUpRight, Check } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import InputField from '../components/UI/InputField';
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
    const [balanceError, setBalanceError] = useState<string | null>(null);
    
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
                
                // Validate balance after refresh if amount is entered
                if (tokenAmount && !isNaN(parseFloat(tokenAmount))) {
                    const numValue = parseFloat(tokenAmount);
                    if (numValue > 0) {
                        validateBalance(numValue).catch(console.error);
                    }
                }
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
            
            // Validate balance when token changes if amount is entered
            if (tokenAmount && !isNaN(parseFloat(tokenAmount))) {
                const numValue = parseFloat(tokenAmount);
                if (numValue > 0) {
                    validateBalance(numValue).catch(console.error);
                }
            }
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

    // Real-time balance validation function
    const validateBalance = async (amountValue: number) => {
        if (!selectedToken || !tokenPrice || amountValue <= 0) {
            setBalanceError(null);
            return;
        }

        try {
            const FLAT_SERVICE_FEE_USD = 1.00;
            const CARD_FEE_USD = selectedCard ? 1.00 : 0;
            const totalFeesUSD = FLAT_SERVICE_FEE_USD + CARD_FEE_USD;
            
            // Calculate fees in token
            const serviceFeeAmount = tokenPrice > 0 ? FLAT_SERVICE_FEE_USD / tokenPrice : 0;
            const cardFeeAmount = selectedCard && tokenPrice > 0 ? CARD_FEE_USD / tokenPrice : 0;
            const totalFeeAmount = serviceFeeAmount + cardFeeAmount;
            const totalAmount = amountValue + totalFeeAmount;

            if (selectedToken.isNative) {
                // For native SOL, fees are in SOL
                if (totalAmount > userBalance) {
                    setBalanceError(`Insufficient balance. You need ${totalAmount.toFixed(4)} SOL (${amountValue.toFixed(4)} SOL gift + ${totalFeeAmount.toFixed(4)} SOL fees). You have ${userBalance.toFixed(4)} SOL available.`);
                    return;
                }
                setBalanceError(null);
            } else {
                // For SPL tokens, try token first, then SOL fallback
                if (totalAmount > userBalance) {
                    // Not enough token balance - check SOL fallback
                    const tokenBalanceForGift = userBalance - amountValue;
                    if (tokenBalanceForGift < 0) {
                        // Not even enough for gift
                        setBalanceError(`Insufficient ${selectedToken.symbol} balance. You need ${amountValue.toFixed(4)} ${selectedToken.symbol} for the gift. You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
                        return;
                    }
                    
                    // Calculate fees split
                    const feesInToken = Math.max(0, tokenBalanceForGift);
                    const feesInSOLAmount = totalFeeAmount - feesInToken;
                    
                    // Get SOL balance and price
                    const solBalance = await getSolBalance();
                    const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');
                    const feesInSOL = solPrice && solPrice > 0 ? feesInSOLAmount / solPrice : 0;
                    
                    if (solBalance < feesInSOL) {
                        // Not enough in either
                        setBalanceError(`Insufficient balance. You need ${amountValue.toFixed(4)} ${selectedToken.symbol} for the gift and $${totalFeesUSD.toFixed(2)} in fees. You have ${userBalance.toFixed(4)} ${selectedToken.symbol} and ${solBalance.toFixed(6)} SOL available, but need ${feesInToken.toFixed(4)} ${selectedToken.symbol} + ${feesInSOL.toFixed(6)} SOL for fees.`);
                        return;
                    }
                    
                    // Can use SOL fallback
                    setBalanceError(null);
                } else {
                    // Enough in token
                    setBalanceError(null);
                }
            }
        } catch (error) {
            console.error('Error validating balance:', error);
            // Don't set error on validation failure, just log it
        }
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
        
        // Calculate flat $1 service fee (convert to token amount)
        const FLAT_SERVICE_FEE_USD = 1.00;
        const serviceFeeAmount = tokenPrice && tokenPrice > 0 
            ? FLAT_SERVICE_FEE_USD / tokenPrice 
            : 0;
        
        if (!tokenPrice || tokenPrice <= 0) {
            setError('Unable to fetch token price. Please try again.');
            return;
        }
        
        // Calculate card fee ($1 if selected)
        const hasCard = !!selectedCard;
        const CARD_FEE_USD = 1.00;
        const cardFeeInTokens = hasCard && tokenPrice && tokenPrice > 0
            ? CARD_FEE_USD / tokenPrice
            : 0;
        
        // Total fees (service + card)
        const totalFeeAmount = serviceFeeAmount + cardFeeInTokens;
        const totalAmount = numericAmount + totalFeeAmount;
        
        // Check user balance (including fees)
        // First try to collect fees in the token being transferred
        let feesToCollectInToken = totalFeeAmount;
        let feesToCollectInSOL = 0;
        
        if (selectedToken.isNative) {
            // For native SOL, fees are also collected in SOL
            // Check if user has enough SOL for gift + fees
            if (totalAmount > userBalance) {
                setError(`Insufficient balance. You need ${totalAmount.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} gift + ${totalFeeAmount.toFixed(4)} ${selectedToken.symbol} fees). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
                return;
            }
            // For native SOL, fees are collected in SOL (already set above)
            feesToCollectInToken = totalFeeAmount;
            feesToCollectInSOL = 0;
        } else {
            // For SPL tokens, try to collect fees in token first, then fallback to SOL
            // Check if user has enough token balance for gift + fees
            if (totalAmount > userBalance) {
                // Not enough token balance - check if we can collect fees in SOL as fallback
                const tokenBalanceForGift = userBalance - numericAmount;
                if (tokenBalanceForGift < 0) {
                    // Not even enough for the gift itself
                    setError(`Insufficient ${selectedToken.symbol} balance. You need ${numericAmount.toFixed(4)} ${selectedToken.symbol} for the gift. You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
                    return;
                }
                
                // Calculate how much fee we can collect in token, rest in SOL
                feesToCollectInToken = Math.max(0, tokenBalanceForGift);
                feesToCollectInSOL = totalFeeAmount - feesToCollectInToken;
                
                // Get SOL balance and price to check if we can collect fees there
                const solBalance = await getSolBalance();
                const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');
                const feesInSOL = solPrice && solPrice > 0 ? feesToCollectInSOL / solPrice : 0;
                
                if (solBalance < feesInSOL) {
                    // Not enough in either token or SOL
                    setError(`Insufficient balance. You need ${numericAmount.toFixed(4)} ${selectedToken.symbol} for the gift and $${totalFeeAmount.toFixed(2)} in fees. You have ${userBalance.toFixed(4)} ${selectedToken.symbol} and ${solBalance.toFixed(6)} SOL available, but need ${feesToCollectInToken.toFixed(4)} ${selectedToken.symbol} + ${feesInSOL.toFixed(6)} SOL for fees.`);
                    return;
                }
                
                // We can collect fees in SOL - proceed
                console.log(`✅ Will collect fees: ${feesToCollectInToken.toFixed(4)} ${selectedToken.symbol} + ${feesInSOL.toFixed(6)} SOL`);
            } else {
                // Enough token balance for gift + fees
                feesToCollectInToken = totalFeeAmount;
                feesToCollectInSOL = 0;
            }
            
            // Still need SOL for network fees (transaction fees, not service fees)
            const solBalance = await getSolBalance();
            const BASE_FEE = 0.000005;
            const RENT_PER_ATA = 0.00203928;
            const estimatedRequiredSol = (BASE_FEE + RENT_PER_ATA) * 1.05; // Reduced buffer
            
            if (solBalance < estimatedRequiredSol) {
                setError(`Insufficient SOL for network transaction fees. You need approximately ${estimatedRequiredSol.toFixed(6)} SOL to pay for network fees and rent. You have ${solBalance.toFixed(6)} SOL available. Please add more SOL to your wallet.`);
                return;
            }
        }

        // Calculate USD values
        const usdValue = tokenPrice ? numericAmount * tokenPrice : null;
        const usdServiceFee = FLAT_SERVICE_FEE_USD;
        const usdCardFee = hasCard ? CARD_FEE_USD : 0;
        const usdTotalFees = usdServiceFee + usdCardFee;
        const usdTotal = tokenPrice ? (numericAmount * tokenPrice) + usdTotalFees : null;
        
        // Calculate remaining balance after transaction
        const remainingBalance = userBalance - numericAmount - feesToCollectInToken;
        const remainingBalanceUsd = tokenPrice ? remainingBalance * tokenPrice : null;
        
        // Show confirmation modal first
        setConfirmDetails({
            recipientLabel,
            recipientEmail: recipientEmailValue,
            amount: numericAmount,
            fee: serviceFeeAmount, // Service fee in tokens
            total: numericAmount + feesToCollectInToken, // Gift + fees collected in token
            token: selectedToken.symbol,
            tokenName: selectedToken.name,
            usdValue,
            usdFee: usdServiceFee, // $1 service fee
            usdTotal,
            remainingBalance,
            remainingBalanceUsd,
            message: message || '',
            cardFee: cardFeeInTokens, // Card fee in tokens
            cardFeeUsd: hasCard ? usdCardFee : null, // $1 card fee
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
        const recipientEmail = confirmDetails.recipientEmail;
        const recipientLabel = confirmDetails.recipientLabel;
        const message = confirmDetails.message;
        const tokenSymbol = confirmDetails.token;
        
        // Find the token from tokens array (must be done first)
        const currentToken = tokens.find(t => t.symbol === tokenSymbol) || selectedToken;
        if (!currentToken) {
            setError('Token not found. Please refresh the page.');
            setIsSending(false);
            return;
        }
        
        // Recalculate fees (same as in handleSendGift)
        const FLAT_SERVICE_FEE_USD = 1.00;
        const CARD_FEE_USD = confirmDetails.hasCard ? 1.00 : 0;
        const serviceFeeAmount = tokenPrice && tokenPrice > 0 ? FLAT_SERVICE_FEE_USD / tokenPrice : 0;
        const cardFeeAmount = confirmDetails.hasCard && tokenPrice && tokenPrice > 0 ? CARD_FEE_USD / tokenPrice : 0;
        const totalFeeAmount = serviceFeeAmount + cardFeeAmount;
        
        // Determine fee collection: token first, SOL fallback
        let feesToCollectInToken = totalFeeAmount;
        let feesToCollectInSOL = 0;
        
        if (currentToken.isNative) {
            // For native SOL, fees are in SOL
            feesToCollectInToken = totalFeeAmount;
            feesToCollectInSOL = 0;
        } else {
            // For SPL tokens, try token first, then SOL fallback
            if (userBalance < numericAmount + totalFeeAmount) {
                // Not enough token balance - check SOL fallback
                const tokenBalanceForGift = userBalance - numericAmount;
                if (tokenBalanceForGift < 0) {
                    // Not even enough for gift
                    throw new Error(`Insufficient ${currentToken.symbol} balance. You need ${numericAmount.toFixed(4)} ${currentToken.symbol} for the gift. You have ${userBalance.toFixed(4)} ${currentToken.symbol} available.`);
                }
                
                // Calculate fees split
                feesToCollectInToken = Math.max(0, tokenBalanceForGift);
                feesToCollectInSOL = totalFeeAmount - feesToCollectInToken;
                
                // Get SOL balance and price to verify we can collect fees there
                const solBalance = await getSolBalance();
                const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');
                const feesInSOL = solPrice && solPrice > 0 ? feesToCollectInSOL / solPrice : 0;
                
                if (solBalance < feesInSOL) {
                    // Not enough in either
                    throw new Error(`Insufficient balance. You need ${numericAmount.toFixed(4)} ${currentToken.symbol} for the gift and $${(FLAT_SERVICE_FEE_USD + CARD_FEE_USD).toFixed(2)} in fees. You have ${userBalance.toFixed(4)} ${currentToken.symbol} and ${solBalance.toFixed(6)} SOL available, but need ${feesToCollectInToken.toFixed(4)} ${currentToken.symbol} + ${feesInSOL.toFixed(6)} SOL for fees.`);
                }
                
                console.log(`✅ Will collect fees: ${feesToCollectInToken.toFixed(4)} ${currentToken.symbol} + ${feesInSOL.toFixed(6)} SOL`);
            } else {
                // Enough token balance for gift + fees
                feesToCollectInToken = totalFeeAmount;
                feesToCollectInSOL = 0;
            }
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
                
                // Add 5% buffer for safety (reduced from 10% to be less strict)
                estimatedRequiredSol *= 1.05;
                
                console.log('🔍 SOL Balance Check (Accurate):', {
                    solBalance: solBalance.toFixed(6),
                    estimatedRequired: estimatedRequiredSol.toFixed(6),
                    hasEnough: solBalance >= estimatedRequiredSol,
                    difference: (solBalance - estimatedRequiredSol).toFixed(6)
                });
                
                if (solBalance < estimatedRequiredSol) {
                    // Round up to 4 decimal places for user-friendly message
                    const requiredRounded = Math.ceil(estimatedRequiredSol * 10000) / 10000;
                    throw new Error(`Insufficient SOL for transaction fees. You need approximately ${requiredRounded.toFixed(4)} SOL to pay for transaction fees and rent. You have ${solBalance.toFixed(4)} SOL available. Please add more SOL to your wallet.`);
                }
            }

            // Step 3: Build transaction using @solana/web3.js (compatible with @solana/kit@3.0.0)
            console.log('📝 Step 3: Building transaction...');
            
            const isNative = currentToken.isNative || currentToken.mint === 'So11111111111111111111111111111111111111112';
            
            // Create transaction
            const transaction = new Transaction();
            
            // Add memo instruction to show total amount (for Privy modal display)
            const totalAmount = numericAmount + feesToCollectInToken; // Gift + fees collected in token
            // Calculate USD value for memo if price is available
            const memoUsdValue = tokenPrice ? numericAmount * tokenPrice : null;
            const memoText = memoUsdValue !== null
                ? `Gift: $${memoUsdValue.toFixed(3)} USD (${numericAmount.toFixed(6)} ${currentToken.symbol}) to ${recipientLabel}${cardFeeAmount > 0 ? ' + Card' : ''}`
                : `Gift: ${numericAmount.toFixed(6)} ${currentToken.symbol} to ${recipientLabel}${cardFeeAmount > 0 ? ' + Card' : ''}`;
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
                const serviceFeeLamports = Math.round(serviceFeeAmount * LAMPORTS_PER_SOL);
                const cardFeeLamports = Math.round(cardFeeAmount * LAMPORTS_PER_SOL);
                const totalFeeLamports = serviceFeeLamports + cardFeeLamports;
                
                console.log(`💰 Transaction breakdown (SOL):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountLamports} lamports)`);
                console.log(`  Service fee: $1.00 = ${serviceFeeAmount.toFixed(6)} ${currentToken.symbol} (${serviceFeeLamports} lamports)`);
                if (cardFeeAmount > 0) {
                    console.log(`  Card fee: $1.00 = ${cardFeeAmount.toFixed(6)} ${currentToken.symbol} (${cardFeeLamports} lamports)`);
                }
                console.log(`  Total fees: ${totalFeeAmount.toFixed(6)} ${currentToken.symbol} (${totalFeeLamports} lamports)`);
                console.log(`  Total: ${numericAmount + totalFeeAmount} ${currentToken.symbol} (${giftAmountLamports + totalFeeLamports} lamports)`);
                
                // Add gift amount transfer to TipLink
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: senderPubkey,
                        toPubkey: tipLinkPubkey,
                        lamports: giftAmountLamports,
                    })
                );
                
                // Add fee transfer to fee wallet if configured (service fee + card fee)
                if (feeWalletAddress && totalFeeLamports > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress} (service + card fees)`);
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: senderPubkey,
                            toPubkey: new PublicKey(feeWalletAddress),
                            lamports: totalFeeLamports,
                        })
                    );
                } else if (totalFeeLamports > 0) {
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
                const serviceFeeRaw = Math.round(serviceFeeAmount * Math.pow(10, decimals));
                const cardFeeRaw = Math.round(cardFeeAmount * Math.pow(10, decimals));
                const totalFeesRaw = serviceFeeRaw + cardFeeRaw;
                const feesInTokenRaw = Math.round(feesToCollectInToken * Math.pow(10, decimals));
                
                console.log(`💰 Transaction breakdown (SPL Token):`);
                console.log(`  Gift amount: ${numericAmount} ${currentToken.symbol} (${giftAmountRaw} raw units)`);
                console.log(`  Service fee: $1.00 = ${serviceFeeAmount.toFixed(6)} ${currentToken.symbol} (${serviceFeeRaw} raw units)`);
                if (cardFeeAmount > 0) {
                    console.log(`  Card fee: $1.00 = ${cardFeeAmount.toFixed(6)} ${currentToken.symbol} (${cardFeeRaw} raw units)`);
                }
                console.log(`  Total fees: ${totalFeeAmount.toFixed(6)} ${currentToken.symbol} (${totalFeesRaw} raw units)`);
                console.log(`  Fees in token: ${feesToCollectInToken.toFixed(6)} ${currentToken.symbol} (${feesInTokenRaw} raw units)`);
                if (feesToCollectInSOL > 0) {
                    console.log(`  Fees in SOL (fallback): ${feesToCollectInSOL.toFixed(6)} ${currentToken.symbol}`);
                }
                console.log(`  Total: ${numericAmount + totalFeeAmount} ${currentToken.symbol} (${giftAmountRaw + totalFeesRaw} raw units)`);
                
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
                    
                    // Check if user has enough for gift + fees (or at least gift if fees will be collected in SOL)
                    const requiredInToken = giftAmountRaw + feesInTokenRaw;
                    if (senderAccount.amount < BigInt(requiredInToken)) {
                        const available = Number(senderAccount.amount) / Math.pow(10, decimals);
                        if (senderAccount.amount < BigInt(giftAmountRaw)) {
                            throw new Error(`Insufficient ${currentToken.symbol} balance. Required: ${numericAmount} ${currentToken.symbol} for gift. Available: ${available.toFixed(6)} ${currentToken.symbol}`);
                        }
                        // If we have enough for gift but not fees, fees will be collected in SOL
                        console.log(`⚠️ Not enough ${currentToken.symbol} for fees, will collect fees in SOL`);
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
                
                // Add fee transfer to fee wallet if configured (service fee + card fee, collected in token)
                if (feeWalletAddress && feesToCollectInToken > 0) {
                    console.log(`💼 Adding fee transfer to fee wallet: ${feeWalletAddress} (service + card fees in ${currentToken.symbol})`);
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
                            BigInt(feesInTokenRaw), // amount (service + card fees)
                            [], // multiSigners
                            TOKEN_PROGRAM_ID
                        )
                    );
                } else if (feesToCollectInToken > 0) {
                    console.warn('⚠️ Fee wallet not configured. Fee will not be collected.');
                }
                
                // If fees need to be collected in SOL (fallback), add SOL transfer
                if (feesToCollectInSOL > 0 && feeWalletAddress) {
                    const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');
                    const feesInSOL = solPrice && solPrice > 0 ? feesToCollectInSOL / solPrice : 0;
                    const feesInSOLlamports = Math.round(feesInSOL * LAMPORTS_PER_SOL);
                    console.log(`💼 Adding SOL fee transfer to fee wallet: ${feeWalletAddress} (${feesInSOL.toFixed(6)} SOL for fees)`);
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: senderPubkey,
                            toPubkey: new PublicKey(feeWalletAddress),
                            lamports: feesInSOLlamports,
                        })
                    );
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
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: 'USD',
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        }).format(value);
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 animate-fade-in-up pb-24">
            {/* Confirmation Modal */}
            {showConfirmModal && confirmDetails && (
                <div className="fixed inset-0 bg-[#0B1120]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <GlassCard className="max-w-md w-full animate-scale-in relative">
                        {/* Loading Overlay */}
                        {isSending && (
                            <div className="absolute inset-0 bg-[#0B1120]/95 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center z-10">
                                <Spinner size="8" color="border-[#06B6D4]" />
                                <p className="text-white font-medium mt-4 text-lg">Processing Transaction...</p>
                                <p className="text-[#94A3B8] text-sm mt-2">Please wait while we sign and send your gift</p>
                            </div>
                        )}
                        
                        <h2 className="text-2xl font-bold text-white mb-4 text-center">Confirm Gift</h2>
                        
                        <div className="space-y-4 mb-6">
                            <div className="bg-[#0F172A]/30 rounded-lg p-4 space-y-3 border border-white/5">
                                {/* Recipient */}
                                <div className="pb-3 border-b border-white/5">
                                    <p className="text-[#94A3B8] text-xs mb-1">Recipient</p>
                                    <p className="text-white font-mono text-sm break-all">{confirmDetails.recipientLabel}</p>
                                </div>
                                
                                {/* Amount */}
                                <div className="pb-3 border-b border-white/5">
                                    <p className="text-[#94A3B8] text-xs mb-1">Amount</p>
                                    {confirmDetails.usdValue !== null ? (
                                        <p className="text-white font-bold text-xl">${confirmDetails.usdValue.toFixed(3)} USD</p>
                                    ) : (
                                        <p className="text-white font-bold text-xl">{confirmDetails.amount.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                    {confirmDetails.usdValue !== null && (
                                        <p className="text-[#94A3B8] text-xs mt-1">{confirmDetails.amount.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                </div>
                                
                                {/* Service Fee */}
                                <div className="pb-3 border-b border-white/5">
                                    <p className="text-[#94A3B8] text-xs mb-1">Service Fee</p>
                                    <p className="text-[#94A3B8] font-medium">$1.00 USD</p>
                                </div>
                                
                                {/* Greeting Card - $1 if selected */}
                                {confirmDetails.hasCard && (
                                    <div className="pb-3 border-b border-white/5">
                                        <p className="text-[#94A3B8] text-xs mb-1">Greeting Card</p>
                                        <p className="text-[#94A3B8] font-medium">$1.00 USD</p>
                                    </div>
                                )}
                                
                                {/* Total */}
                                <div>
                                    <p className="text-[#94A3B8] text-xs mb-1">Total</p>
                                    {confirmDetails.usdTotal !== null ? (
                                        <p className="text-white font-medium">${confirmDetails.usdTotal.toFixed(3)} USD</p>
                                    ) : (
                                        <p className="text-white font-medium">{confirmDetails.total.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                </div>
                                
                                {/* Remaining balance */}
                                <div>
                                    <p className="text-[#94A3B8] text-xs mb-1">What's left in your wallet</p>
                                    {confirmDetails.remainingBalanceUsd !== null ? (
                                        <>
                                            <p className="text-white font-medium">${confirmDetails.remainingBalanceUsd.toFixed(3)} USD</p>
                                            <p className="text-[#94A3B8] text-xs mt-1">{confirmDetails.remainingBalance.toFixed(6)} {confirmDetails.token}</p>
                                        </>
                                    ) : (
                                        <p className="text-white font-medium">{confirmDetails.remainingBalance.toFixed(6)} {confirmDetails.token}</p>
                                    )}
                                </div>
                            </div>
                            
                            {confirmDetails.message && (
                                <div className="bg-[#0F172A]/30 rounded-lg p-4 border border-white/5">
                                    <p className="text-[#94A3B8] text-sm mb-1">Message:</p>
                                    <p className="text-white text-sm italic">"{confirmDetails.message}"</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-3">
                            <GlowButton
                                variant="secondary"
                                fullWidth
                                onClick={() => {
                                    if (!isSending) {
                                        setShowConfirmModal(false);
                                        setConfirmDetails(null);
                                    }
                                }}
                                disabled={isSending}
                            >
                                Cancel
                            </GlowButton>
                            <GlowButton
                                variant="cyan"
                                fullWidth
                                onClick={handleConfirmSend}
                                disabled={isSending}
                            >
                                {isSending ? 'Sending...' : 'Confirm & Send Gift'}
                            </GlowButton>
                        </div>
                    </GlassCard>
                </div>
            )}
            
            {/* Success Modal */}
            {showSuccessModal && giftDetails && (
                <div className="fixed inset-0 bg-[#0B1120]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <GlassCard className="max-w-lg w-full animate-scale-in">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-[#064E3B]/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#10B981]/20">
                                <Check size={32} className="text-[#10B981]" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Gift Sent!</h2>
                            <p className="text-[#94A3B8] mb-8">Your gift has been sent successfully</p>
                        </div>

                        {/* Gift Details */}
                        <div className="bg-[#0F172A]/30 rounded-lg p-4 mb-6 border border-white/5">
                            <p className="text-3xl font-bold text-white text-center mb-2">
                                {giftDetails.usdValue !== null ? (
                                    `$${giftDetails.usdValue.toFixed(3)}`
                                ) : (
                                    `${parseFloat(giftDetails.amount).toFixed(3)} ${giftDetails.token}`
                                )}
                            </p>
                            {giftDetails.usdValue !== null && (
                                <p className="text-[#94A3B8] text-sm text-center">{parseFloat(giftDetails.amount).toFixed(3)} {giftDetails.token}</p>
                            )}
                            <p className="text-[#94A3B8] text-sm text-center mt-2">To: {giftDetails.recipient}</p>
                        </div>

                        {/* QR Code */}
                        <div className="bg-white p-4 rounded-2xl inline-block mx-auto mb-6">
                            <img src={giftDetails.qrCode} alt="Gift QR Code" className="w-48 h-48" />
                        </div>

                        {/* Gift Link */}
                        <div className="mb-6">
                            <label className="block text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Gift Link</label>
                            <div className="bg-[#0F172A] p-4 rounded-xl flex items-center justify-between border border-white/10">
                                <span className="text-[#FCD34D] text-sm truncate mr-4 font-mono">{giftDetails.claim_url}</span>
                                <GlowButton
                                    variant="secondary"
                                    className="!py-2 !px-4 !text-xs flex-shrink-0"
                                    onClick={() => copyToClipboard(giftDetails.claim_url)}
                                    icon={Copy}
                                >
                                    Copy
                                </GlowButton>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3">
                            <GlowButton
                                variant="cyan"
                                fullWidth
                                icon={Mail}
                                onClick={() => {
                                    const subject = encodeURIComponent('You received a crypto gift!');
                                    const body = encodeURIComponent(`You've received a gift! Claim it here: ${giftDetails.claim_url}`);
                                    window.open(`mailto:?subject=${subject}&body=${body}`);
                                }}
                            >
                                Send via Email
                            </GlowButton>
                            <a
                                href={`https://solscan.io/tx/${giftDetails.signature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full"
                            >
                                <GlowButton
                                    variant="secondary"
                                    fullWidth
                                    icon={ArrowUpRight}
                                >
                                    View Transaction
                                </GlowButton>
                            </a>
                            <GlowButton
                                variant="primary"
                                fullWidth
                                onClick={() => {
                                    setShowSuccessModal(false);
                                    setGiftDetails(null);
                                    navigate('/');
                                }}
                            >
                                Done
                            </GlowButton>
                        </div>
                    </GlassCard>
                </div>
            )}

            <button 
                onClick={() => navigate(-1)} 
                className="flex items-center gap-2 text-[#94A3B8] hover:text-white mb-8 transition-colors"
            >
                <ChevronLeft size={20} />
                <span>Back</span>
            </button>
            
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-3">
                    Send a Gift <Gift className="text-[#BE123C]" />
                </h1>
            </div>
            
            <GlassCard glow className="p-0 space-y-8">

                {showFormSkeleton ? (
                    <div className="p-8">
                        <GiftFormSkeleton />
                    </div>
                ) : (
                    <>
                        {/* Balance Header Section */}
                        <div className="p-8 bg-gradient-to-r from-[#1E293B] to-[#0F172A] border-b border-white/5">
                            <span className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Your Balance</span>
                            {tokenPrice && tokenPrice > 0 ? (
                                <>
                                    <h2 className="text-3xl font-bold text-white mt-2">{formatCurrency(userBalance * tokenPrice)}</h2>
                                    <p className="text-xs text-[#94A3B8] mt-1">
                                        {userBalance.toFixed(4)} {selectedToken?.symbol || 'SOL'}
                                    </p>
                                </>
                            ) : (
                                <h2 className="text-3xl font-bold text-white mt-2">
                                    {userBalance.toFixed(4)} {selectedToken?.symbol || 'SOL'}
                                </h2>
                            )}
                            <p className="text-xs text-[#94A3B8] mt-1">Available for gifting</p>
                            {userBalance < 0.01 && (
                                <div className="mt-4 flex items-center gap-3 bg-[#7F1D1D]/20 border border-[#EF4444]/20 p-3 rounded-lg">
                                    <AlertTriangle size={16} className="text-[#EF4444] shrink-0" />
                                    <p className="text-xs text-[#FCD34D]">
                                        Low balance. Add SOL to your wallet in the 'Add Funds' page.
                                    </p>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSendGift} className="p-8 space-y-8">
                    {/* Token Selector */}
                    <div>
                        <label htmlFor="token" className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1 mb-2 block">
                            Token
                        </label>
                        <div className="relative">
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
                                className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none appearance-none focus:border-[#BE123C] focus:ring-4 focus:ring-[#BE123C]/10 transition"
                            >
                                {tokens.map(token => (
                                    <option key={token.mint} value={token.mint}>
                                        {token.symbol} - {token.name}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#94A3B8]">▼</div>
                        </div>
                    </div>

                    {/* Recipient (Email or Username) */}
                    <div>
                        <InputField
                            label="Recipient Email / @Username"
                            placeholder="recipient@example.com or @username"
                            value={recipientInput}
                            onChange={(e) => setRecipientInput(e.target.value)}
                            required
                            icon={Mail}
                        />
                        <div className="mt-2 text-sm">
                            {recipientError && (
                                <p className="text-[#EF4444]">{recipientError}</p>
                            )}
                            {isUsernameRecipient ? (
                                <>
                                    {resolvingRecipient && (
                                        <p className="text-[#94A3B8]">Resolving username...</p>
                                    )}
                                    {!resolvingRecipient && resolvedRecipient && (
                                        <p className="text-[#10B981]">✓ Username linked to {resolvedRecipient.email}</p>
                                    )}
                                </>
                            ) : (
                                trimmedRecipient && (
                                    <p className="text-[#94A3B8]">Gift will be sent to {trimmedRecipient}</p>
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
                        <label htmlFor="amount" className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1 mb-2 block">
                            Amount
                        </label>
                        
                        {/* Mode Toggle */}
                        <div className="grid grid-cols-2 gap-0 bg-[#0F172A] p-1 rounded-xl mb-4 border border-white/10">
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('token')}
                                className={`py-3 text-sm font-bold rounded-lg transition-all ${
                                    amountMode === 'token'
                                        ? 'bg-[#1E293B] text-white shadow-lg border border-white/10'
                                        : 'text-[#64748B] hover:text-[#94A3B8]'
                                }`}
                            >
                                Token Amount
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('usd')}
                                disabled={!tokenPrice || priceLoading}
                                className={`py-3 text-sm font-bold rounded-lg transition-all ${
                                    amountMode === 'usd'
                                        ? 'bg-[#06B6D4] text-white shadow-lg border border-white/10'
                                        : 'text-[#64748B] hover:text-[#94A3B8]'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                USD Amount
                            </button>
                        </div>
                        
                        {/* Amount Input */}
                        {amountMode === 'token' ? (
                            <InputField
                                type="number"
                                id="amount"
                                value={tokenAmount}
                                onChange={async (e) => {
                                    const value = e.target.value;
                                    setTokenAmount(value);
                                    setAmount(value); // Keep existing amount state for compatibility
                                    setBalanceError(null); // Clear previous error
                                    
                                    // Validate balance in real-time
                                    const numValue = parseFloat(value);
                                    if (!isNaN(numValue) && numValue > 0) {
                                        await validateBalance(numValue);
                                    }
                                }}
                                required
                                min="0"
                                step="0.000001"
                                placeholder="0.00"
                                rightElement={<span className="text-[#94A3B8]">{selectedToken?.symbol}</span>}
                            />
                        ) : (
                            <InputField
                                type="number"
                                id="amount"
                                value={usdAmount}
                                onChange={async (e) => {
                                    const value = e.target.value;
                                    setUsdAmount(value);
                                    // Calculate token amount but don't update amount state until submission
                                    if (tokenPrice) {
                                        const calculatedTokenAmount = (parseFloat(value) / tokenPrice).toString();
                                        setTokenAmount(calculatedTokenAmount);
                                        setAmount(calculatedTokenAmount);
                                        
                                        // Validate balance in real-time
                                        const numValue = parseFloat(calculatedTokenAmount);
                                        if (!isNaN(numValue) && numValue > 0) {
                                            await validateBalance(numValue);
                                        }
                                    }
                                    setBalanceError(null); // Clear previous error
                                }}
                                required
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                rightElement={<span className="text-[#94A3B8]">$</span>}
                            />
                        )}
                        
                        {/* Conversion Preview */}
                        {tokenPrice && (
                            <div className="mt-2 text-sm text-[#94A3B8]">
                                {amountMode === 'token' && tokenAmount && !isNaN(parseFloat(tokenAmount)) ? (
                                    <span>≈ ${(parseFloat(tokenAmount) * tokenPrice).toFixed(2)} USD</span>
                                ) : amountMode === 'usd' && usdAmount && !isNaN(parseFloat(usdAmount)) ? (
                                    <span>≈ {(parseFloat(usdAmount) / tokenPrice).toFixed(6)} {selectedToken?.symbol}</span>
                                ) : null}
                            </div>
                        )}
                        
                        {/* Price Status */}
                        {priceLastUpdated && (
                            <div className="mt-1 text-xs text-[#94A3B8]">
                                Price updated {Math.floor((Date.now() - priceLastUpdated) / 1000)}s ago
                            </div>
                        )}
                        
                        {/* Price Error */}
                        {priceError && (
                            <div className="mt-2 text-xs text-[#FCD34D]">
                                {priceError}
                            </div>
                        )}
                        
                        {/* Balance Error */}
                        {balanceError && (
                            <div className="mt-2 text-xs text-[#EF4444]">
                                {balanceError}
                            </div>
                        )}
                        
                        {/* Loading Indicator */}
                        {priceLoading && (
                            <div className="mt-2 text-xs text-[#94A3B8]">
                                Loading price...
                            </div>
                        )}
                        
                        {/* Available Balance Info */}
                        {selectedToken?.isNative && (
                            <p className="text-xs text-[#94A3B8] mt-2">
                                Available: {userBalance.toFixed(4)} {selectedToken.symbol}
                            </p>
                        )}
                        
                        {/* Fee Breakdown */}
                        {((amountMode === 'token' && tokenAmount) || (amountMode === 'usd' && usdAmount)) && 
                         !isNaN(parseFloat(amountMode === 'token' ? tokenAmount : (usdAmount && tokenPrice ? (parseFloat(usdAmount) / tokenPrice).toString() : '0'))) && 
                         parseFloat(amountMode === 'token' ? tokenAmount : (usdAmount && tokenPrice ? (parseFloat(usdAmount) / tokenPrice).toString() : '0')) > 0 && 
                         (() => {
                            const tokenAmountValue = amountMode === 'token' 
                                ? parseFloat(tokenAmount) 
                                : (usdAmount && tokenPrice ? parseFloat(usdAmount) / tokenPrice : 0);
                            
                            // Flat $1 service fee + $1 card fee
                            const FLAT_SERVICE_FEE_USD = 1.00;
                            const CARD_FEE_USD = selectedCard ? 1.00 : 0;
                            const serviceFeeInTokens = tokenPrice && tokenPrice > 0 ? FLAT_SERVICE_FEE_USD / tokenPrice : 0;
                            const cardFeeInTokens = selectedCard && tokenPrice && tokenPrice > 0 ? CARD_FEE_USD / tokenPrice : 0;
                            const totalFeesInTokens = serviceFeeInTokens + cardFeeInTokens;
                            const tokenTotal = tokenAmountValue + totalFeesInTokens;
                            
                            // Calculate USD values
                            const usdAmountValue = amountMode === 'usd' && tokenPrice
                                ? parseFloat(usdAmount)
                                : (amountMode === 'token' && tokenPrice ? parseFloat(tokenAmount) * tokenPrice : 0);
                            const usdTotalFees = FLAT_SERVICE_FEE_USD + CARD_FEE_USD;
                            const usdTotal = usdAmountValue + usdTotalFees;
                            
                            return (
                                <div className="mt-3 p-3 bg-[#0F172A]/30 border border-white/5 rounded-lg">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-[#94A3B8]">Gift Amount:</span>
                                        <span className="text-white">
                                            {amountMode === 'usd' && tokenPrice
                                                ? `$${usdAmountValue.toFixed(3)}`
                                                : `${tokenAmountValue.toFixed(6)} ${selectedToken?.symbol}`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-[#94A3B8]">Service Fee:</span>
                                        <span className="text-[#94A3B8]">$1.00 USD</span>
                                    </div>
                                    {selectedCard && (
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-[#94A3B8]">Greeting Card (add-on):</span>
                                            <span className="text-[#06B6D4]">$1.00 USD</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                                        <span className="text-white font-medium">Total:</span>
                                        <span className="text-white font-medium">
                                            {amountMode === 'usd' && tokenPrice
                                                ? `$${usdTotal.toFixed(3)}`
                                                : `${tokenTotal.toFixed(6)} ${selectedToken?.symbol}`}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#64748B] mt-2">Network fees (SOL) are paid separately</p>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Message */}
                    <div>
                        <label htmlFor="message" className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] ml-1 mb-2 block">
                            Message (Optional)
                        </label>
                        <textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Add a personal message..."
                            className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-4 py-3.5 outline-none text-white placeholder:text-[#475569] focus:border-[#BE123C] focus:ring-4 focus:ring-[#BE123C]/10 transition-all resize-none min-h-[100px]"
                        />
                    </div>

                    {error && (
                        <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-3">
                            <p className="text-[#EF4444] text-sm">{error}</p>
                        </div>
                    )}
                    
                    {successMessage && (
                        <div className="bg-[#064E3B]/20 border border-[#10B981]/20 rounded-lg p-3">
                            <p className="text-[#10B981] text-sm">{successMessage}</p>
                        </div>
                    )}

                    <GlowButton
                        type="submit"
                        fullWidth
                        variant="cyan"
                        icon={Gift}
                        disabled={isSending || !user || userBalance < 0.001}
                    >
                        {isSending ? (
                            <>
                                <Spinner size="6" color="border-white" />
                                <span className="ml-3">Sending Gift...</span>
                            </>
                        ) : (
                            'Send Gift'
                        )}
                    </GlowButton>
                        </form>
                    </>
                )}
            </GlassCard>
        </div>
    );
};

const GiftFormSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-xl bg-[#1E293B]/40 border border-white/10" />
        {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-xl bg-[#1E293B]/40 border border-white/10" />
        ))}
        <div className="h-12 rounded-xl bg-[#1E293B]/40 border border-white/10" />
    </div>
);

const CardUpsellFallback: React.FC = () => (
    <div className="h-48 rounded-2xl border border-white/10 bg-[#1E293B]/40 animate-pulse" />
);

export default GiftPage;
