import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';

interface TourStep {
  id: string;
  target: string; // CSS selector or ref
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete?: () => void;
  onSkip?: () => void;
  storageKey?: string;
  enabled?: boolean;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps,
  onComplete,
  onSkip,
  storageKey = 'onboarding_tour_completed',
  enabled = true,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    // Check if tour was already completed
    const completed = localStorage.getItem(storageKey);
    if (completed === 'true') {
      return;
    }

    // Start tour after a short delay
    const timer = setTimeout(() => {
      setIsVisible(true);
      updateTargetElement();
    }, 1000);

    return () => clearTimeout(timer);
  }, [enabled, storageKey]);

  useEffect(() => {
    if (isVisible && currentStep < steps.length) {
      updateTargetElement();
    }
  }, [currentStep, isVisible, steps]);

  const updateTargetElement = () => {
    if (currentStep >= steps.length) return;

    const step = steps[currentStep];
    const element = document.querySelector(step.target) as HTMLElement;

    if (element) {
      setTargetElement(element);
      updateOverlay(element);
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const updateOverlay = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const padding = 10;

    setOverlayStyle({
      top: `${rect.top - padding}px`,
      left: `${rect.left - padding}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
    });
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onSkip?.();
  };

  const handleComplete = () => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onComplete?.();
  };

  if (!isVisible || currentStep >= steps.length || !targetElement) {
    return null;
  }

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  // Calculate tooltip position
  const rect = targetElement.getBoundingClientRect();
  const tooltipPosition = step.position || 'bottom';
  let tooltipStyle: React.CSSProperties = {};

  switch (tooltipPosition) {
    case 'top':
      tooltipStyle = {
        bottom: `${window.innerHeight - rect.top + 20}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
      };
      break;
    case 'bottom':
      tooltipStyle = {
        top: `${rect.bottom + 20}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
      };
      break;
    case 'left':
      tooltipStyle = {
        top: `${rect.top + rect.height / 2}px`,
        right: `${window.innerWidth - rect.left + 20}px`,
        transform: 'translateY(-50%)',
      };
      break;
    case 'right':
      tooltipStyle = {
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.right + 20}px`,
        transform: 'translateY(-50%)',
      };
      break;
    case 'center':
      tooltipStyle = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
      break;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Overlay with spotlight */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#0B1120]/90 backdrop-blur-sm"
            onClick={handleNext}
            style={{ pointerEvents: 'auto' }}
          >
            {/* Spotlight cutout */}
            <div
              className="absolute rounded-xl border-2 border-[#06B6D4] shadow-[0_0_0_9999px_rgba(11,17,32,0.9)]"
              style={overlayStyle}
            />
          </motion.div>

          {/* Tooltip */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 max-w-sm"
            style={tooltipStyle}
          >
            <GlassCard className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#06B6D4] mb-1">
                    Step {currentStep + 1} of {steps.length}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-[#94A3B8] text-sm">{step.content}</p>
                </div>
                <button
                  onClick={handleSkip}
                  className="ml-4 p-1 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Skip tour"
                >
                  <X size={20} className="text-[#94A3B8]" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {!isFirst && (
                    <button
                      onClick={handlePrevious}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      aria-label="Previous step"
                    >
                      <ChevronLeft size={18} className="text-white" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Progress dots */}
                  <div className="flex items-center gap-1.5">
                    {steps.map((_, index) => (
                      <div
                        key={index}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentStep
                            ? 'bg-[#06B6D4] w-6'
                            : index < currentStep
                            ? 'bg-[#10B981]'
                            : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>

                  <GlowButton
                    variant="primary"
                    onClick={isLast ? handleComplete : handleNext}
                    className="!py-2 !px-4 !text-sm"
                  >
                    {isLast ? 'Get Started' : 'Next'}
                    {!isLast && <ChevronRight size={16} />}
                  </GlowButton>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTour;


