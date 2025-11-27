import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, TrendingUp, Globe, X, Gift, ArrowRight } from 'lucide-react';
import GlassCard from '../UI/GlassCard';

const Comparison: React.FC = () => {
  const [activeComparison, setActiveComparison] = useState<'giftcards' | 'cash' | 'stocks'>('giftcards');

  const tabs = [
    {
      id: 'giftcards' as const,
      label: 'Vs. Gift Cards',
      sub: 'The restrictive option',
      icon: CreditCard,
    },
    {
      id: 'cash' as const,
      label: 'Vs. Cash / Venmo',
      sub: 'The boring option',
      icon: TrendingUp,
    },
    {
      id: 'stocks' as const,
      label: 'Vs. Stocks',
      sub: 'The complicated option',
      icon: Globe,
    },
  ];

  const comparisons = {
    giftcards: {
      title: 'The Gift Card Trap',
      icon: CreditCard,
      iconColor: 'text-[#BE123C]',
      iconBg: 'from-[#BE123C]/20 to-transparent',
      iconBorder: 'border-[#BE123C]/20',
      problems: [
        'Locked to one specific store',
        'Expires or gets lost in a drawer',
        'Zero potential for growth',
      ],
      solution: {
        title: 'The Crypto Gifting Way',
        description: 'Universal value. Swap, save, or spend. Potential to grow.',
      },
    },
    cash: {
      title: 'The Inflation Problem',
      icon: TrendingUp,
      iconColor: 'text-[#10B981]',
      iconBg: 'from-[#10B981]/20 to-transparent',
      iconBorder: 'border-[#10B981]/20',
      problems: [
        'Cash loses 3-7% purchasing power yearly',
        'Boring—feels like a "transaction"',
        'No educational value',
      ],
      solution: {
        title: 'The Crypto Gifting Way',
        description: 'Give assets that appreciate. You\'re giving a future, not just funds.',
      },
    },
    stocks: {
      title: 'The Setup Nightmare',
      icon: Globe,
      iconColor: 'text-[#FFB217]',
      iconBg: 'from-[#FFB217]/20 to-transparent',
      iconBorder: 'border-[#FFB217]/20',
      problems: [
        'Requires Social Security Numbers',
        'Days of KYC/Identity verification',
        'Intimidating for beginners',
      ],
      solution: {
        title: 'The Crypto Gifting Way',
        description: 'Instant. No SSN to receive. As easy as opening an email.',
      },
    },
  };

  const currentComparison = comparisons[activeComparison];

  return (
    <section className="py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 lg:mb-16"
        >
          <h2 className="text-h2 font-bold text-white mb-4">Why Smart People Gift Assets</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Navigation */}
          <div className="md:col-span-4 space-y-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeComparison === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveComparison(tab.id)}
                  className={`w-full text-left p-6 rounded-2xl border transition-all duration-200 group ${
                    isActive
                      ? 'bg-white text-[#0B1120] border-white shadow-[0_0_30px_-10px_rgba(255,255,255,0.3)] scale-[1.02]'
                      : 'bg-[#1E293B]/60 backdrop-blur-xl border-white/10 text-[#94A3B8] hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg mb-1">{tab.label}</h3>
                      <p
                        className={`text-sm transition-colors ${
                          isActive ? 'text-[#64748B]' : 'text-[#64748B]'
                        }`}
                      >
                        {tab.sub}
                      </p>
                    </div>
                    {isActive && <ArrowRight className="w-5 h-5 text-[#0B1120]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dynamic Display */}
          <div className="md:col-span-8">
            <GlassCard className="p-10 md:p-14 flex flex-col justify-center relative overflow-hidden min-h-[400px]">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#06B6D4]/10 blur-[100px] rounded-full pointer-events-none" />

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeComparison}
                  initial={{ opacity: 0, x: 10, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -10, filter: 'blur(5px)' }}
                  transition={{ duration: 0.3, ease: 'circOut' }}
                  className="relative z-10"
                >
                  <div className="space-y-8">
                    <div className="flex items-center gap-6 mb-8">
                      <div
                        className={`w-16 h-16 bg-gradient-to-br ${currentComparison.iconBg} border ${currentComparison.iconBorder} rounded-2xl flex items-center justify-center ${currentComparison.iconColor} shadow-lg`}
                      >
                        <currentComparison.icon size={32} />
                      </div>
                      <h3 className="text-4xl font-bold text-white">{currentComparison.title}</h3>
                    </div>

                    <ul className="space-y-5">
                      {currentComparison.problems.map((problem, index) => (
                        <li key={index} className="flex items-center gap-4 text-lg text-[#CBD5E1]">
                          <X className="text-[#BE123C] w-6 h-6 flex-shrink-0" />
                          <span>{problem}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />

                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-[#06B6D4]/20 rounded-xl flex items-center justify-center text-[#06B6D4]">
                        <Gift size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xl mb-1">
                          {currentComparison.solution.title}
                        </h4>
                        <p className="text-[#94A3B8]">{currentComparison.solution.description}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </GlassCard>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Comparison;

