import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { giftService } from '../services/api';
import { GiftInfo } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import Spinner from '../components/Spinner';
import { ProgressLoader } from '../components/ProgressLoader';
import { Gift, Check, AlertTriangle, Lock, Clock, ArrowRight, ArrowUpRight, X, Sparkles, Mail } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import { triggerConfetti } from '../lib/confetti';
import Stepper from '../components/UI/Stepper';

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
    const [claimStep, setClaimStep] = useState<1 | 2 | 3>(1); // 1: Authenticate, 2: Claiming, 3: Success

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
        setClaimStep(2); // Move to claiming step

        try {
            console.log('🎁 Claiming gift with secure token...', { 
                claimToken: claimToken.substring(0, 8) + '...', 
                user_did: user.privy_did, 
                wallet: user.wallet_address 
            });
            
            const result = await giftService.claimGiftSecure(claimToken);

            console.log('✅ Gift claimed successfully!', result);
            setClaimSignature(result.signature);
            setClaimStep(3);
            setClaimSuccess(true);
            
            // Trigger confetti animation
            triggerConfetti();
            
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
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, type: 'spring' }}
                    className="w-full max-w-2xl"
                >
                    <GlassCard className="animate-scale-in">
                        <div className="text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                                className="w-24 h-24 bg-gradient-to-br from-[#10B981]/20 to-[#06B6D4]/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 border-[#10B981]/30"
                            >
                                <Sparkles size={48} className="text-[#10B981]" />
                            </motion.div>
                            <motion.h2
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-4xl font-bold text-white mb-3"
                            >
                                Gift Claimed! 🎉
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="text-[#94A3B8] mb-2 text-lg"
                            >
                                You received
                            </motion.p>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.5, type: 'spring' }}
                                className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/10 rounded-xl p-6 mb-6 inline-block"
                            >
                                <p className="text-5xl font-bold text-white">
                                    {giftInfo.amount} <span className="text-3xl text-[#06B6D4]">{giftInfo.token_symbol}</span>
                                </p>
                            </motion.div>

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
    if (isClaiming && claimStep === 2) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <GlassCard className="max-w-md w-full">
                    <div className="text-center">
                        <Stepper currentStep={2} completedSteps={[1]} />
                        <div className="mt-8">
                            <Spinner size="8" color="border-[#06B6D4]" />
                            <p className="text-white font-medium mt-4">Claiming your gift...</p>
                            <p className="text-[#94A3B8] text-sm mt-2">This may take a few moments</p>
                        </div>
                    </div>
                </GlassCard>
            </div>
        );
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
            <div className="w-full max-w-2xl">
                <GlassCard glow className="w-full">
                    {/* Progress Stepper */}
                    {!authenticated && (
                        <div className="mb-8">
                            <Stepper currentStep={1} completedSteps={[]} />
                        </div>
                    )}

                    {/* Gift Preview */}
                    <div className="text-center mb-8">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.5 }}
                            className="w-24 h-24 bg-gradient-to-br from-[#BE123C]/20 via-[#FCD34D]/20 to-[#06B6D4]/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 border-white/10 shadow-lg"
                        >
                            <Gift size={56} className="text-[#BE123C]" />
                        </motion.div>
                        <h2 className="text-3xl font-bold text-white mb-2">You Have a Gift! 🎁</h2>
                        <p className="text-[#94A3B8] text-base mb-6">
                            From <span className="text-white font-semibold">{giftInfo.sender_email}</span>
                        </p>
                        
                        {/* Enhanced Gift Amount Display */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#1E293B] border-2 border-white/10 rounded-2xl p-8 mb-6 shadow-xl"
                        >
                            <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-3 font-bold">Gift Amount</p>
                            <p className="text-5xl font-bold text-white mb-2">
                                {giftInfo.amount} <span className="text-3xl text-[#06B6D4]">{giftInfo.token_symbol}</span>
                            </p>
                            {giftInfo.created_at && (
                                <p className="text-xs text-[#64748B] mt-2">
                                    Sent {new Date(giftInfo.created_at).toLocaleDateString()}
                                </p>
                            )}
                        </motion.div>

                        {/* Enhanced Gift Message */}
                        {giftInfo.message && (
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="bg-[#0F172A]/40 rounded-xl p-6 mb-6 border border-white/10 text-left"
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <Mail size={16} className="text-[#06B6D4]" />
                                    <p className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider">Message</p>
                                </div>
                                <p className="text-white text-base italic leading-relaxed">"{giftInfo.message}"</p>
                            </motion.div>
                        )}
                    </div>

                    {/* Claim Action */}
                    {!authenticated ? (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                        >
                            <p className="text-[#94A3B8] text-base text-center mb-6">
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
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                <div className="mb-6">
                                    <Stepper currentStep={2} completedSteps={[1]} />
                                </div>
                                
                                <div className="bg-[#064E3B]/20 border border-[#10B981]/20 rounded-xl p-4 mb-6">
                                    <p className="text-[#10B981] text-sm text-center flex items-center justify-center gap-2 font-medium">
                                        <Check size={18} className="text-[#10B981]" />
                                        Signed in as {user?.email}
                                    </p>
                                </div>
                                
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-xl p-4 mb-6"
                                    >
                                        <p className="text-[#EF4444] text-sm">{error}</p>
                                    </motion.div>
                                )}

                                <GlowButton
                                    onClick={handleClaim}
                                    disabled={isClaiming}
                                    variant="cyan"
                                    fullWidth
                                    icon={Gift}
                                    className="!py-4 !text-lg"
                                >
                                    {isClaiming ? (
                                        <>
                                            <Spinner size="6" color="border-white" />
                                            <span>Claiming Gift...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Gift size={20} />
                                            <span>Claim Gift</span>
                                        </>
                                    )}
                                </GlowButton>
                            </motion.div>
                        )}
                    </GlassCard>
                </div>
            </div>
        );
};

export default ClaimPage;
