import React from 'react';
import { motion } from 'framer-motion';
import { Clock, ShieldCheck } from 'lucide-react';
import GlassCard from '../UI/GlassCard';

const RiskReversal: React.FC = () => {
  return (
    <section className="relative py-16 lg:py-24 overflow-hidden">
      {/* Static gradient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#10B981]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          whileHover={{ scale: 1.01 }}
          className="relative"
        >
          <GlassCard className="p-12 relative overflow-hidden" glow>
            {/* Decorative ShieldCheck icon in background */}
            <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 transform translate-x-10 -translate-y-10 pointer-events-none">
              <ShieldCheck size={240} className="text-[#10B981]" />
            </div>

            <div className="relative z-10">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#10B981]/10 text-[#10B981] rounded-lg font-bold mb-8 border border-[#10B981]/20">
                <Clock className="w-5 h-5" />
                The 48-Hour Guarantee
              </div>

              {/* Headline */}
              <h2 className="text-h2 font-bold text-white mb-8">
                What if they don't open it?
              </h2>

              {/* Description */}
              <p className="text-body-lg text-[#94A3B8] mb-10 max-w-2xl leading-relaxed">
                We know the fear: "I send money, and it disappears into the void." <br />
                <br />
                <strong className="text-white">Not here.</strong> If your friend doesn't claim their gift within 48 hours, the money is{' '}
                <span className="text-white font-bold border-b border-[#10B981]/50 mx-1">
                  automatically refunded
                </span>{' '}
                to your account.
              </p>

              {/* Trust Indicator */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#10B981] flex items-center justify-center text-[#0B1120]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-lg text-white font-bold">Zero Risk Guarantee</p>
                  <p className="text-sm text-[#64748B]">
                    Either they get the gift, or you get your money back.
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
};

export default RiskReversal;

