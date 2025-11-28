import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, Copy } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: (id: string) => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 5000,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };

  const styles = {
    success: 'bg-[#064E3B]/20 border-[#10B981]/20 text-[#10B981]',
    error: 'bg-[#7F1D1D]/20 border-[#EF4444]/20 text-[#EF4444]',
    info: 'bg-[#1E3A8A]/20 border-[#3B82F6]/20 text-[#3B82F6]',
  };

  const Icon = icons[type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`
        flex items-center gap-3 p-4 rounded-xl border backdrop-blur-xl
        ${styles[type]}
        shadow-lg min-w-[300px] max-w-md
      `}
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={20} className="flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      
      <div className="flex items-center gap-2">
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors flex items-center gap-1"
          >
            {actionLabel === 'Copy' && <Copy size={12} />}
            {actionLabel}
          </button>
        )}
        <button
          onClick={() => onDismiss(id)}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
};

export default Toast;


