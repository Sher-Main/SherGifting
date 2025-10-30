import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { connection } from '../services/solana';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';

const DepositPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { sendTransaction } = usePrivy();
    const [amount, setAmount] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [treasuryAddress, setTreasuryAddress] = useState<string>('');
    const [isLoadingTreasury, setIsLoadingTreasury] = useState(true);

    useEffect(() => {
        const fetchTreasuryInfo = async () => {
            try {
                const response = await fetch('/api/treasury/info');
                const data = await response.json();
                setTreasuryAddress(data.public_key);
            } catch (e) {
                setError('Failed to load treasury information');
            } finally {
                setIsLoadingTreasury(false);
            }
        };
        fetchTreasuryInfo();
    }, []);

    const handleDeposit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!user) {
            setError("Please log in first");
            return;
        }

        if (!amount) {
            setError("Please enter an amount");
            return;
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError("Please enter a valid amount");
            return;
        }

        setIsDepositing(true);
        setError(null);
        setSuccessMessage(null);

        try {
            console.log('💸 Preparing deposit transaction...');
            
            const fromPublicKey = new PublicKey(user.wallet_address);
            const toPublicKey = new PublicKey(treasuryAddress);
            
            // Create transaction
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromPublicKey,
                    toPubkey: toPublicKey,
                    lamports: numericAmount * LAMPORTS_PER_SOL,
                })
            );

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromPublicKey;

            console.log('📝 Sending transaction via Privy...');
            
            // Send transaction using Privy
            const { transactionId } = await sendTransaction({
                transaction,
                chain: {
                    type: 'solana',
                    id: 'devnet'
                }
            });

            console.log('✅ Transaction sent:', transactionId);

            // Wait a bit for transaction to confirm
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify deposit on backend
            console.log('🔍 Verifying deposit on backend...');
            const verifyResponse = await fetch('/api/treasury/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: numericAmount,
                    signature: transactionId,
                    sender_did: user.privy_did
                })
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
                setSuccessMessage(`Successfully deposited ${verifyData.deposited} SOL! New balance: ${verifyData.balance} SOL`);
                setAmount('');
                
                // Reload page after 2 seconds to refresh balance
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setError('Deposit verification failed. Please contact support.');
            }
            
        } catch (err: any) {
            console.error('❌ Error depositing:', err);
            setError(err.message || 'Failed to deposit. Please try again.');
        } finally {
            setIsDepositing(false);
        }
    };

    if (isLoadingTreasury) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <button 
                onClick={() => navigate(-1)} 
                className="mb-4 text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors font-medium"
            >
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Back</span>
            </button>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg max-w-lg mx-auto">
                <h1 className="text-3xl font-bold text-center mb-2">Deposit to Gifting Balance</h1>
                <p className="text-slate-400 text-center mb-6 text-sm">
                    Transfer SOL from your wallet to send gifts without signing each time
                </p>
                
                {/* Current Balance */}
                <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border border-sky-500/30 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-slate-400 text-xs">Current Gifting Balance</p>
                            <p className="text-2xl font-bold text-white">{user?.balance || 0} SOL</p>
                        </div>
                        <div className="text-right">
                            <p className="text-slate-400 text-xs">Wallet Balance</p>
                            <p className="text-xl font-semibold text-sky-400">~5 SOL</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleDeposit} className="space-y-6">
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-slate-300 mb-2">
                            Amount to Deposit (SOL)
                        </label>
                        <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            min="0"
                            step="0.01"
                            className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition text-xl font-semibold text-center"
                            placeholder="0.00"
                        />
                        <p className="text-xs text-slate-400 mt-2 text-center">
                            💡 Recommended: Deposit 1-5 SOL for multiple gifts
                        </p>
                    </div>

                    {/* Treasury Address Info */}
                    <div className="bg-slate-900/50 rounded-lg p-4">
                        <p className="text-xs text-slate-400 mb-2">Treasury Address:</p>
                        <p className="text-xs text-slate-300 font-mono break-all">
                            {treasuryAddress}
                        </p>
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
                        disabled={isDepositing}
                        className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center text-lg shadow-lg"
                    >
                        {isDepositing ? (
                            <>
                                <Spinner size="6" color="border-white" />
                                <span className="ml-3">Depositing...</span>
                            </>
                        ) : (
                            'Deposit SOL'
                        )}
                    </button>

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-blue-200 text-xs">
                            ℹ️ <strong>Why deposit?</strong> Your gifting balance allows you to send gifts instantly without signing each transaction. Funds are securely held in the treasury wallet.
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DepositPage;

