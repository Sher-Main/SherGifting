import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AnimatedGradientProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Animated gradient background component with subtle movement
 */
export const AnimatedGradient: React.FC<AnimatedGradientProps> = ({ 
  className = '', 
  children 
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 -z-10 will-change-[background-position]"
        animate={
          prefersReducedMotion
            ? {}
            : {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }
        }
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #334155 50%, #1e293b 75%, #0f172a 100%)',
          backgroundSize: '200% 200%',
        }}
      />
      
      {/* Additional gradient overlay for depth */}
      <motion.div
        className="absolute inset-0 -z-10 opacity-30 will-change-[background-position]"
        animate={
          prefersReducedMotion
            ? {}
            : {
                backgroundPosition: ['100% 50%', '0% 50%', '100% 50%'],
              }
        }
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          background: 'radial-gradient(circle at 30% 50%, rgba(56, 189, 248, 0.1) 0%, transparent 50%)',
          backgroundSize: '200% 200%',
        }}
      />
      
      {children}
    </motion.div>
  );
};

