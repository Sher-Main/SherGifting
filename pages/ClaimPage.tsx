
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { giftService } from '../services/api';
import { Gift } from '../types';
import Spinner from '../components/Spinner';
import { CheckCircleIcon, GiftIcon, XCircleIcon } from '../components/icons';

const ClaimPage: React.FC = () => {
    const { tipLinkId } = useParams<{ tipLinkId: string }>();
    const navigate = useNavigate();
    const { user, isAuthenticated, login, isLoading: isAuthLoading } = useAuth();
    const [gift, setGift] = useState<Gift | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClaiming, setIsClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimStatus, setClaimStatus] = useState<'idle' | 'success' | 'error'>('idle');

    useEffect(() => {
        const fetchGiftInfo = async () => {
            if (!tipLinkId) {
                setError("Invalid gift link.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const fetchedGift = await giftService.getGiftByTipLinkId(tipLinkId);
                if (fetchedGift) {
                    setGift(fetchedGift);
                } else {
                    setError("This gift could not be found or has already been claimed.");
                }
            } catch (err) {
                setError("An error occurred while fetching gift information.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchGiftInfo();
    }, [tipLinkId]);

    const handleClaim = async () => {
        if (!tipLinkId || !user) return;
        setIsClaiming(true);
        setError(null);
        try {
            const result = await giftService.claimGift(tipLinkId, user.wallet_address);
            if (result.success) {
                setClaimStatus('success');
            } else {
                setError("Failed to claim gift. It might have been claimed already.");
                setClaimStatus('error');
            }
        } catch(err) {
            setError("An unexpected error occurred during the claim process.");
            setClaimStatus('error');
        } finally {
            setIsClaiming(false);
        }
    };
    
    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Spinner /></div>;
    }
    
    if (claimStatus === 'success') {
        return (
            <div className="text-center bg-slate-800/50 border border-slate-700 rounded-2xl p-8 max-w-md mx-auto">
                <CheckCircleIcon className="w-20 h-20 text-green-400 mx-auto mb-4"/>
                <h2 className="text-3xl font-bold mb-2">Gift Claimed!</h2>
                <p className="text-slate-300 mb-6">{gift?.amount} {gift?.token_symbol} has been added to your wallet.</p>
                <button onClick={() => navigate('/')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-6 rounded-lg transition-colors">Go to My Portfolio</button>
            </div>
        );
    }
    
    if (claimStatus === 'error' || error) {
        return (
            <div className="text-center bg-slate-800/50 border border-slate-700 rounded-2xl p-8 max-w-md mx-auto">
                <XCircleIcon className="w-20 h-20 text-red-400 mx-auto mb-4"/>
                <h2 className="text-3xl font-bold mb-2">Claim Failed</h2>
                <p className="text-slate-300 mb-6">{error}</p>
                <button onClick={() => navigate('/')} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-6 rounded-lg transition-colors">Go Home</button>
            </div>
        );
    }

    if (!gift) return null;

    return (
        <div className="text-center bg-slate-800/50 border border-slate-700 rounded-2xl p-8 max-w-md mx-auto">
            <GiftIcon className="w-16 h-16 text-sky-400 mx-auto mb-4"/>
            <h1 className="text-3xl font-bold mb-2">You've received a gift!</h1>
            <p className="text-slate-300 mb-6">Someone sent you <span className="font-bold text-white">{gift.amount} {gift.token_symbol}</span>.</p>
            {gift.message && (
                <blockquote className="border-l-4 border-slate-600 pl-4 text-left italic text-slate-400 my-6">
                    "{gift.message}"
                </blockquote>
            )}

            {isAuthenticated ? (
                <button
                    onClick={handleClaim}
                    disabled={isClaiming}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-800 text-white font-bold py-3 px-4 rounded-lg transition-colors flex justify-center items-center text-lg"
                >
                    {isClaiming ? <><Spinner size="6" /> <span className="ml-2">Claiming...</span></> : `Claim Your Gift`}
                </button>
            ) : (
                <>
                    <p className="text-slate-400 mb-4">Sign in or create an account to claim your gift.</p>
                    <button
                        onClick={login}
                        disabled={isAuthLoading}
                        className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-800 text-white font-bold py-3 px-4 rounded-lg transition-colors flex justify-center items-center text-lg"
                    >
                        {isAuthLoading ? <><Spinner size="6" /> <span className="ml-2">Connecting...</span></> : 'Sign In to Claim'}
                    </button>
                </>
            )}
        </div>
    );
};

export default ClaimPage;
