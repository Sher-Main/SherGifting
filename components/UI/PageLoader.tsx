import React from 'react';
import { motion } from 'framer-motion';
import Spinner from '../Spinner';
import GlassCard from './GlassCard';

interface PageLoaderProps {
  message?: string;
  progress?: number; // 0-100
  className?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({
  message = 'Loading...',
  progress,
  className = '',
}) => {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0B1120]/90 backdrop-blur-sm ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <GlassCard className="p-8 text-center min-w-[300px]">
          <Spinner size="8" color="border-[#06B6D4]" />
          <p className="text-white font-medium mt-4 mb-2">{message}</p>
          {progress !== undefined && (
            <div className="mt-4">
              <div className="w-full bg-[#1E293B]/40 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#06B6D4] to-[#BE123C]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-[#94A3B8] text-xs mt-2">{progress}%</p>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default PageLoader;


