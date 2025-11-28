import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { heliusService, feeService, priceService, withdrawalService } from '../services/api';
import { TokenBalance, Token } from '../types';
import { motion } from 'framer-motion';
import Spinner from '../components/Spinner';
import { Building, ArrowUpRight, ChevronLeft, Check, Shield, AlertTriangle } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import InputField from '../components/UI/InputField';
import TokenPicker from '../components/UI/TokenPicker';
import QuickAmountChips from '../components/UI/QuickAmountChips';
import WithdrawReviewStep from '../components/UI/WithdrawReviewStep';
import PageHeader from '../components/UI/PageHeader';
import { useToast } from '../components/UI/ToastContainer';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
import bs58 from 'bs58';

const WithdrawPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { ready, authenticated, user: privyUser } = usePrivy();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets, ready: walletsReady } = useWallets();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'bank' | 'wallet' | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  // Wallet withdrawal state
  const [tokens, setTokens] = useState<Array<{ mint: string; symbol: string; name: string; decimals: number; isNative: boolean }>>([]);
  const [selectedToken, setSelectedToken] = useState<{ mint: string; symbol: string; name: string; decimals: number; isNative: boolean } | null>(null);
  const [walletBalances, setWalletBalances] = useState<TokenBalance[]>([]);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [withdrawalAddress, setWithdrawalAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [amountMode, setAmountMode] = useState<'token' | 'usd'>('usd');
  const [usdAmount, setUsdAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [feeWalletAddress, setFeeWalletAddress] = useState<string | null>(null);
  const [feePercentage, setFeePercentage] = useState<number>(0.001); // 0.1%
  const [walletReady, setWalletReady] = useState(false);
  
  // Address book (localStorage)
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [selectedQuickAmount, setSelectedQuickAmount] = useState<string | null>(null);

  useEffect(() => {
    // Load saved addresses from localStorage
    const saved = localStorage.getItem('withdraw_saved_addresses');
    if (saved) {
      try {
        setSavedAddresses(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved addresses:', e);
      }
    }
  }, []);

  const saveAddress = (address: string) => {
    if (!savedAddresses.includes(address)) {
      const updated = [...savedAddresses, address];
      setSavedAddresses(updated);
      localStorage.setItem('withdraw_saved_addresses', JSON.stringify(updated));
    }
  };

  // Monitor wallets array for changes
  useEffect(() => {
    if (walletsReady && wallets.length > 0) {
      const solanaWallet = wallets.find(w => {
        const isSolanaAddress = w.address && !w.address.startsWith('0x');
        return isSolanaAddress;
      });
      if (solanaWallet) {
        setWalletReady(true);
      }
    } else if (privyUser?.wallet && privyUser.wallet.chainType === 'solana') {
      setWalletReady(true);
    }
  }, [wallets, walletsReady, privyUser]);

  useEffect(() => {
    const fetchTokensAndBalances = async () => {
      if (!user?.wallet_address) return;
      setIsLoadingTokens(true);
      try {
        const balances = await heliusService.getTokenBalances(user.wallet_address);
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
      } catch (e) {
        setError('Failed to fetch tokens and balances.');
        console.error(e);
      } finally {
        setIsLoadingTokens(false);
      }
    };
    fetchTokensAndBalances();
  }, [user]);

  useEffect(() => {
    if (selectedToken && walletBalances.length > 0) {
      const tokenBalance = walletBalances.find(b => b.symbol === selectedToken.symbol);
      setUserBalance(tokenBalance?.balance || 0);
    }
    
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
      } catch (e) {
        console.error('Failed to fetch fee config:', e);
      }
    };
    fetchFeeConfig();
  }, []);

  const fetchTokenPrice = async (mintAddress: string) => {
    setPriceLoading(true);
    try {
      const response = await priceService.getTokenPrice(mintAddress);
      if (response.price) {
        setTokenPrice(response.price);
      }
    } catch (error) {
      console.error('Failed to fetch token price:', error);
      setTokenPrice(null);
    } finally {
      setPriceLoading(false);
    }
  };

  const validateSolanaAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddressChange = (value: string) => {
    setWithdrawalAddress(value);
    setAddressError(null);
    
    if (value.trim() === '') {
      return;
    }
    
    if (!validateSolanaAddress(value.trim())) {
      setAddressError('Invalid Solana address. Please enter a valid Solana or SPL token address.');
    }
  };

  const handleModeSwitch = (newMode: 'token' | 'usd') => {
    if (!tokenPrice && newMode === 'usd') {
      setError('Price unavailable - cannot switch to USD mode');
      return;
    }
    
    if (newMode === 'usd' && tokenAmount) {
      const usd = (parseFloat(tokenAmount) * tokenPrice!).toFixed(2);
      setUsdAmount(usd);
    } else if (newMode === 'token' && usdAmount) {
      const tokens = (parseFloat(usdAmount) / tokenPrice!).toFixed(6);
      setTokenAmount(tokens);
    }
    
    setAmountMode(newMode);
  };

  // Step navigation
  const handleNextStep = () => {
    if (currentStep < 4) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      setCurrentStep((currentStep + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleStepClick = (step: number) => {
    if (completedSteps.includes(step)) {
      setCurrentStep(step as 1 | 2 | 3 | 4);
    }
  };

  // Step validation
  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return selectedToken !== null;
      case 2:
        const numericAmount = amountMode === 'usd' && tokenPrice
          ? parseFloat(usdAmount) / tokenPrice
          : parseFloat(tokenAmount);
        return !isNaN(numericAmount) && numericAmount > 0 && numericAmount <= userBalance;
      case 3:
        return withdrawalAddress.trim() !== '' && !addressError && validateSolanaAddress(withdrawalAddress.trim());
      default:
        return false;
    }
  };

  const handleWithdraw = async () => {
    if (!user || !ready || !authenticated || !user.wallet_address || !walletReady) {
      showToast({
        type: 'error',
        message: "Please ensure you're logged in and wallet is ready.",
      });
      return;
    }

    if (!selectedToken || !withdrawalAddress.trim()) {
      showToast({
        type: 'error',
        message: "Please fill in all required fields.",
      });
      return;
    }

    if (addressError || !validateSolanaAddress(withdrawalAddress.trim())) {
      showToast({
        type: 'error',
        message: "Please enter a valid Solana address.",
      });
      return;
    }

    const numericAmount = amountMode === 'usd' && tokenPrice
      ? parseFloat(usdAmount) / tokenPrice
      : parseFloat(tokenAmount);
      
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showToast({
        type: 'error',
        message: "Please enter a valid amount.",
      });
      return;
    }
    
    // Calculate fee (0.1% of withdrawal amount)
    const feeAmount = numericAmount * feePercentage;
    const totalAmount = numericAmount + feeAmount;
    
    // Check user balance (including fee)
    if (totalAmount > userBalance) {
      showToast({
        type: 'error',
        message: `Insufficient balance. You need ${totalAmount.toFixed(4)} ${selectedToken.symbol}.`,
      });
      return;
    }
    
    // For SPL tokens, check SOL balance for fees
    if (!selectedToken.isNative) {
      const solBalance = walletBalances.find(b => b.symbol === 'SOL')?.balance || 0;
      const MIN_SOL_FOR_FEES = 0.01;
      if (solBalance < MIN_SOL_FOR_FEES) {
        showToast({
          type: 'error',
          message: `Insufficient SOL for transaction fees. You need at least ${MIN_SOL_FOR_FEES} SOL.`,
        });
        return;
      }
    }

    // Save address to address book
    saveAddress(withdrawalAddress.trim());

    await handleConfirmWithdraw(numericAmount, feeAmount, totalAmount);
  };

  const handleConfirmWithdraw = async (numericAmount?: number, feeAmount?: number, totalAmount?: number) => {
    if (!selectedToken) return;
    
    const finalAmount = numericAmount || (amountMode === 'usd' && tokenPrice
      ? parseFloat(usdAmount) / tokenPrice
      : parseFloat(tokenAmount));
    const finalFee = feeAmount || (finalAmount * feePercentage);
    const finalTotal = totalAmount || (finalAmount + finalFee);
    const recipientAddress = withdrawalAddress.trim();
    
    setIsWithdrawing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!walletsReady) {
        throw new Error('Wallets are not ready yet. Please wait a moment and try again.');
      }

      const embeddedWallet = wallets.find(
        (w) => w.standardWallet?.name === 'Privy'
      );

      if (!embeddedWallet) {
        throw new Error('No Privy embedded wallet found.');
      }

      const transaction = new Transaction();
      const senderPubkey = new PublicKey(embeddedWallet.address);
      const recipientPubkey = new PublicKey(recipientAddress);
      
      const isNative = selectedToken.isNative || selectedToken.mint === 'So11111111111111111111111111111111111111112';
      
      if (isNative) {
        // Native SOL transfer
        const withdrawalAmountLamports = Math.round(finalAmount * LAMPORTS_PER_SOL);
        const feeAmountLamports = Math.round(finalFee * LAMPORTS_PER_SOL);
        
        // Add withdrawal amount transfer
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: recipientPubkey,
            lamports: withdrawalAmountLamports,
          })
        );
        
        // Add fee transfer to fee wallet if configured
        if (feeWalletAddress && feeAmountLamports > 0) {
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: senderPubkey,
              toPubkey: new PublicKey(feeWalletAddress),
              lamports: feeAmountLamports,
            })
          );
        }
      } else {
        // SPL Token transfer
        const splToken = await import('@solana/spl-token');
        const {
          getAssociatedTokenAddress,
          createTransferInstruction,
          createAssociatedTokenAccountInstruction,
          TOKEN_PROGRAM_ID,
          getAccount
        } = splToken;
        
        const mintPubkey = new PublicKey(selectedToken.mint);
        const decimals = selectedToken.decimals || 9;
        
        const withdrawalAmountRaw = Math.round(finalAmount * Math.pow(10, decimals));
        const feeAmountRaw = Math.round(finalFee * Math.pow(10, decimals));
        
        // Get associated token addresses
        const senderATA = await getAssociatedTokenAddress(
          mintPubkey,
          senderPubkey,
          false,
          TOKEN_PROGRAM_ID
        );
        
        const recipientATA = await getAssociatedTokenAddress(
          mintPubkey,
          recipientPubkey,
          true,
          TOKEN_PROGRAM_ID
        );
        
        // Check sender balance
        try {
          const senderAccount = await getAccount(connection, senderATA);
          if (senderAccount.amount < BigInt(withdrawalAmountRaw + feeAmountRaw)) {
            throw new Error(`Insufficient ${selectedToken.symbol} balance.`);
          }
        } catch (error: any) {
          if (error.name === 'TokenAccountNotFoundError') {
            throw new Error(`No ${selectedToken.symbol} token account found.`);
          }
          throw error;
        }
        
        // Check if recipient ATA exists, create if not
        try {
          await getAccount(connection, recipientATA);
        } catch (error: any) {
          if (error.name === 'TokenAccountNotFoundError') {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                senderPubkey,
                recipientATA,
                recipientPubkey,
                mintPubkey,
                TOKEN_PROGRAM_ID
              )
            );
          } else {
            throw error;
          }
        }
        
        // Add withdrawal amount transfer
        transaction.add(
          createTransferInstruction(
            senderATA,
            recipientATA,
            senderPubkey,
            BigInt(withdrawalAmountRaw),
            [],
            TOKEN_PROGRAM_ID
          )
        );
        
        // Add fee transfer to fee wallet if configured
        if (feeWalletAddress && feeAmountRaw > 0) {
          const feeWalletPubkey = new PublicKey(feeWalletAddress);
          const feeWalletATA = await getAssociatedTokenAddress(
            mintPubkey,
            feeWalletPubkey,
            true,
            TOKEN_PROGRAM_ID
          );
          
          try {
            await getAccount(connection, feeWalletATA);
          } catch (error: any) {
            if (error.name === 'TokenAccountNotFoundError') {
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  senderPubkey,
                  feeWalletATA,
                  feeWalletPubkey,
                  mintPubkey,
                  TOKEN_PROGRAM_ID
                )
              );
            } else {
              throw error;
            }
          }
          
          transaction.add(
            createTransferInstruction(
              senderATA,
              feeWalletATA,
              senderPubkey,
              BigInt(feeAmountRaw),
              [],
              TOKEN_PROGRAM_ID
            )
          );
        }
      }

      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(embeddedWallet.address);
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
      
      let signatureString: string;
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
        throw new Error('Unknown signature format');
      }

      // Wait for confirmation
      await connection.confirmTransaction(signatureString, 'confirmed');

      // Record withdrawal on backend
      await withdrawalService.recordWithdrawal({
        token_mint: selectedToken.mint,
        amount: finalAmount,
        fee: finalFee,
        recipient_address: recipientAddress,
        transaction_signature: signatureString,
        token_symbol: selectedToken.symbol,
        token_decimals: selectedToken.decimals,
      });

      showToast({
        type: 'success',
        message: `Successfully withdrew ${finalAmount.toFixed(4)} ${selectedToken.symbol}!`,
      });
      
      // Update user balance
      await refreshUser();
      
      // Clear form and reset
      setWithdrawalAddress('');
      setUsdAmount('');
      setTokenAmount('');
      setAmountMode('usd');
      setCurrentStep(1);
      setCompletedSteps([]);
      setSelectedQuickAmount(null);
      
      setTimeout(() => {
        navigate('/');
      }, 2000);
      
    } catch (err: any) {
      console.error('❌ Error withdrawing:', err);
      showToast({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to withdraw. Please try again.',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Withdrawal stepper component
  const WithdrawStepper: React.FC<{ currentStep: 1 | 2 | 3 | 4; completedSteps: number[]; onStepClick: (step: number) => void }> = ({ currentStep, completedSteps, onStepClick }) => {
    const withdrawSteps = [
      { number: 1, label: 'Token', description: 'Select token' },
      { number: 2, label: 'Amount', description: 'Enter amount' },
      { number: 3, label: 'Address', description: 'Recipient' },
      { number: 4, label: 'Review', description: 'Confirm' },
    ];

    const getStepState = (stepNumber: number) => {
      if (completedSteps.includes(stepNumber)) return 'completed';
      if (currentStep === stepNumber) return 'active';
      return 'pending';
    };

    const canClickStep = (stepNumber: number) => {
      return completedSteps.includes(stepNumber) && onStepClick;
    };

    return (
      <div className="w-full mb-8" role="progressbar" aria-label="Withdrawal progress" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={4}>
        <div className="flex items-center justify-between relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-white/10 -z-10">
            <motion.div
              className="h-full bg-[#06B6D4]"
              initial={{ width: '0%' }}
              animate={{ width: `${((currentStep - 1) / (withdrawSteps.length - 1)) * 100}%` }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
          </div>
          {withdrawSteps.map((step) => {
            const state = getStepState(step.number);
            const isClickable = canClickStep(step.number);
            return (
              <div key={step.number} className="flex flex-col items-center flex-1 relative">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(step.number)}
                  disabled={!isClickable}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
                    ${state === 'completed' ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20' :
                      state === 'active' ? 'bg-[#06B6D4] text-white shadow-lg shadow-[#06B6D4]/30 ring-4 ring-[#06B6D4]/20' :
                      'bg-[#1E293B] text-[#64748B] border-2 border-white/10'}
                    ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                  `}
                >
                  {state === 'completed' ? <Check size={20} /> : step.number}
                </button>
                <div className="mt-2 text-center">
                  <div className={`text-xs font-bold uppercase tracking-wider ${
                    state === 'active' ? 'text-[#06B6D4]' : state === 'completed' ? 'text-[#10B981]' : 'text-[#64748B]'
                  }`}>
                    {step.label}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${state === 'active' ? 'text-white' : 'text-[#94A3B8]'}`}>
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // OptionCard component
  interface OptionCardProps {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    title: string;
    desc: string;
    disabled?: boolean;
    subtext?: string;
    onClick: () => void;
  }

  const OptionCard: React.FC<OptionCardProps> = ({ icon: Icon, title, desc, disabled = false, subtext, onClick }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center p-8 rounded-3xl text-center h-64 w-full transition-all ${
        disabled
          ? 'bg-[#1E293B]/20 border-white/5 opacity-50 cursor-not-allowed'
          : 'bg-[#1E293B]/40 border-white/10 hover:border-[#BE123C] hover:bg-[#1E293B]/60 group'
      } border`}
    >
      <div className={`w-16 h-16 rounded-2xl bg-[#0F172A] flex items-center justify-center mb-6 transition-transform border border-white/5 ${
        !disabled && 'group-hover:scale-110'
      }`}>
        <Icon size={32} className={disabled ? 'text-gray-600' : 'text-[#BE123C]'} />
      </div>
      {subtext && (
        <span className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">{subtext}</span>
      )}
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className={`text-sm px-4 ${disabled ? 'text-gray-600' : 'text-[#94A3B8]'}`}>{desc}</p>
    </button>
  );

  const renderContent = () => {
    if (!selectedOption) {
      return (
        <div className="grid md:grid-cols-2 gap-6">
          <OptionCard
            icon={Building}
            title="Withdraw to Bank"
            desc="Convert crypto to fiat currency."
            disabled
            subtext="Coming Soon"
            onClick={() => {}}
          />
          <OptionCard
            icon={ArrowUpRight}
            title="Withdraw to Wallet"
            desc="Send funds to an external Solana wallet."
            onClick={() => setSelectedOption('wallet')}
          />
        </div>
      );
    }

    if (selectedOption === 'bank') {
      return (
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-4 text-white">Withdraw to Bank</h3>
          <p className="text-[#94A3B8] mb-6">This feature is coming soon.</p>
          <GlowButton variant="secondary" onClick={() => setSelectedOption(null)}>Back</GlowButton>
        </div>
      );
    }
    
    if (selectedOption === 'wallet' && user) {
      if (isLoadingTokens) {
        return (
          <div className="flex justify-center items-center h-64">
            <Spinner />
          </div>
        );
      }

      // Convert tokens to Token format for TokenPicker
      const tokenPickerTokens: Token[] = tokens.map(t => ({
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        isNative: t.isNative,
      }));

      const selectedTokenForPicker: Token | null = selectedToken ? {
        mint: selectedToken.mint,
        symbol: selectedToken.symbol,
        name: selectedToken.name,
        decimals: selectedToken.decimals,
        isNative: selectedToken.isNative,
      } : null;

      // Calculate values for review step
      const numericAmount = amountMode === 'usd' && tokenPrice
        ? parseFloat(usdAmount) / tokenPrice
        : parseFloat(tokenAmount);
      const feeAmount = !isNaN(numericAmount) && numericAmount > 0 ? numericAmount * feePercentage : 0;
      const totalAmount = numericAmount + feeAmount;
      const usdValue = tokenPrice && !isNaN(numericAmount) ? numericAmount * tokenPrice : null;
      const usdFee = tokenPrice && feeAmount > 0 ? feeAmount * tokenPrice : null;
      const usdTotal = tokenPrice && totalAmount > 0 ? totalAmount * tokenPrice : null;
      const remainingBalance = userBalance - totalAmount;
      const remainingBalanceUsd = tokenPrice ? remainingBalance * tokenPrice : null;

      return (
        <div className="max-w-4xl mx-auto space-y-6">
          <WithdrawStepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />

        <GlassCard>
            <div className="space-y-6">
              {/* Step 1: Select Token */}
              {currentStep === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Select Token</h2>
                    <p className="text-[#94A3B8] text-sm">Choose which token you want to withdraw</p>
                  </div>

                  {selectedToken && (
                    <div className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/10 rounded-lg p-4">
                      <p className="text-[#94A3B8] text-sm mb-1">Your Balance</p>
                      {tokenPrice && tokenPrice > 0 ? (
                        <>
                          <p className="text-2xl font-bold text-white">${(userBalance * tokenPrice).toFixed(3)} USD</p>
                          <p className="text-sm text-[#94A3B8] mt-1">{userBalance.toFixed(4)} {selectedToken.symbol}</p>
                        </>
                      ) : (
                        <p className="text-2xl font-bold text-white">{userBalance.toFixed(4)} {selectedToken.symbol}</p>
                      )}
                    </div>
                  )}

                  <TokenPicker
                    tokens={tokenPickerTokens}
                    selectedToken={selectedTokenForPicker}
                    onSelect={(token) => {
                      const found = tokens.find(t => t.mint === token.mint);
                      if (found) {
                        setSelectedToken(found);
                        setUsdAmount('');
                        setTokenAmount('');
                      }
                    }}
                    balances={walletBalances}
                  />

                  <div className="flex gap-3">
                    <GlowButton variant="secondary" onClick={() => setSelectedOption(null)} className="flex-1">
                      Back
                    </GlowButton>
                    <GlowButton
                      variant="cyan"
                      onClick={() => {
                        if (selectedToken) {
                          handleNextStep();
                        }
                      }}
                      disabled={!selectedToken}
                      className="flex-1"
                    >
                      Continue
                    </GlowButton>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Enter Amount */}
              {currentStep === 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Enter Amount</h2>
                    <p className="text-[#94A3B8] text-sm">How much do you want to withdraw?</p>
                  </div>

                  {tokenPrice && (
                    <QuickAmountChips
                      onAmountSelect={(value) => {
                        setSelectedQuickAmount(value);
                        if (value && value !== 'custom') {
                          const usd = parseFloat(value);
                          setUsdAmount(usd.toString());
                          setTokenAmount((usd / tokenPrice).toString());
                          setAmountMode('usd');
                        } else {
                          setUsdAmount('');
                          setTokenAmount('');
                        }
                      }}
                      selectedAmount={selectedQuickAmount}
                      tokenPrice={tokenPrice}
                    />
                  )}

                  <div>
                    <div className="grid grid-cols-2 gap-0 bg-[#0F172A] p-1 rounded-xl border border-white/10 mb-3">
                      <button
                        type="button"
                        onClick={() => handleModeSwitch('token')}
                        className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                          amountMode === 'token'
                            ? 'bg-[#1E293B] text-white border border-white/10'
                            : 'text-[#64748B] hover:text-[#94A3B8]'
                        }`}
                      >
                        Token Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeSwitch('usd')}
                        disabled={!tokenPrice || priceLoading}
                        className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                          amountMode === 'usd'
                            ? 'bg-[#06B6D4] text-white border border-white/10'
                            : 'text-[#64748B] hover:text-[#94A3B8]'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        USD Amount
                      </button>
                    </div>

                    {amountMode === 'token' ? (
                      <InputField
                        type="number"
                        value={tokenAmount}
                        onChange={(e) => {
                          setTokenAmount(e.target.value);
                          if (tokenPrice && e.target.value) {
                            setUsdAmount((parseFloat(e.target.value) * tokenPrice).toFixed(2));
                          }
                        }}
                        placeholder="0.00"
                        rightElement={<span className="text-[#94A3B8]">{selectedToken?.symbol}</span>}
                      />
                    ) : (
                      <InputField
                        type="number"
                        value={usdAmount}
                        onChange={(e) => {
                          setUsdAmount(e.target.value);
                          if (tokenPrice && e.target.value) {
                            const calculatedTokenAmount = (parseFloat(e.target.value) / tokenPrice).toString();
                            setTokenAmount(calculatedTokenAmount);
                          }
                        }}
                        placeholder="0.00"
                        rightElement={<span className="text-[#94A3B8]">$</span>}
                      />
                    )}

                    {tokenPrice && (
                      <p className="text-sm text-[#94A3B8] mt-2">
                        {amountMode === 'token' && tokenAmount && !isNaN(parseFloat(tokenAmount)) ? (
                          <>≈ ${(parseFloat(tokenAmount) * tokenPrice).toFixed(2)} USD</>
                        ) : amountMode === 'usd' && usdAmount && !isNaN(parseFloat(usdAmount)) ? (
                          <>≈ {(parseFloat(usdAmount) / tokenPrice).toFixed(6)} {selectedToken?.symbol}</>
                        ) : null}
                      </p>
                    )}

                    {!isNaN(numericAmount) && numericAmount > 0 && (
                      <div className="mt-4 p-3 bg-[#0F172A]/30 border border-white/5 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#94A3B8]">Fee (0.1%):</span>
                          <span className="text-[#94A3B8]">{feeAmount.toFixed(6)} {selectedToken?.symbol}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-2 border-t border-white/5 mt-2">
                          <span className="text-white font-medium">Total:</span>
                          <span className="text-white font-medium">{totalAmount.toFixed(6)} {selectedToken?.symbol}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <GlowButton variant="secondary" onClick={() => setCurrentStep(1)} className="flex-1">
                      Back
                    </GlowButton>
                    <GlowButton
                      variant="cyan"
                      onClick={handleNextStep}
                      disabled={!canProceedFromStep(2)}
                      className="flex-1"
                    >
                      Continue
                    </GlowButton>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Enter Address */}
              {currentStep === 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Recipient Address</h2>
                    <p className="text-[#94A3B8] text-sm">Where should we send the funds?</p>
                  </div>

                  <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle size={20} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#EF4444] font-bold text-sm mb-1">Network Warning</p>
                      <p className="text-[#FCD34D] text-xs">
                        Only send to <strong>Solana network</strong> addresses. Sending to other networks will result in permanent loss of funds.
                      </p>
                    </div>
                  </div>

                  {savedAddresses.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2">Saved Addresses</p>
                      <div className="space-y-2">
                        {savedAddresses.map((addr, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setWithdrawalAddress(addr);
                              setAddressError(null);
                            }}
                            className="w-full p-3 rounded-lg bg-[#0F172A]/50 border border-white/10 hover:border-[#06B6D4] text-left transition-colors"
                          >
                            <p className="text-white font-mono text-sm truncate">{addr}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <InputField
                    label="Withdrawal Address"
                    placeholder="Enter Solana or SPL token address"
                    value={withdrawalAddress}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    error={addressError || undefined}
                    helperText="Paste a valid Solana wallet address"
                    required
                  />

                  <div className="flex gap-3">
                    <GlowButton variant="secondary" onClick={() => setCurrentStep(2)} className="flex-1">
                      Back
                    </GlowButton>
                    <GlowButton
                      variant="cyan"
                      onClick={handleNextStep}
                      disabled={!canProceedFromStep(3)}
                      className="flex-1"
                    >
                      Continue
                    </GlowButton>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Review */}
              {currentStep === 4 && selectedToken && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <WithdrawReviewStep
                    withdrawalAddress={withdrawalAddress.trim()}
                    amount={numericAmount}
                    tokenSymbol={selectedToken.symbol}
                    tokenName={selectedToken.name}
                    usdValue={usdValue}
                    fee={feeAmount}
                    total={totalAmount}
                    usdFee={usdFee}
                    usdTotal={usdTotal}
                    remainingBalance={remainingBalance}
                    remainingBalanceUsd={remainingBalanceUsd}
                    onEditStep={setCurrentStep}
                    onSubmit={handleWithdraw}
                    isSubmitting={isWithdrawing}
                    disabled={!canProceedFromStep(4) || isWithdrawing}
                  />
                </motion.div>
              )}
            </div>
          </GlassCard>
        </div>
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 animate-fade-in-up">
      {!selectedOption && (
        <PageHeader
          title="Withdraw Funds"
          subtitle="Send crypto from your wallet to an external address"
          breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Withdraw' }]}
        />
      )}
      
      {selectedOption && (
        <button 
          onClick={() => setSelectedOption(null)} 
          className="flex items-center gap-2 text-[#94A3B8] hover:text-white mb-8 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={20} />
          <span>Back</span>
        </button>
        )}
      
      {renderContent()}
    </div>
  );
};

export default WithdrawPage;

