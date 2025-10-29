import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { heliusService, giftService } from '../services/api';
import { TokenBalance } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import { usePrivy, useWallets } from '@privy-io/react-auth'; // ✅ Changed import
import { PublicKey } from '@solana/web3.js';
import { createTransferToTipLinkTransaction } from '../services/solana';

const GiftPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { wallets } = useWallets(); // ✅ Use this instead of useSolanaWallets
    const [balances, setBalances] = useState<TokenBalance[]>([]);
    const [isLoadingBalances, setIsLoadingBalances] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    const [recipientEmail, setRecipientEmail] = useState('');
    const [selectedTokenAddress, setSelectedTokenAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchBalances = async () => {
            if (!user?.wallet_address) return;
            setIsLoadingBalances(true);
            try {
                const fetchedBalances = await heliusService.getTokenBalances(user.wallet_address);
                const filteredBalances = fetchedBalances.filter(b => b.balance > 0);
                setBalances(filteredBalances);
                if (filteredBalances.length > 0) {
                    setSelectedTokenAddress(filteredBalances[0].address);
                }
            } catch (e) {
                setError('Failed to fetch token balances.');
                console.error(e);
            } finally {
                setIsLoadingBalances(false);
            }
        };
        fetchBalances();
    }, [user]);
    
    const selectedToken = balances.find(b => b.address === selectedTokenAddress);

    // ✅ REPLACE your handleSendGift with this complete version
    const handleSendGift = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!user) {
            setError("Please log in first");
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
        if (numericAmount > selectedToken.balance) {
            setError(`You don't have enough ${selectedToken.symbol}.`);
            return;
        }

        setIsSending(true);
        setError(null);
        setSuccessMessage(null);

        try {
            // Step 1: Create gift and TipLink on backend
            console.log('📦 Creating gift on backend...');
            const createResponse = await giftService.createGift({
                recipient_email: recipientEmail,
                token_address: selectedTokenAddress,
                amount: numericAmount,
                message: message,
                sender_did: user.privy_did,
            });

            const { tiplink_public_key, tiplink_url, gift_id } = createResponse;
            console.log('✅ Gift created, TipLink:', tiplink_public_key);

            // Step 2: Get Solana wallet
            const solanaWallet = wallets.find(w => w.walletClientType === 'privy');
            if (!solanaWallet) {
                throw new Error('Solana wallet not found');
            }

            // Step 3: Send SOL to TipLink wallet
            console.log('💸 Preparing transaction...');
            const senderPublicKey = new PublicKey(user.wallet_address);
            const tiplinkPublicKey = new PublicKey(tiplink_public_key);

            const transaction = await createTransferToTipLinkTransaction(
                senderPublicKey,
                tiplinkPublicKey,
                numericAmount
            );

            console.log('📝 Signing and sending transaction...');
            
            // @ts-ignore - Privy types are incomplete
            const { signature } = await solanaWallet.sendTransaction(transaction);
            console.log('✅ Transaction sent:', signature);

            // Success!
            setSuccessMessage(
                `Successfully sent ${numericAmount} ${selectedToken.symbol} to ${recipientEmail}! ` +
                `Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`
            );
            
            // Clear form
            setRecipientEmail('');
            setAmount('');
            setMessage('');
            
        } catch (err: any) {
            console.error('❌ Error creating gift:', err);
            setError(err.message || 'Failed to send gift. Please try again.');
        } finally {
            setIsSending(false);
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
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg max-w-lg mx-auto">
                <h1 className="text-3xl font-bold text-center mb-6">Send a Gift</h1>
                
                {isLoadingBalances ? (
                    <div className="flex justify-center items-center h-40"><Spinner /></div>
                ) : balances.length === 0 ? (
                    <p className="text-center text-slate-400">You don't have any tokens to send. Please add funds first.</p>
                ) : (
                    <form onSubmit={handleSendGift} className="space-y-6">
                        <div>
                            <label htmlFor="recipientEmail" className="block text-sm font-medium text-slate-300 mb-2">Recipient's Email</label>
                            <input
                                type="email"
                                id="recipientEmail"
                                value={recipientEmail}
                                onChange={(e) => setRecipientEmail(e.target.value)}
                                required
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                                placeholder="friend@example.com"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                             <div className="col-span-2">
                                <label htmlFor="amount" className="block text-sm font-medium text-slate-300 mb-2">Amount</label>
                                <input
                                    type="number"
                                    id="amount"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    required
                                    min="0"
                                    step="any"
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                                    placeholder="0.00"
                                />
                                {selectedToken && <p className="text-xs text-slate-400 mt-1">Balance: {selectedToken.balance.toLocaleString(undefined, {maximumFractionDigits: 6})} {selectedToken.symbol}</p>}
                            </div>
                            <div>
                                <label htmlFor="token" className="block text-sm font-medium text-slate-300 mb-2">Token</label>
                                <select
                                    id="token"
                                    value={selectedTokenAddress}
                                    onChange={(e) => setSelectedTokenAddress(e.target.value)}
                                    required
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition h-[50px]"
                                >
                                    {balances.map(token => (
                                        <option key={token.address} value={token.address}>{token.symbol}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                         <div>
                            <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">Message (Optional)</label>
                            <textarea
                                id="message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                                placeholder="Happy Birthday!"
                            />
                        </div>
                        
                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                        {successMessage && <p className="text-green-400 text-sm text-center">{successMessage}</p>}

                        <button
                            type="submit"
                            disabled={isSending}
                            className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center text-lg shadow-lg"
                        >
                            {isSending ? (
                                <>
                                    <Spinner size="6" color="border-white" />
                                    <span className="ml-3">Sending...</span>
                                </>
                            ) : (
                                'Send Gift'
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default GiftPage;
