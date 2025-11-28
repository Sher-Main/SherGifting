import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet, useWallets } from '@privy-io/react-auth/solana';
import { BanknotesIcon, ArrowDownTrayIcon, ArrowLeftIcon } from '../components/icons';
import QRCode from 'qrcode';
import { setAuthToken } from '../services/api';
import { getApiUrl } from '../services/apiConfig';

const AddFundsPage: React.FC = () => {
  const { user } = useAuth();
  const { user: privyUser, getAccessToken } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { wallets, ready: walletsReady } = useWallets();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'bank' | 'wallet' | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isLoadingOnramp, setIsLoadingOnramp] = useState(false);

  // Get wallet address from multiple sources (fallback chain)
  const walletAddress = wallets?.[0]?.address || privyUser?.wallet?.address || user?.wallet_address;
  
  // Button should be enabled if we have any wallet address, even if useWallets isn't ready
  // This handles cases where the wallet exists but useWallets hasn't initialized yet
  const canFundWallet = Boolean(walletAddress) && !isLoadingOnramp;
  
  // Debug logging
  useEffect(() => {
    console.log('🔍 AddFundsPage wallet status:', {
      hasWallets: Boolean(wallets && wallets.length > 0),
      walletsReady,
      walletFromWallets: wallets?.[0]?.address,
      walletFromPrivy: privyUser?.wallet?.address,
      walletFromUser: user?.wallet_address,
      finalWalletAddress: walletAddress,
      canFundWallet,
    });
  }, [wallets, walletsReady, privyUser?.wallet?.address, user?.wallet_address, walletAddress, canFundWallet]);

  const handleCopy = () => {
    if (user?.wallet_address) {
      navigator.clipboard.writeText(user.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate QR code for wallet address when wallet option is selected
  useEffect(() => {
    const generateQRCode = async () => {
      if (selectedOption === 'wallet' && user?.wallet_address) {
        try {
          const qrCode = await QRCode.toDataURL(user.wallet_address, {
            width: 200,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          setQrCodeDataUrl(qrCode);
        } catch (error) {
          console.error('Failed to generate QR code:', error);
          setQrCodeDataUrl(null);
        }
      } else {
        setQrCodeDataUrl(null);
      }
    };

    generateQRCode();
  }, [selectedOption, user?.wallet_address]);

  const handleOnRamp = async () => {
    if (!walletAddress) {
      console.error('❌ No wallet address available', {
        wallets: wallets?.length || 0,
        privyWallet: privyUser?.wallet?.address,
        userWallet: user?.wallet_address,
      });
      return;
    }

    setIsLoadingOnramp(true);

    try {
      console.log('🚀 Opening Privy funding flow for user:', privyUser?.id);

      // Get current balance before funding
      const getCurrentBalance = async () => {
        try {
          if (!walletAddress) return 0;
          
          const response = await fetch(getApiUrl(`wallet/balances/${walletAddress}`));
          if (response.ok) {
            const balances = await response.json();
            const solBalance = balances.find((b: any) => b.symbol === 'SOL');
            return solBalance?.balance || 0;
          }
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
        return 0;
      };

      const previousBalance = await getCurrentBalance();
      console.log(`   Previous balance: ${previousBalance} SOL`);

      // Use the correct Solana-specific fundWallet
      await fundWallet({
        address: walletAddress,
      });

      console.log('✅ Funding modal opened - starting polling for transaction...');

      // Poll for balance changes after modal closes
      // Poll every 5 seconds for up to 3 minutes (36 attempts)
      let attempts = 0;
      const maxAttempts = 36; // 36 attempts * 5 seconds = 180 seconds (3 minutes)
      const pollInterval = 5000; // 5 seconds

      const pollForTransaction = async () => {
        attempts++;
        console.log(`   🔄 Polling attempt ${attempts}/${maxAttempts}...`);

        try {
          const currentBalance = await getCurrentBalance();
          const balanceIncrease = currentBalance - previousBalance;

          console.log(`   📊 Current balance: ${currentBalance} SOL (change: ${balanceIncrease > 0 ? '+' : ''}${balanceIncrease.toFixed(4)} SOL)`);

          // If balance increased significantly, transaction completed!
          if (balanceIncrease > 0.001) { // 0.001 SOL threshold to account for fees
            console.log(`   ✅ Balance increased by ${balanceIncrease.toFixed(4)} SOL - transaction detected!`);

            // Call backend to detect transaction and issue credit
            const token = await getAccessToken() || '';
            setAuthToken(token);
            
            if (walletAddress) {
              console.log('   📞 Calling detect-transaction endpoint...');
              const response = await fetch(getApiUrl('onramp/detect-transaction'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  walletAddress,
                  previousBalance,
                  currentBalance,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Detection API error:', response.status, errorText);
                throw new Error(`API error: ${response.status}`);
              }

              const result = await response.json();
              console.log('   📊 Detection result:', result);
              
              if (result.transactionDetected && result.creditIssued) {
                console.log('✨ Credit issued!', result);
                alert(`🎉 Success! You received a $5 credit! You can now send ${result.cardAddsFreeRemaining} free cards.`);
                setIsLoadingOnramp(false);
                // Refresh page to show updated balance and credit
                setTimeout(() => window.location.reload(), 1000);
                return; // Stop polling
              } else if (result.transactionDetected && result.alreadyRecorded) {
                console.log('ℹ️ Transaction already recorded');
                if (result.creditIssued) {
                  alert(`✅ Transaction recorded! You have ${result.cardAddsFreeRemaining || 5} free cards remaining.`);
                }
                setIsLoadingOnramp(false);
                setTimeout(() => window.location.reload(), 1000);
                return; // Stop polling
              } else if (result.transactionDetected && !result.creditIssued) {
                console.warn('⚠️ Transaction detected but credit not issued:', result.error);
                alert('Transaction detected but there was an issue issuing your credit. Please contact support.');
                setIsLoadingOnramp(false);
                return; // Stop polling
              } else {
                console.warn('⚠️ No transaction detected:', result.message);
                // Continue polling in case transaction is still processing
              }
            }

            setIsLoadingOnramp(false);
            return; // Stop polling
          }

          // If no balance increase yet and we haven't exceeded max attempts, keep polling
          if (attempts < maxAttempts) {
            setTimeout(pollForTransaction, pollInterval);
          } else {
            console.log('   ⏱️ Polling timeout - no balance increase detected after 3 minutes');
            setIsLoadingOnramp(false);
            console.log('   ℹ️ Transaction may still be processing. It will be detected automatically when it completes.');
          }

        } catch (error) {
          console.error('❌ Error polling for transaction:', error);
          // Retry if we haven't exceeded max attempts
          if (attempts < maxAttempts) {
            setTimeout(pollForTransaction, pollInterval);
          } else {
            setIsLoadingOnramp(false);
            console.error('❌ Failed to detect transaction after multiple attempts');
          }
        }
      };

      // Start polling after a short delay (give transaction time to settle)
      setTimeout(pollForTransaction, 5000); // Wait 5 seconds before first poll

    } catch (error) {
      console.error('❌ Error opening funding flow:', error);
    } finally {
      setIsLoadingOnramp(false);
    }
  };

  const renderContent = () => {
    if (!selectedOption) {
      return (
        <div className="grid md:grid-cols-2 gap-6">
          <button 
            onClick={handleOnRamp}
            disabled={!canFundWallet}
            className="p-8 bg-slate-800 hover:bg-slate-700/50 border border-slate-700 rounded-2xl text-center transition-all duration-300 ease-in-out transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BanknotesIcon className="w-12 h-12 mx-auto mb-4 text-sky-400" />
            <h3 className="text-xl font-bold">Transfer from Bank</h3>
            <p className="text-slate-400 mt-2">
              {isLoadingOnramp ? 'Opening funding flow...' : 'Purchase crypto with card. Get $5 credit!'}
            </p>
          </button>
          <button onClick={() => setSelectedOption('wallet')} className="p-8 bg-slate-800 hover:bg-slate-700/50 border border-slate-700 rounded-2xl text-center transition-all duration-300 ease-in-out transform hover:-translate-y-1">
            <ArrowDownTrayIcon className="w-12 h-12 mx-auto mb-4 text-sky-400" />
            <h3 className="text-xl font-bold">Transfer from Wallet</h3>
            <p className="text-slate-400 mt-2">Send funds from an external wallet.</p>
          </button>
        </div>
      );
    }

    if (selectedOption === 'bank') {
      return (
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold mb-2 text-center">🎁 FUND YOUR GIFTING APP - FASTEST WAY (DEBIT CARD)</h3>
          <div className="mt-6 space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            {/* Step 1 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">1</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Sign Up on Coinbase (2 min)</h4>
                  <p className="text-slate-300 mb-2">
                    Go to <a href="https://coinbase.com/signup" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline">coinbase.com/signup</a> → Click "Sign Up"
                  </p>
                  <ul className="list-disc list-inside text-slate-400 space-y-1 ml-4">
                    <li>Email, password, name → Verify email</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">2</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Secure Your Account (2 min)</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Enter phone number</li>
                    <li>Enter code from text message</li>
                    <li className="text-green-400">✅ Account secured</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">3</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Verify Your Identity (10 min)</h4>
                  <p className="text-slate-300 mb-2">Upload these 3 things:</p>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4 mb-2">
                    <li><strong>ID photo</strong> (front + back) - Driver's license, passport, or state ID</li>
                    <li><strong>Selfie</strong> - Just your face, good lighting</li>
                    <li><strong>Proof of address</strong> - Recent utility bill, bank statement, or lease (dated within 3 months)</li>
                  </ul>
                  <p className="text-slate-400 text-sm italic">All must be clear photos/scans, not screenshots.</p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">4</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Wait for Approval (5 min - 1 hour)</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Coinbase reviews your docs</li>
                    <li>Check email for approval notification</li>
                    <li className="text-green-400">✅ Ready to fund</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">5</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Add Debit Card (INSTANT) ⚡</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Go to Settings → Payment Methods → Add</li>
                    <li>Select Debit Card</li>
                    <li>Enter card number, expiration, CVV</li>
                    <li>Address must match your bank records</li>
                    <li className="text-green-400">✅ Card added & ready instantly</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">6</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Buy Solana (2 min)</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Click "Buy / Sell" on dashboard</li>
                    <li>Search "Solana" or "SOL"</li>
                    <li>Enter amount ($25-50 to start)</li>
                    <li>Select your Debit Card as payment method</li>
                    <li>Click "Buy Solana" → Enter 2FA code</li>
                    <li className="text-green-400">✅ SOL in your wallet instantly</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 7 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">7</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Get Your Gifting App Wallet Address (1 min)</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Open Gifting App</li>
                    <li>Tap "Add Funds"</li>
                    <li>Select "Transfer from Wallet"</li>
                    <li>Tap the Copy icon</li>
                    <li className="text-green-400">✅ Address copied</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 8 */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center font-bold text-white">8</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2">Send SOL to Your App (2 min)</h4>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4 mb-3">
                    <li>In Coinbase, find your SOL balance</li>
                    <li>Click "Send" or "Withdraw"</li>
                    <li>Select Solana network (only option for SOL)</li>
                    <li>Paste the address you just copied</li>
                    <li>Enter amount (leave $1-2 for fees)</li>
                  </ul>
                  <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-4 mb-3">
                    <p className="text-slate-300 font-semibold mb-2">✅ Verify checklist:</p>
                    <ul className="space-y-1 text-slate-300">
                      <li>☑ Network = Solana</li>
                      <li>☑ Address matches the one you copied</li>
                      <li>☑ Amount is correct</li>
                    </ul>
                  </div>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 ml-4">
                    <li>Click "Send" → Enter 2FA code</li>
                    <li className="text-green-400">✅ Done! SOL arrives in 30 seconds - 2 minutes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => setSelectedOption(null)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-6 rounded-lg transition-colors">Back</button>
          </div>
        </div>
      );
    }
    
    if (selectedOption === 'wallet' && user) {
        return (
             <div className="text-center max-w-md mx-auto">
                <h3 className="text-2xl font-bold mb-4">Your Gifting Wallet Address</h3>
                <p className="text-slate-400 mb-6">This is your personal gifting wallet. Send SOL or SPL tokens on the Solana network to this address to fund your gifts. Sending tokens from other networks may result in a permanent loss of funds.</p>
                <div className="bg-slate-900/50 p-4 rounded-lg mb-4 break-all font-mono text-sm text-slate-300 relative">
                    {user.wallet_address}
                    <button onClick={handleCopy} className="absolute top-2 right-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold py-1 px-2 rounded">
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                {/* QR Code */}
                {qrCodeDataUrl && (
                <div className="bg-white p-4 inline-block rounded-lg mb-6">
                        <img src={qrCodeDataUrl} alt="Wallet Address QR Code" className="w-48 h-48" />
                </div>
                )}
                <br/>
                <button onClick={() => setSelectedOption(null)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Back</button>
            </div>
        )
    }
  };

  return (
    <div className="animate-fade-in">
        <button 
            onClick={() => navigate(-1)} 
            className="mb-4 text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors font-medium"
        >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back</span>
        </button>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg">
            <h1 className="text-3xl font-bold text-center mb-8">Add Funds</h1>
            {renderContent()}
        </div>
    </div>
  );
};

export default AddFundsPage;