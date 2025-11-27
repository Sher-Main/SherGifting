import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { giftService } from '../services/api';
import { GiftInfo } from '../types';
import Spinner from '../components/Spinner';
import { ProgressLoader } from '../components/ProgressLoader';
import { Gift, Check, AlertTriangle, Lock, Clock, ArrowRight, ArrowUpRight, X } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';

const ClaimPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const claimToken = searchParams.get('token');
    const { user, refreshUser, isLoading: authLoading, loadingStage } = useAuth();
    const { ready, authenticated, login } = usePrivy();
    const navigate = useNavigate();
    
    const [giftInfo, setGiftInfo] = useState<GiftInfo | null>(null);
    const [isLoadingGift, setIsLoadingGift] = useState(true);
    const [isClaiming, setIsClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimSuccess, setClaimSuccess] = useState(false);
    const [claimSignature, setClaimSignature] = useState<string | null>(null);
    const [hasAttemptedClaim, setHasAttemptedClaim] = useState(false); // Prevent retries after error
    const [emailMismatch, setEmailMismatch] = useState(false); // Track email mismatch

    // Fetch gift info on mount
    useEffect(() => {
        const fetchGiftInfo = async () => {
            if (!claimToken) {
                setError('Invalid gift link - missing claim token');
                setIsLoadingGift(false);
                return;
            }

            try {
                const info = await giftService.getGiftInfoByToken(claimToken);
                setGiftInfo(info);
            } catch (err: any) {
                console.error('Error fetching gift info:', err);
                setError(err.response?.data?.error || 'Gift not found');
            } finally {
                setIsLoadingGift(false);
            }
        };

        fetchGiftInfo();
    }, [claimToken]);

    // Helper function to check if user email matches recipient email
    const checkEmailMatch = (): boolean => {
        if (!giftInfo?.recipient_email || !user?.email) {
            return false;
        }
        
        const recipientEmail = giftInfo.recipient_email.toLowerCase().trim();
        const userEmail = user.email.toLowerCase().trim();
        const matches = recipientEmail === userEmail;
        
        console.log('📧 Email verification:', {
            recipientEmail,
            userEmail,
            matches
        });
        
        return matches;
    };

    // Auto-claim after user signs up/logs in
    useEffect(() => {
        const autoClaimGift = async () => {
            // Don't auto-claim if we've already attempted and failed
            if (hasAttemptedClaim || emailMismatch) {
                console.log('⏸️ Skipping auto-claim - already attempted or email mismatch');
                return;
            }

            console.log('🔍 Auto-claim check:', {
                authenticated,
                hasUser: !!user,
                hasWallet: !!user?.wallet_address,
                hasGiftInfo: !!giftInfo,
                giftStatus: giftInfo?.status,
                isClaiming,
                claimSuccess,
                hasAttemptedClaim,
                emailMismatch
            });
            
            // Only auto-claim if:
            // 1. User is authenticated
            // 2. User data is loaded
            // 3. Gift info is loaded
            // 4. Gift hasn't been claimed yet
            // 5. Not already in the claiming process
            // 6. Not already successfully claimed
            // 7. Claim token is available
            // 8. Email matches recipient (NEW)
            // 9. Haven't already attempted claim (NEW)
            if (authenticated && user && user.wallet_address && giftInfo && giftInfo.status === 'SENT' && !isClaiming && !claimSuccess && claimToken && !hasAttemptedClaim) {
                // Check email match BEFORE attempting claim
                if (!checkEmailMatch()) {
                    console.error('❌ Email mismatch - cannot auto-claim');
                    setEmailMismatch(true);
                    setError('This gift is not for your account. It can only be claimed by the recipient email address.');
                    return;
                }
                
                console.log('🎁 Auto-claiming gift for newly signed-in user...');
                console.log('User wallet:', user.wallet_address);
                console.log('Claim token:', claimToken.substring(0, 8) + '...');
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
    }, [authenticated, user, giftInfo, isClaiming, claimSuccess, claimToken, hasAttemptedClaim, emailMismatch]); // Trigger when auth state or user changes

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
            claimToken: claimToken?.substring(0, 8) + '...',
            userDid: user?.privy_did,
            userWallet: user?.wallet_address
        });
        
        if (!authenticated || !user || !claimToken) {
            console.error('❌ Cannot claim - missing requirements:', {
                authenticated,
                hasUser: !!user,
                hasToken: !!claimToken
            });
            return;
        }

        if (!user.wallet_address) {
            console.error('❌ User wallet address not found!');
            setError('Wallet not ready. Please refresh the page.');
            return;
        }

        // Check email match before attempting claim
        if (!checkEmailMatch()) {
            console.error('❌ Email mismatch - cannot claim');
            setEmailMismatch(true);
            setError('This gift is not for your account. It can only be claimed by the recipient email address.');
            setHasAttemptedClaim(true);
            return;
        }

        setIsClaiming(true);
        setError(null);
        setHasAttemptedClaim(true); // Mark that we've attempted claim

        try {
            console.log('🎁 Claiming gift with secure token...', { 
                claimToken: claimToken.substring(0, 8) + '...', 
                user_did: user.privy_did, 
                wallet: user.wallet_address 
            });
            
            const result = await giftService.claimGiftSecure(claimToken);

            console.log('✅ Gift claimed successfully!', result);
            setClaimSignature(result.signature);
            setClaimSuccess(true);
            
            // Refresh user to update balance
            await refreshUser();
        } catch (err: any) {
            console.error('❌ Error claiming gift:', err);
            console.error('Error details:', err.response?.data);
            
            // Handle specific error cases with clear messages
            const errorMessage = err.response?.data?.error || err.response?.data?.hint || err.message || 'Failed to claim gift. Please try again.';
            
            if (errorMessage.includes('not for you') || errorMessage.includes('email')) {
                setEmailMismatch(true);
                setError('This gift is not for your account. It can only be claimed by the recipient email address.');
            } else if (errorMessage.includes('locked')) {
                setError('This gift has been locked due to multiple failed claim attempts. Please contact support.');
            } else if (errorMessage.includes('Too many') || err.response?.status === 429) {
                setError('Too many claim attempts. Please wait 15 minutes before trying again.');
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsClaiming(false);
        }
    };

    // Show progress loader during auth loading
    if (authLoading) {
        return <ProgressLoader stage={loadingStage} />;
    }

    // Show progress loader while loading gift data
    if (!ready || isLoadingGift) {
        return <ProgressLoader stage="preparing" message="Loading your gift..." />;
    }

    if (error && !giftInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full animate-fade-in-up">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-[#7F1D1D]/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#EF4444]/20">
                            <X size={32} className="text-[#EF4444]" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Gift Not Found</h2>
                        <p className="text-[#94A3B8] mb-6">{error}</p>
                        <GlowButton
                            onClick={() => navigate('/')}
                            variant="primary"
                            fullWidth
                            icon={ArrowRight}
                        >
                            Go to Homepage
                        </GlowButton>
                    </div>
                </GlassCard>
            </div>
        );
    }

    if (claimSuccess && giftInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full animate-scale-in">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-[#064E3B]/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#10B981]/20">
                            <Check size={40} className="text-[#10B981]" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Gift Claimed! 🎉</h2>
                        <p className="text-[#94A3B8] mb-6">
                            You received <span className="text-white font-bold">{giftInfo.amount} {giftInfo.token_symbol}</span>
                        </p>

                        {/* Transaction Link */}
                        {claimSignature && (
                            <div className="bg-[#0F172A]/30 rounded-lg p-4 mb-6 border border-white/5">
                                <p className="text-[#94A3B8] text-sm mb-2">Transaction:</p>
                                <a
                                    href={`https://explorer.solana.com/tx/${claimSignature}?cluster=mainnet-beta`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#06B6D4] hover:text-[#0891B2] text-sm font-mono break-all flex items-center gap-2 justify-center"
                                >
                                    {claimSignature.slice(0, 16)}...{claimSignature.slice(-16)}
                                    <ArrowUpRight size={14} />
                                </a>
                            </div>
                        )}

                        <div className="space-y-3">
                            <GlowButton
                                onClick={() => navigate('/')}
                                variant="cyan"
                                fullWidth
                                icon={ArrowRight}
                            >
                                View Dashboard
                            </GlowButton>
                            <GlowButton
                                onClick={() => navigate('/gift')}
                                variant="primary"
                                fullWidth
                                icon={Gift}
                            >
                                Send a Gift 🎁
                            </GlowButton>
                        </div>
                    </div>
                </GlassCard>
            </div>
        );
    }

    if (!giftInfo) {
        return null;
    }

    // Show progress loader during claiming
    if (isClaiming) {
        return <ProgressLoader stage="preparing" message="Claiming your gift..." />;
    }

    // Show email mismatch error prominently
    if (emailMismatch) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full animate-fade-in-up">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-[#7F1D1D]/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#EF4444]/20">
                            <Lock size={32} className="text-[#EF4444]" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Gift Not For Your Account</h2>
                        <p className="text-white mb-2 font-medium">This gift can only be claimed by the recipient email address.</p>
                        <p className="text-[#94A3B8] text-sm mb-6">
                            If you received this link by mistake, please contact the sender.
                        </p>
                        <GlowButton
                            onClick={() => navigate('/')}
                            variant="primary"
                            fullWidth
                            icon={ArrowRight}
                        >
                            Go to Homepage
                        </GlowButton>
                    </div>
                </GlassCard>
            </div>
        );
    }

    // Check if gift is temporarily locked
    if (giftInfo.status === 'LOCKED' || (giftInfo.locked_until && giftInfo.minutes_remaining && giftInfo.minutes_remaining > 0)) {
        const minutesRemaining = giftInfo.minutes_remaining || 0;
        const hoursRemaining = Math.floor(minutesRemaining / 60);
        const minsRemaining = minutesRemaining % 60;
        
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full animate-fade-in-up">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-[#F59E0B]/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#F59E0B]/20">
                            <Lock size={32} className="text-[#F59E0B]" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Gift Temporarily Locked</h2>
                        <p className="text-[#94A3B8] mb-2">This gift has been temporarily locked due to multiple failed claim attempts.</p>
                        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg p-4 mb-6">
                            <p className="text-[#FCD34D] font-semibold text-lg mb-1">
                                {hoursRemaining > 0 
                                    ? `${hoursRemaining}h ${minsRemaining}m remaining`
                                    : `${minsRemaining} minutes remaining`
                                }
                            </p>
                            <p className="text-[#94A3B8] text-sm">You can try claiming again after the lock expires.</p>
                        </div>
                        <GlowButton
                            onClick={() => navigate('/')}
                            variant="primary"
                            fullWidth
                            icon={ArrowRight}
                        >
                            Go to Homepage
                        </GlowButton>
                    </div>
                </GlassCard>
            </div>
        );
    }

    // Check if gift is already claimed
    if (giftInfo.status === 'CLAIMED') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full animate-fade-in-up">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-[#F59E0B]/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#F59E0B]/20">
                            <AlertTriangle size={32} className="text-[#F59E0B]" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Already Claimed</h2>
                        <p className="text-[#94A3B8] mb-6">
                            This gift has already been claimed.
                        </p>
                        <GlowButton
                            onClick={() => navigate('/')}
                            variant="primary"
                            fullWidth
                            icon={ArrowRight}
                        >
                            Go to Homepage
                        </GlowButton>
                    </div>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in-up">
            <GlassCard glow className="max-w-md w-full">
                {/* Gift Preview */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-r from-[#BE123C]/20 to-[#FCD34D]/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/10">
                        <Gift size={48} className="text-[#BE123C]" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">You Have a Gift!</h2>
                    <p className="text-[#94A3B8] text-sm mb-4">
                        From <span className="text-white font-semibold">{giftInfo.sender_email}</span>
                    </p>
                    
                    {/* Gift Amount */}
                    <div className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/10 rounded-xl p-6 mb-6">
                        <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Gift Amount</p>
                        <p className="text-4xl font-bold text-white">
                            {giftInfo.amount} <span className="text-2xl text-[#06B6D4]">{giftInfo.token_symbol}</span>
                        </p>
                    </div>

                    {/* Gift Message */}
                    {giftInfo.message && (
                        <div className="bg-[#0F172A]/30 rounded-lg p-4 mb-6 border border-white/5">
                            <p className="text-[#94A3B8] text-xs mb-2">Message:</p>
                            <p className="text-white text-sm italic">"{giftInfo.message}"</p>
                        </div>
                    )}
                </div>

                {/* Claim Action */}
                {!authenticated ? (
                    <div>
                        <p className="text-[#94A3B8] text-sm text-center mb-4">
                            Sign in with your Google account to claim this gift
                        </p>
                        <GlowButton
                            onClick={handleLogin}
                            disabled={!ready}
                            variant="cyan"
                            fullWidth
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign in with Google
                        </GlowButton>
                        <p className="text-[#64748B] text-xs text-center mt-4">
                            A wallet will be automatically created for you
                        </p>
                    </div>
                ) : (
                    <div>
                        <p className="text-[#10B981] text-sm text-center mb-4 flex items-center justify-center gap-2">
                            <Check size={16} className="text-[#10B981]" />
                            Signed in as {user?.email}
                        </p>
                        
                        {error && (
                            <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-3 mb-4">
                                <p className="text-[#EF4444] text-sm">{error}</p>
                            </div>
                        )}

                        <GlowButton
                            onClick={handleClaim}
                            disabled={isClaiming}
                            variant="cyan"
                            fullWidth
                            icon={Gift}
                        >
                            {isClaiming ? (
                                <>
                                    <Spinner size="5" color="border-white" />
                                    <span>Claiming Gift...</span>
                                </>
                            ) : (
                                'Claim Gift'
                            )}
                        </GlowButton>
                    </div>
                )}
            </GlassCard>
        </div>
    );
};

export default ClaimPage;
