import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { heliusService, feeService, priceService, withdrawalService } from '../services/api';
import { TokenBalance } from '../types';
import Spinner from '../components/Spinner';
import { Building, ArrowUpRight, ChevronLeft } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import InputField from '../components/UI/InputField';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../services/solana';
import bs58 from 'bs58';

const WithdrawPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { ready, authenticated, user: privyUser } = usePrivy();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets, ready: walletsReady } = useWallets();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'bank' | 'wallet' | null>(null);
  
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
  
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmDetails, setConfirmDetails] = useState<{
    withdrawalAddress: string;
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

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !ready || !authenticated || !user.wallet_address || !walletReady) {
      setError("Please ensure you're logged in and wallet is ready.");
      return;
    }

    if (!selectedToken || !withdrawalAddress.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (addressError || !validateSolanaAddress(withdrawalAddress.trim())) {
      setError("Please enter a valid Solana address.");
      return;
    }

    const numericAmount = amountMode === 'usd' && tokenPrice
      ? parseFloat(usdAmount) / tokenPrice
      : parseFloat(tokenAmount);
      
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    
    // Calculate fee (0.1% of withdrawal amount)
    const feeAmount = numericAmount * feePercentage;
    const totalAmount = numericAmount + feeAmount;
    
    // Check user balance (including fee)
    if (totalAmount > userBalance) {
      setError(`Insufficient balance. You need ${totalAmount.toFixed(4)} ${selectedToken.symbol} (${numericAmount.toFixed(4)} ${selectedToken.symbol} withdrawal + ${feeAmount.toFixed(4)} ${selectedToken.symbol} fee). You have ${userBalance.toFixed(4)} ${selectedToken.symbol} available.`);
      return;
    }
    
    // For SPL tokens, check SOL balance for fees
    if (!selectedToken.isNative) {
      const solBalance = walletBalances.find(b => b.symbol === 'SOL')?.balance || 0;
      const MIN_SOL_FOR_FEES = 0.01;
      if (solBalance < MIN_SOL_FOR_FEES) {
        setError(`Insufficient SOL for transaction fees. You need at least ${MIN_SOL_FOR_FEES} SOL to pay for transaction fees. You have ${solBalance.toFixed(4)} SOL available.`);
        return;
      }
    }

    // Calculate USD values if price is available
    const usdValue = tokenPrice ? numericAmount * tokenPrice : null;
    const usdFee = tokenPrice ? feeAmount * tokenPrice : null;
    const usdTotal = tokenPrice ? totalAmount * tokenPrice : null;
    
    // Calculate remaining balance after transaction
    const remainingBalance = userBalance - totalAmount;
    const remainingBalanceUsd = tokenPrice ? remainingBalance * tokenPrice : null;
    
    // Show confirmation modal
    setConfirmDetails({
      withdrawalAddress: withdrawalAddress.trim(),
      amount: numericAmount,
      fee: feeAmount,
      total: totalAmount,
      token: selectedToken.symbol,
      tokenName: selectedToken.name,
      usdValue,
      usdFee,
      usdTotal,
      remainingBalance,
      remainingBalanceUsd,
    });
    setShowConfirmModal(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!confirmDetails || !selectedToken) return;
    
    setIsWithdrawing(true);
    setError(null);
    setSuccessMessage(null);
    setShowConfirmModal(false);

    const numericAmount = confirmDetails.amount;
    const feeAmount = confirmDetails.fee;
    const recipientAddress = confirmDetails.withdrawalAddress;

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
        const withdrawalAmountLamports = Math.round(numericAmount * LAMPORTS_PER_SOL);
        const feeAmountLamports = Math.round(feeAmount * LAMPORTS_PER_SOL);
        
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
        
        const withdrawalAmountRaw = Math.round(numericAmount * Math.pow(10, decimals));
        const feeAmountRaw = Math.round(feeAmount * Math.pow(10, decimals));
        
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
        amount: numericAmount,
        fee: feeAmount,
        recipient_address: recipientAddress,
        transaction_signature: signatureString,
        token_symbol: selectedToken.symbol,
        token_decimals: selectedToken.decimals,
      });

      setSuccessMessage(`Successfully withdrew ${numericAmount.toFixed(4)} ${selectedToken.symbol} to ${recipientAddress.substring(0, 8)}...`);
      
      // Update user balance
      await refreshUser();
      
      // Clear form
      setWithdrawalAddress('');
      setUsdAmount('');
      setTokenAmount('');
      setAmountMode('usd');
      
      setTimeout(() => {
        navigate('/');
      }, 3000);
      
    } catch (err: any) {
      console.error('❌ Error withdrawing:', err);
      setError(err.response?.data?.error || err.message || 'Failed to withdraw. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
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

      return (
        <GlassCard>
          <form onSubmit={handleWithdraw} className="space-y-6 max-w-2xl mx-auto">
            {/* Warning Banner */}
            <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-4">
              <p className="text-[#FCD34D] text-sm font-medium">
                ⚠️ <strong>Important:</strong> Only enter valid Solana or SPL token addresses for withdrawal. Using addresses from other networks may result in permanent loss of funds.
              </p>
            </div>

            {/* User Balance Info */}
            {selectedToken && (
              <div className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/10 rounded-lg p-4">
                <p className="text-[#94A3B8] text-sm">Your Balance</p>
                {tokenPrice && tokenPrice > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      ${(userBalance * tokenPrice).toFixed(3)} USD
                    </p>
                    <p className="text-sm text-[#94A3B8] mt-1">
                      {userBalance.toFixed(4)} {selectedToken.symbol}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-white">
                    {userBalance.toFixed(4)} {selectedToken.symbol}
                  </p>
                )}
                <p className="text-xs text-[#64748B] mt-1">Available for withdrawal</p>
                {userBalance < 0.01 && (
                  <div className="mt-3 p-3 bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg">
                    <p className="text-[#FCD34D] text-sm">
                      ⚠️ Low balance. Add {selectedToken.symbol} to your wallet in the "Add Funds" page.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Token Selector */}
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-white mb-2">
                Token
              </label>
              <select
                id="token"
                value={selectedToken?.mint || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.mint === e.target.value);
                  setSelectedToken(token || null);
                  setUsdAmount('');
                  setTokenAmount('');
                }}
                className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-[#BE123C] focus:ring-4 focus:ring-[#BE123C]/10 transition"
              >
                {tokens.map(token => (
                  <option key={token.mint} value={token.mint}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Withdrawal Address */}
            <div>
              <InputField
                label="Withdrawal Address"
                placeholder="Enter Solana or SPL token address"
                value={withdrawalAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                required
              />
              {addressError && (
                <p className="text-[#EF4444] text-sm mt-1">{addressError}</p>
              )}
            </div>

            {/* Amount Input with Mode Toggle */}
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-white mb-2">
                Amount
              </label>
              
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
                  id="amount"
                  value={tokenAmount}
                  onChange={(e) => {
                    setTokenAmount(e.target.value);
                    if (tokenPrice && e.target.value) {
                      setUsdAmount((parseFloat(e.target.value) * tokenPrice).toFixed(2));
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
                  onChange={(e) => {
                    setUsdAmount(e.target.value);
                    if (tokenPrice && e.target.value) {
                      const calculatedTokenAmount = (parseFloat(e.target.value) / tokenPrice).toString();
                      setTokenAmount(calculatedTokenAmount);
                    }
                  }}
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  rightElement={<span className="text-[#94A3B8]">$</span>}
                />
              )}
              
              {tokenPrice && (
                <div className="mt-2 text-sm text-[#94A3B8]">
                  {amountMode === 'token' && tokenAmount && !isNaN(parseFloat(tokenAmount)) ? (
                    <span>≈ ${(parseFloat(tokenAmount) * tokenPrice).toFixed(2)} USD</span>
                  ) : amountMode === 'usd' && usdAmount && !isNaN(parseFloat(usdAmount)) ? (
                    <span>≈ {(parseFloat(usdAmount) / tokenPrice).toFixed(6)} {selectedToken?.symbol}</span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Fee Breakdown */}
            {(tokenAmount || usdAmount) && !isNaN(parseFloat(tokenAmount || usdAmount)) && parseFloat(tokenAmount || usdAmount) > 0 && (
              <div className="p-3 bg-[#0F172A]/30 border border-white/5 rounded-lg">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#94A3B8]">Withdrawal Amount:</span>
                  <span className="text-white">
                    {amountMode === 'usd' && tokenPrice
                      ? `$${parseFloat(usdAmount).toFixed(3)}`
                      : `${parseFloat(tokenAmount).toFixed(6)} ${selectedToken?.symbol}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#94A3B8]">Fee (0.1%):</span>
                  <span className="text-[#94A3B8]">
                    {amountMode === 'usd' && tokenPrice
                      ? `$${(parseFloat(usdAmount) * feePercentage).toFixed(3)}`
                      : `${(parseFloat(tokenAmount) * feePercentage).toFixed(6)} ${selectedToken?.symbol}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                  <span className="text-white font-medium">Total:</span>
                  <span className="text-white font-medium">
                    {amountMode === 'usd' && tokenPrice
                      ? `$${(parseFloat(usdAmount) * (1 + feePercentage)).toFixed(3)}`
                      : `${(parseFloat(tokenAmount) * (1 + feePercentage)).toFixed(6)} ${selectedToken?.symbol}`}
                  </span>
                </div>
              </div>
            )}

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

            <div className="flex gap-3">
              <GlowButton
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  setSelectedOption(null);
                  setWithdrawalAddress('');
                  setUsdAmount('');
                  setTokenAmount('');
                  setError(null);
                  setSuccessMessage(null);
                }}
              >
                Back
              </GlowButton>
              <GlowButton
                type="submit"
                variant="cyan"
                fullWidth
                disabled={isWithdrawing || !user || userBalance < 0.001 || !!addressError}
              >
                {isWithdrawing ? (
                  <>
                    <Spinner size="6" color="border-white" />
                    <span className="ml-2">Withdrawing...</span>
                  </>
                ) : (
                  'Preview Withdrawal'
                )}
              </GlowButton>
            </div>
          </form>
        </GlassCard>
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 animate-fade-in-up">
      <button 
        onClick={() => selectedOption ? setSelectedOption(null) : navigate(-1)} 
        className="flex items-center gap-2 text-[#94A3B8] hover:text-white mb-8 transition-colors"
      >
        <ChevronLeft size={20} />
        <span>Back</span>
      </button>
      
      {!selectedOption && (
        <h1 className="text-3xl font-bold text-white mb-10 text-center">Withdraw Funds</h1>
      )}
      
      {/* Confirmation Modal */}
      {showConfirmModal && confirmDetails && (
        <div className="fixed inset-0 bg-[#0B1120]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <GlassCard className="max-w-md w-full animate-scale-in">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Confirm Withdrawal</h2>
            
            <div className="space-y-4 mb-6">
              <div className="bg-[#0F172A]/30 rounded-lg p-4 space-y-3 border border-white/5">
                <div className="pb-3 border-b border-white/5">
                  <p className="text-[#94A3B8] text-xs mb-1">Withdrawal Address</p>
                  <p className="text-white font-mono text-sm break-all">{confirmDetails.withdrawalAddress}</p>
                </div>
                
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
                
                <div className="pb-3 border-b border-white/5">
                  <p className="text-[#94A3B8] text-xs mb-1">Fee (0.1%)</p>
                  {confirmDetails.usdFee !== null ? (
                    <p className="text-[#94A3B8] font-medium">${confirmDetails.usdFee.toFixed(3)} USD</p>
                  ) : (
                    <p className="text-[#94A3B8] font-medium">{confirmDetails.fee.toFixed(6)} {confirmDetails.token}</p>
                  )}
                </div>
                
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
            </div>
            
            <div className="flex gap-3">
              <GlowButton
                variant="secondary"
                fullWidth
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmDetails(null);
                }}
              >
                Cancel
              </GlowButton>
              <GlowButton
                variant="cyan"
                fullWidth
                onClick={handleConfirmWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? 'Withdrawing...' : 'Confirm & Withdraw'}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
      
      {renderContent()}
    </div>
  );
};

export default WithdrawPage;

