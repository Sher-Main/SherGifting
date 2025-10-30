import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tokenService, giftService, treasuryService } from '../services/api';
import { Token } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';
import QRCode from 'qrcode';

const GiftPage: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [isLoadingTokens, setIsLoadingTokens] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [treasuryAddress, setTreasuryAddress] = useState<string>('');
    
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
        const fetchTreasuryInfo = async () => {
            try {
                const response = await fetch('/api/treasury/info');
                const data = await response.json();
                setTreasuryAddress(data.public_key);
                console.log('📍 Treasury wallet address:', data.public_key);
            } catch (e) {
                console.error('Failed to fetch treasury info:', e);
            }
        };
        fetchTreasuryInfo();
    }, []);

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
        
        // Check treasury balance
        if (selectedToken.isNative && numericAmount > user.balance) {
            setError(`Insufficient treasury balance. You have ${user.balance} SOL available for gifting.`);
            return;
        }

        setIsSending(true);
        setError(null);
        setSuccessMessage(null);

        try {
            console.log('🎁 Creating and funding gift via treasury...');
            
            const createResponse = await giftService.createGift({
                recipient_email: recipientEmail,
                token_mint: selectedToken.mint,
                amount: numericAmount,
                message: message,
                sender_did: user.privy_did,
            });

            const { claim_url, gift_id, signature, new_balance } = createResponse;
            console.log('✅ Gift created and funded! Gift ID:', gift_id);
            console.log('✅ Transaction signature:', signature);
            console.log('💰 New balance:', new_balance);

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
                signature,
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
            console.error('❌ Error creating gift:', err);
            setError(err.response?.data?.error || err.message || 'Failed to send gift. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleAddTestBalance = async () => {
        if (!user) return;
        
        try {
            const result = await treasuryService.addTestBalance(user.privy_did, 5);
            await refreshUser();
            setSuccessMessage(`Added 5 SOL test balance! New balance: ${result.new_balance} SOL`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            setError('Failed to add test balance');
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
                
                {/* Treasury Balance Info */}
                <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border border-sky-500/30 rounded-lg p-4 mb-6">
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <p className="text-slate-400 text-sm">Treasury Balance</p>
                                <p className="text-2xl font-bold text-white">{user?.balance || 0} SOL</p>
                            </div>
                            <button
                                onClick={handleAddTestBalance}
                                className="bg-purple-500 hover:bg-purple-600 text-white text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                            >
                                🧪 Add Test (Mock)
                            </button>
                        </div>
                        {treasuryAddress && (
                            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                <p className="text-blue-200 text-xs mb-2">
                                    💡 <strong>For REAL transactions:</strong> Send devnet SOL to the treasury wallet:
                                </p>
                                <div className="flex gap-2 items-center">
                                    <code className="flex-1 bg-slate-900/50 px-2 py-1 rounded text-white text-xs break-all">
                                        {treasuryAddress}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(treasuryAddress)}
                                        className="bg-sky-500 hover:bg-sky-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p className="text-blue-200 text-xs mt-2">
                                    Get devnet SOL: <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="underline">faucet.solana.com</a>
                                </p>
                            </div>
                        )}
                    </div>
                    {user && user.balance === 0 && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <p className="text-yellow-200 text-sm">
                                ⚠️ Your gifting balance is 0. Either add test balance (mock) or fund the treasury wallet with real devnet SOL.
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
                        {selectedToken?.isNative && user && (
                            <p className="text-xs text-slate-400 mt-2">
                                Available: {user.balance} {selectedToken.symbol}
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
                        disabled={isSending || !user || user.balance === 0}
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
