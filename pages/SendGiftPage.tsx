'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PendingGift } from '../lib/giftStore';
import { savePendingGift, loadPendingGift, updatePendingGift } from '../lib/giftStore';
import { ProgressBar } from '../components/send/ProgressBar';
import { RecipientStep } from '../components/send/RecipientStep';
import { TokenStep } from '../components/send/TokenStep';
import { AmountStep } from '../components/send/AmountStep';
import { MessageStep } from '../components/send/MessageStep';
import { PreviewModal } from '../components/send/PreviewModal';
import { ArrowLeftIcon } from '../components/icons';

export type GiftFlowStep = 'recipient' | 'token' | 'amount' | 'message' | 'preview';

export const SendGiftPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<GiftFlowStep>('recipient');
  const [giftData, setGiftData] = useState<Partial<PendingGift>>({});

  // Load from localStorage on mount
  useEffect(() => {
    const pending = loadPendingGift();
    if (pending) {
      // Ensure amount is set correctly if bundle exists
      if (pending.bundle && (!pending.amount || pending.amount === 0)) {
        pending.amount = pending.bundle.totalUsdValue;
        updatePendingGift({ amount: pending.amount });
      }
      
      setGiftData(pending);
      
      // Check if we're coming back from /send/confirm (user might have navigated back)
      // If so, don't restore step - let them continue from where they were
      const currentPath = window.location.pathname;
      if (currentPath === '/send') {
        // If bundle is already selected, skip token step
        if (pending.bundle) {
          // Bundle selected from home page - skip token and amount steps
          if (pending.recipient && pending.message !== undefined) {
            setStep('preview');
          } else if (pending.recipient) {
            setStep('message');
          } else {
            setStep('recipient');
          }
        } else {
          // No bundle - normal flow (user clicked "Send Gift" button)
          if (pending.recipient && pending.token && pending.amount && pending.token === 'SOL') {
            // Custom SOL amount selected
            if (pending.message !== undefined) {
              setStep('preview');
            } else {
              setStep('message');
            }
          } else if (pending.recipient && pending.token && pending.token === 'SOL') {
            // Custom SOL selected but no amount yet
            setStep('amount');
          } else if (pending.recipient && pending.token) {
            // Other token selected
            setStep('amount');
          } else if (pending.recipient) {
            // Show token step to allow bundle or custom selection
            setStep('token');
          }
        }
      }
    }
  }, []);

  // Progress to next step
  const handleNext = (stepData: Partial<PendingGift>) => {
    const updatedData = { ...giftData, ...stepData };
    setGiftData(updatedData);
    
    // Save to localStorage on each step
    if (step === 'recipient') {
      savePendingGift({
        recipient: updatedData.recipient!,
        recipientType: updatedData.recipientType!,
        token: updatedData.bundle ? updatedData.bundle.id : '',
        amount: updatedData.bundle ? updatedData.bundle.totalUsdValue : 0,
        bundle: updatedData.bundle,
        message: undefined,
      });
      // If bundle is selected, skip token and amount steps
      if (updatedData.bundle) {
        setStep('message');
      } else {
        setStep('token');
      }
    } else if (step === 'token') {
      // When bundle is selected, ensure amount is set to bundle's totalUsdValue
      const amountToSave = updatedData.bundle ? updatedData.bundle.totalUsdValue : updatedData.amount || 0;
      updatePendingGift({ 
        token: updatedData.token!, 
        bundle: updatedData.bundle,
        amount: amountToSave
      });
      // Update local state with amount
      if (updatedData.bundle) {
        updatedData.amount = updatedData.bundle.totalUsdValue;
        setGiftData(updatedData);
      }
      // If bundle is selected, skip amount step
      if (updatedData.bundle) {
        setStep('message');
      } else if (updatedData.token === 'SOL') {
        // Custom SOL selected - go to amount step
        setStep('amount');
      } else {
        setStep('amount');
      }
    } else if (step === 'amount') {
      updatePendingGift({ amount: updatedData.amount! });
      setStep('message');
    } else if (step === 'message') {
      updatePendingGift({ message: updatedData.message });
      setStep('preview');
    }
  };

  // Go back to previous step
  const handleBack = () => {
    if (step === 'preview') {
      setStep('message');
    } else if (step === 'message') {
      // If bundle is selected, skip amount step
      if (giftData.bundle) {
        setStep('recipient');
      } else {
        setStep('amount');
      }
    } else if (step === 'amount') {
      setStep('token');
    } else if (step === 'token') {
      setStep('recipient');
    }
  };

  // User confirms preview - save to localStorage and redirect to auth
  const handleConfirm = () => {
    // Ensure all data is saved
    const completeData: Omit<PendingGift, 'timestamp' | 'expiresAt'> = {
      recipient: giftData.recipient!,
      recipientType: giftData.recipientType!,
      token: giftData.token!,
      amount: giftData.amount!,
      message: giftData.message,
      bundle: giftData.bundle,
    };
    
    savePendingGift(completeData);
    
    // Redirect to auth-required confirmation page
    navigate('/send/confirm');
  };

  return (
    <div className="min-h-screen bg-slate-900 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        {/* Progress indicator */}
        <ProgressBar currentStep={step} />
        
        {/* Step content */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg p-8 mt-8">
          {step === 'recipient' && (
            <RecipientStep 
              initialValue={giftData.recipient}
              initialRecipientType={giftData.recipientType}
              onNext={handleNext}
            />
          )}
          
          {step === 'token' && !giftData.bundle && (
            <TokenStep 
              initialValue={giftData.token}
              initialBundle={giftData.bundle}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {step === 'amount' && !giftData.bundle && (
            <AmountStep 
              selectedToken={giftData.token!}
              initialValue={giftData.amount}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {step === 'message' && (
            <MessageStep 
              initialValue={giftData.message}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          
          {step === 'preview' && (
            <PreviewModal 
              giftData={giftData as PendingGift}
              onConfirm={handleConfirm}
              onBack={handleBack}
            />
          )}
        </div>
        
        {/* Security badge */}
        <div className="text-center mt-8 text-sm text-slate-500">
          🔒 Secured by <a href="https://sher-app.vercel.app/home" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline">Sher</a>
        </div>
      </div>
    </div>
  );
};

export default SendGiftPage;

