import React from 'react';
import { LucideIcon } from 'lucide-react';

interface GlowButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'cyan' | 'gold' | 'ghost';
  className?: string;
  icon?: LucideIcon;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const GlowButton: React.FC<GlowButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  className = '',
  icon: Icon,
  fullWidth = false,
  disabled = false,
  type = 'button',
}) => {
  const base = "relative overflow-hidden transition-all duration-300 ease-out font-medium tracking-wide rounded-xl flex items-center justify-center gap-3 py-4 px-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: `bg-[#BE123C] text-white shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 border border-white/10`,
    secondary: "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20",
    ghost: "bg-transparent text-[#94A3B8] hover:text-white hover:bg-white/5",
    gold: "bg-[#F59E0B] text-[#0B1120] hover:bg-[#D97706] shadow-lg shadow-amber-500/20",
    cyan: "bg-[#06B6D4] text-white hover:bg-[#0891B2] shadow-[0_0_20px_rgba(6,182,212,0.15)]"
  };

  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className} group`}
    >
      <span className="relative z-10 flex items-center gap-2">
        {Icon && <Icon size={18} className="transition-transform group-hover:rotate-12" />}
        {children}
      </span>
      {variant === 'primary' && !disabled && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FCD34D]/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
      )}
    </button>
  );
};

export default GlowButton;

