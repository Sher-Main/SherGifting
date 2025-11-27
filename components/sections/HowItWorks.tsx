import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Sparkles, CheckCircle } from 'lucide-react';
import GlassCard from '../UI/GlassCard';

const HowItWorks: React.FC = () => {
  const steps = [
    {
      icon: Mail,
      title: 'Enter Email',
      description: 'Type their email address and choose an amount. $100 in Bitcoin, USDC, or Gold.',
    },
    {
      icon: Sparkles,
      title: 'We Magic Link It',
      description: 'They receive a premium email with a secure "Magic Link." No app download required.',
    },
    {
      icon: CheckCircle,
      title: 'They Own It',
      description: 'One click and the assets are theirs. They can hold for growth, save, or cash out instantly.',
    },
  ];

  return (
    <section id="how-it-works" className="py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 lg:mb-16"
        >
          <h2 className="text-h2 font-bold text-white mb-4">Send Wealth Like An Email</h2>
          <p className="text-body-lg text-[#94A3B8] max-w-2xl mx-auto">
            No tech skills required. If you can send a Gmail, you can send an asset.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <GlassCard className="h-full text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#BE123C] to-[#EF4444] flex items-center justify-center mb-6 shadow-lg">
                      <Icon className="text-white" size={28} />
                    </div>
                    <h3 className="text-h3 font-bold text-white mb-3">{step.title}</h3>
                    <p className="text-body text-[#94A3B8] leading-relaxed">{step.description}</p>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-3 px-6 py-4 rounded-full bg-[#FFB217]/10 border border-[#FFB217]/30">
            <CheckCircle className="text-[#FFB217]" size={20} />
            <span className="text-lg font-bold text-[#FFB217]">No wallet address required</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;

