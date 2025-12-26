import React from 'react';
import { GiftFlowStep } from '../../pages/SendGiftPage';

interface ProgressBarProps {
  currentStep: GiftFlowStep;
}

const steps: { key: GiftFlowStep; label: string }[] = [
  { key: 'recipient', label: 'Recipient' },
  { key: 'token', label: 'Token' },
  { key: 'amount', label: 'Amount' },
  { key: 'message', label: 'Message' },
  { key: 'preview', label: 'Preview' },
];

export const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep }) => {
  const currentIndex = steps.findIndex(s => s.key === currentStep);
  
  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        
        return (
          <div key={step.key} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all
                  ${isCompleted ? 'bg-sky-500 text-white' : ''}
                  ${isCurrent ? 'bg-sky-500 text-white ring-4 ring-sky-500/20' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-slate-700 text-slate-400' : ''}
                `}
              >
                {isCompleted ? '✓' : index + 1}
              </div>
              <span className={`text-xs mt-2 ${isCurrent ? 'font-semibold text-white' : 'text-slate-500'}`}>
                {step.label}
              </span>
            </div>
            
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div 
                className={`
                  flex-1 h-1 mx-2 transition-colors
                  ${isCompleted ? 'bg-sky-500' : 'bg-slate-700'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

