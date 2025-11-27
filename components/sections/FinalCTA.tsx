import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GlowButton from '../UI/GlowButton';

const FinalCTA: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleCreateGift = async () => {
    try {
      await login();
      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <section className="relative py-16 lg:py-24 overflow-hidden">
      {/* Background with holiday glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFB217]/10 via-[#BE123C]/10 to-[#06B6D4]/10 animate-gentle-pulse"></div>
      
      {/* Subtle animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#FFB217]/20 rounded-full blur-3xl animate-float-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#BE123C]/20 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '2s' }}></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="text-h2 font-bold text-white mb-6">
            Be the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#BE123C] via-[#FFB217] to-[#BE123C]">Coolest Friend</span> They Have.
          </h2>
          <p className="text-body-lg text-[#94A3B8] text-max-width mx-auto mb-8 leading-relaxed">
            Send your first gift in 60 seconds. It's free to try.
          </p>
          <div className="flex justify-center">
            <GlowButton
              onClick={handleCreateGift}
              variant="primary"
              className="text-lg px-8 py-4"
            >
              Start Gifting Now
            </GlowButton>
          </div>
          <p className="text-sm text-[#64748B] mt-6">
            No credit card required for setup.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default FinalCTA;

