import React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AnimatedIconProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  size?: number;
}

/**
 * Animated icon component with entrance and hover animations
 */
export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  children,
  delay = 0,
  className = '',
  size = 48,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const iconVariants = {
    hidden: {
      opacity: 0,
      scale: 0,
      rotate: -180,
    },
    visible: {
      opacity: 1,
      scale: 1,
      rotate: 0,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 15,
        delay,
      },
    },
  };

  const hoverProps = prefersReducedMotion
    ? {}
    : {
        whileHover: {
          scale: 1.1,
          rotate: 5,
          transition: {
            duration: 0.2,
          },
        },
      };

  return (
    <motion.div
      variants={prefersReducedMotion ? {} : iconVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      {...hoverProps}
      className={className}
      style={{ width: size, height: size }}
    >
      {children}
    </motion.div>
  );
};

