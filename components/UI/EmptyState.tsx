import React from 'react';
import { LucideIcon } from 'lucide-react';
import GlowButton from './GlowButton';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-20 h-20 rounded-full bg-[#1E293B]/40 border border-white/10 flex items-center justify-center mb-6">
        <Icon size={40} className="text-[#64748B]" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-[#94A3B8] text-sm max-w-md mb-6">{description}</p>
      {action && (
        <GlowButton variant="cyan" onClick={action.onClick}>
          {action.label}
        </GlowButton>
      )}
    </div>
  );
};

export default EmptyState;


