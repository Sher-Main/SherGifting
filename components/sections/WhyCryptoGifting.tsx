import React from 'react';
import { motion } from 'framer-motion';
import { Link2, Sparkles, Gift, Building2 } from 'lucide-react';
import GlassCard from '../UI/GlassCard';

const WhyCryptoGifting: React.FC = () => {
  const benefits = [
    {
      icon: Link2,
      title: 'No awkward wallet addresses',
      description: 'Send gifts using email or phone. Recipients claim without needing to share complex wallet addresses.',
    },
    {
      icon: Sparkles,
      title: "Works even if they're new to crypto",
      description: 'Perfect for introducing friends and family to crypto. Privy handles wallet creation automatically.',
    },
    {
      icon: Gift,
      title: 'Designed for holidays',
      description: 'Add holiday notes, choose festive themes, and schedule sends. Make every gift feel special.',
    },
    {
      icon: Building2,
      title: 'Built on Sher design system',
      description: "Crafted with attention to detail, using Sher's proven design patterns and security standards.",
    },
  ];

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
          <h2 className="text-h2 font-bold text-white mb-4">Why CryptoGifting?</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group"
              >
                <GlassCard className="h-full transition-all duration-300 hover:scale-[1.02] hover:border-[#FFB217]/30">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFB217] to-[#D97706] flex items-center justify-center mb-6 shadow-lg group-hover:rotate-6 transition-transform duration-300">
                      <Icon className="text-[#0B1120]" size={28} />
                    </div>
                    <h3 className="text-h3 font-bold text-white mb-3">{benefit.title}</h3>
                    <p className="text-body text-[#94A3B8] leading-relaxed">{benefit.description}</p>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WhyCryptoGifting;
