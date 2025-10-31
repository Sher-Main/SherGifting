import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { giftService } from '../services/api';
import { GiftInfo } from '../types';
import Spinner from '../components/Spinner';

const ClaimPage: React.FC = () => {
    const { giftId } = useParams<{ giftId: string }>();
    const { user, refreshUser } = useAuth();
    const { ready, authenticated, login } = usePrivy();
    const navigate = useNavigate();
    
    const [giftInfo, setGiftInfo] = useState<GiftInfo | null>(null);
    const [isLoadingGift, setIsLoadingGift] = useState(true);
    const [isClaiming, setIsClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimSuccess, setClaimSuccess] = useState(false);
    const [claimSignature, setClaimSignature] = useState<string | null>(null);

    // Fetch gift info on mount
    useEffect(() => {
        const fetchGiftInfo = async () => {
            if (!giftId) {
                setError('Invalid gift link');
                setIsLoadingGift(false);
                return;
            }

            try {
                const info = await giftService.getGiftInfo(giftId);
                setGiftInfo(info);
            } catch (err: any) {
                console.error('Error fetching gift info:', err);
                setError(err.response?.data?.error || 'Gift not found');
            } finally {
                setIsLoadingGift(false);
            }
        };

        fetchGiftInfo();
    }, [giftId]);

    // Auto-claim after user signs up/logs in
    useEffect(() => {
        const autoClaimGift = async () => {
            console.log('🔍 Auto-claim check:', {
                authenticated,
                hasUser: !!user,
                hasWallet: !!user?.wallet_address,
                hasGiftInfo: !!giftInfo,
                giftStatus: giftInfo?.status,
                isClaiming,
                claimSuccess
            });
            
            // Only auto-claim if:
            // 1. User is authenticated
            // 2. User data is loaded
            // 3. Gift info is loaded
            // 4. Gift hasn't been claimed yet
            // 5. Not already in the claiming process
            // 6. Not already successfully claimed
            if (authenticated && user && user.wallet_address && giftInfo && giftInfo.status === 'SENT' && !isClaiming && !claimSuccess) {
                console.log('🎁 Auto-claiming gift for newly signed-in user...');
                console.log('User wallet:', user.wallet_address);
                console.log('Gift ID:', giftId);
                handleClaim();
            } else {
                console.log('⏸️ Auto-claim conditions not met');
            }
        };

        // Small delay to ensure user data is fully loaded
        const timer = setTimeout(() => {
            autoClaimGift();
        }, 1000);

        return () => clearTimeout(timer);
    }, [authenticated, user, giftInfo, isClaiming, claimSuccess]); // Trigger when auth state or user changes

    const handleLogin = async () => {
        try {
            await login();
        } catch (err: any) {
            console.error('Login error:', err);
            setError('Failed to sign in. Please try again.');
        }
    };

    const handleClaim = async () => {
        console.log('🎯 handleClaim called', { 
            authenticated, 
            hasUser: !!user, 
            giftId,
            userDid: user?.privy_did,
            userWallet: user?.wallet_address
        });
        
        if (!authenticated || !user || !giftId) {
            console.error('❌ Cannot claim - missing requirements:', {
                authenticated,
                hasUser: !!user,
                giftId
            });
            return;
        }

        if (!user.wallet_address) {
            console.error('❌ User wallet address not found!');
            setError('Wallet not ready. Please refresh the page.');
            return;
        }

        setIsClaiming(true);
        setError(null);

        try {
            console.log('🎁 Claiming gift...', { giftId, user_did: user.privy_did, wallet: user.wallet_address });
            
            const result = await giftService.claimGift(giftId, {
                recipient_did: user.privy_did,
                recipient_wallet: user.wallet_address,
            });

            console.log('✅ Gift claimed successfully!', result);
            setClaimSignature(result.signature);
            setClaimSuccess(true);
            
            // Refresh user to update balance
            await refreshUser();
        } catch (err: any) {
            console.error('❌ Error claiming gift:', err);
            console.error('Error details:', err.response?.data);
            setError(err.response?.data?.error || err.message || 'Failed to claim gift. Please try again.');
        } finally {
            setIsClaiming(false);
        }
    };

    if (!ready || isLoadingGift) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spinner />
            </div>
        );
    }

    if (error && !giftInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="bg-slate-800/50 border border-red-500/30 rounded-2xl p-8 shadow-lg max-w-md w-full">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Gift Not Found</h2>
                        <p className="text-slate-400 mb-6">{error}</p>
                        <button
                            onClick={() => navigate('/')}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            Go to Homepage
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (claimSuccess && giftInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg max-w-md w-full">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Gift Claimed! 🎉</h2>
                        <p className="text-slate-400 mb-6">
                            You received <span className="text-white font-bold">{giftInfo.amount} {giftInfo.token_symbol}</span>
                        </p>

                        {/* Transaction Link */}
                        {claimSignature && (
                            <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                                <p className="text-slate-400 text-sm mb-2">Transaction:</p>
                                <a
                                    href={`https://explorer.solana.com/tx/${claimSignature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sky-400 hover:text-sky-300 text-sm font-mono break-all"
                                >
                                    {claimSignature.slice(0, 16)}...{claimSignature.slice(-16)}
                                </a>
                            </div>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={() => navigate('/')}
                                className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white font-bold py-3 px-4 rounded-lg transition-all"
                            >
                                View Dashboard
                            </button>
                            <button
                                onClick={() => navigate('/gift')}
                                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                            >
                                Send a Gift 🎁
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!giftInfo) {
        return null;
    }

    // Check if gift is already claimed
    if (giftInfo.status === 'CLAIMED') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="bg-slate-800/50 border border-yellow-500/30 rounded-2xl p-8 shadow-lg max-w-md w-full">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Already Claimed</h2>
                        <p className="text-slate-400 mb-6">
                            This gift has already been claimed.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            Go to Homepage
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg max-w-md w-full">
                {/* Gift Preview */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl">🎁</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">You Have a Gift!</h2>
                    <p className="text-slate-400 text-sm mb-4">
                        From <span className="text-white font-semibold">{giftInfo.sender_email}</span>
                    </p>
                    
                    {/* Gift Amount */}
                    <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border border-sky-500/30 rounded-lg p-6 mb-4">
                        <p className="text-slate-400 text-sm mb-1">Gift Amount</p>
                        <p className="text-4xl font-bold text-white">
                            {giftInfo.amount} <span className="text-2xl text-sky-400">{giftInfo.token_symbol}</span>
                        </p>
                    </div>

                    {/* Gift Message */}
                    {giftInfo.message && (
                        <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                            <p className="text-slate-400 text-xs mb-2">Message:</p>
                            <p className="text-white text-sm italic">"{giftInfo.message}"</p>
                        </div>
                    )}
                </div>

                {/* Claim Action */}
                {!authenticated ? (
                    <div>
                        <p className="text-slate-400 text-sm text-center mb-4">
                            Sign in with your Google account to claim this gift
                        </p>
                        <button
                            onClick={handleLogin}
                            disabled={!ready}
                            className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign in with Google
                        </button>
                        <p className="text-slate-500 text-xs text-center mt-4">
                            A wallet will be automatically created for you
                        </p>
                    </div>
                ) : (
                    <div>
                        <p className="text-green-400 text-sm text-center mb-4 flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Signed in as {user?.email}
                        </p>
                        
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleClaim}
                            disabled={isClaiming}
                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                            {isClaiming ? (
                                <>
                                    <Spinner size="5" color="border-white" />
                                    <span>Claiming Gift...</span>
                                </>
                            ) : (
                                <>
                                    <span>🎁 Claim Gift</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClaimPage;
