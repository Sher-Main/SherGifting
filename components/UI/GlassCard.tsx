import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  padding?: string;
  variant?: 'default' | 'gift' | 'balance';
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  glow = false,
  padding = "p-6",
  variant = 'default'
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'gift':
        return {
          background: 'bg-[#1E293B]/60',
          border: 'border border-white/10',
          decoration: 'before:absolute before:inset-0 before:border-t-2 before:border-[#BE123C]/30 before:rounded-t-3xl',
          glow: 'bg-gradient-to-br from-[#BE123C]/5 via-[#06B6D4]/5 to-transparent'
        };
      case 'balance':
        return {
          background: 'bg-gradient-to-br from-[#1E293B]/70 to-[#0F172A]/70',
          border: 'border border-white/10',
          decoration: '',
          glow: 'bg-gradient-to-br from-[#FCD34D]/10 to-transparent'
        };
      default:
        return {
          background: 'bg-[#1E293B]/60',
          border: 'border border-white/10',
          decoration: '',
          glow: 'bg-gradient-to-br from-[#FCD34D]/5 to-transparent'
        };
    }
  };

  const styles = getVariantStyles();
  const shouldShowGlow = glow || variant === 'gift' || variant === 'balance';

  return (
    <div className={`relative ${styles.background} backdrop-blur-xl ${styles.border} shadow-2xl rounded-3xl overflow-hidden ${className}`}>
      <div className="absolute inset-0 border border-white/5 rounded-3xl pointer-events-none" />
      {variant === 'gift' && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#BE123C]/40 via-[#06B6D4]/40 to-[#BE123C]/40 rounded-t-3xl" />
      )}
      {shouldShowGlow && (
        <div className={`absolute inset-0 ${styles.glow} opacity-50 pointer-events-none`} />
      )}
      <div className={`relative z-10 ${padding}`}>
        {children}
      </div>
    </div>
  );
};

export default GlassCard;

