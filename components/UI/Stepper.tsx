import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface StepperProps {
  currentStep: 1 | 2 | 3 | 4;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
}

const steps = [
  { number: 1, label: 'Who', description: 'Recipient' },
  { number: 2, label: 'What', description: 'Token + Amount' },
  { number: 3, label: 'Personalize', description: 'Card + Message' },
  { number: 4, label: 'Review', description: 'Summary' },
];

const Stepper: React.FC<StepperProps> = ({
  currentStep,
  completedSteps,
  onStepClick,
}) => {
  const getStepState = (stepNumber: number) => {
    if (completedSteps.includes(stepNumber)) return 'completed';
    if (currentStep === stepNumber) return 'active';
    return 'pending';
  };

  const canClickStep = (stepNumber: number) => {
    return completedSteps.includes(stepNumber) && onStepClick;
  };

  return (
    <div className="w-full mb-8" role="progressbar" aria-label="Gift sending progress" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={4}>
      <div className="flex items-center justify-between relative">
        {/* Connector line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-white/10 -z-10">
          <motion.div
            className="h-full bg-[#06B6D4]"
            initial={{ width: '0%' }}
            animate={{
              width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          />
        </div>

        {steps.map((step, index) => {
          const state = getStepState(step.number);
          const isClickable = canClickStep(step.number);

          return (
            <div
              key={step.number}
              className="flex flex-col items-center flex-1 relative"
            >
              {/* Step circle */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.number)}
                disabled={!isClickable}
                aria-label={`Step ${step.number}: ${step.description}`}
                aria-current={state === 'active' ? 'step' : undefined}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  font-bold text-sm transition-all duration-300
                  ${state === 'completed'
                    ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                    : state === 'active'
                    ? 'bg-[#06B6D4] text-white shadow-lg shadow-[#06B6D4]/30 ring-4 ring-[#06B6D4]/20'
                    : 'bg-[#1E293B] text-[#64748B] border-2 border-white/10'
                  }
                  ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {state === 'completed' ? (
                  <Check size={20} className="text-white" />
                ) : (
                  step.number
                )}
              </button>

              {/* Step label */}
              <div className="mt-2 text-center">
                <div
                  className={`
                    text-xs font-bold uppercase tracking-wider
                    ${state === 'active'
                      ? 'text-[#06B6D4]'
                      : state === 'completed'
                      ? 'text-[#10B981]'
                      : 'text-[#64748B]'
                    }
                  `}
                >
                  {step.label}
                </div>
                <div
                  className={`
                    text-[10px] mt-0.5
                    ${state === 'active' ? 'text-white' : 'text-[#94A3B8]'}
                  `}
                >
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Stepper;


