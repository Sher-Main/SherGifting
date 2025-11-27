import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  padding?: string;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  glow = false,
  padding = "p-6"
}) => {
  return (
    <div className={`relative bg-[#1E293B]/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl overflow-hidden ${className}`}>
      <div className="absolute inset-0 border border-white/5 rounded-3xl pointer-events-none" />
      {glow && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#FCD34D]/5 to-transparent opacity-50 pointer-events-none" />
      )}
      <div className={`relative z-10 ${padding}`}>
        {children}
      </div>
    </div>
  );
};

export default GlassCard;

