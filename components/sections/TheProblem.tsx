import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import GlassCard from '../UI/GlassCard';

const TheProblem: React.FC = () => {
  const problems = [
    {
      title: "The 'Lost Card' Problem",
      description: "30% of gift cards are never redeemed.",
    },
    {
      title: "The 'Setup' Headache",
      description: "Download this app, scan this code...",
    },
  ];

  return (
    <section className="py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <h2 className="text-h2 font-bold text-white leading-tight">
              The "Old Way" <br /> is <span className="text-[#BE123C]">Broken.</span>
            </h2>
            <p className="text-body-lg text-[#94A3B8] leading-relaxed">
              You spend $50 on an Amazon gift card. They lose it in a drawer. Or you send cash via Venmo, and it gets eaten by inflation. It's boring, forgettable, and shrinking in value.
            </p>

            <div className="space-y-4">
              {problems.map((problem, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                >
                  <GlassCard className="group hover:border-[#BE123C]/20 transition-colors duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#0F172A] flex items-center justify-center text-[#BE123C] shrink-0 border border-white/10 group-hover:border-[#BE123C]/50 transition-colors">
                        <X size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-white mb-1 group-hover:text-[#BE123C]/80 transition-colors">
                          {problem.title}
                        </h4>
                        <p className="text-sm text-[#64748B]">{problem.description}</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Column - Visual Metaphor */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="relative h-[400px] lg:h-[500px] w-full"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-[#BE123C]/10 to-transparent rounded-full blur-[80px] pointer-events-none" />
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [0, 1, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative h-full"
            >
              <GlassCard className="h-full flex flex-col items-center justify-center text-center relative">
                {/* Floating garbage cards */}
                <motion.div
                  animate={{ y: [0, 10, 0], rotate: [-2, -5, -2] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-20 left-10 p-4 bg-[#1E293B]/60 border border-white/5 rounded-xl opacity-50 backdrop-blur-sm"
                >
                  <div className="w-20 h-2 bg-[#64748B] rounded mb-2"/>
                  <div className="w-10 h-2 bg-[#475569] rounded"/>
                </motion.div>
                
                <motion.div
                  animate={{ y: [0, -15, 0], rotate: [2, 5, 2] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute bottom-20 right-10 p-4 bg-[#1E293B]/60 border border-white/5 rounded-xl opacity-50 backdrop-blur-sm"
                >
                  <div className="w-16 h-2 bg-[#64748B] rounded mb-2"/>
                  <div className="w-8 h-2 bg-[#475569] rounded"/>
                </motion.div>

                {/* Static gradient background */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#BE123C]/10 to-transparent rounded-3xl pointer-events-none" />
                
                <div className="relative z-10 space-y-2">
                  <div className="text-6xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#94A3B8] to-[#64748B] relative">
                    $50.00
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-2 bg-[#BE123C] rotate-[-12deg] opacity-80" />
                    </div>
                  </div>
                  <p className="text-[#64748B] font-mono text-sm uppercase tracking-widest pt-4">
                    Value: Expired
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TheProblem;

