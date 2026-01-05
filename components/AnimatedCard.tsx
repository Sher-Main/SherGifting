import React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AnimatedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  delay?: number;
  hoverScale?: number;
  className?: string;
  whileInView?: MotionProps['whileInView'];
}

/**
 * Reusable animated card component with hover effects and scroll animations
 */
export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  delay = 0,
  hoverScale = 1.02,
  className = '',
  whileInView,
  ...props
}) => {
  const prefersReducedMotion = useReducedMotion();

  const defaultWhileInView = {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay,
      ease: 'easeOut',
    },
  };

  const hoverProps = prefersReducedMotion
    ? {}
    : {
        whileHover: {
          scale: hoverScale,
          y: -4,
          transition: {
            duration: 0.2,
            ease: 'easeOut',
          },
        },
        whileTap: {
          scale: 0.98,
        },
      };

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={whileInView || defaultWhileInView}
      viewport={{ once: true, margin: '-50px' }}
      {...hoverProps}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

