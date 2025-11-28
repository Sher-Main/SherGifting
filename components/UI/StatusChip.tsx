import React from 'react';
import { GiftStatus, Gift } from '../../types';

interface StatusChipProps {
  status: GiftStatus;
  gift?: Gift; // Optional gift object to check expiration
  size?: 'sm' | 'md';
  className?: string;
}

const StatusChip: React.FC<StatusChipProps> = ({
  status,
  gift,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
  };

  // Check if SENT status gift is actually expired
  const isExpired = status === GiftStatus.SENT && gift?.expires_at
    ? new Date(gift.expires_at) < new Date()
    : false;

  const getStatusStyles = () => {
    if (isExpired) {
      return 'bg-[#7F1D1D]/20 text-[#EF4444] border-[#EF4444]/20';
    }
    
    switch (status) {
      case GiftStatus.SENT:
        return 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20';
      case GiftStatus.CLAIMED:
        return 'bg-[#064E3B]/20 text-[#10B981] border-[#10B981]/20';
      case GiftStatus.REFUNDED:
        return 'bg-blue-500/10 text-blue-400 border-blue-400/20';
      case GiftStatus.EXPIRED:
      case GiftStatus.EXPIRED_EMPTY:
      case GiftStatus.EXPIRED_LOW_BALANCE:
        return 'bg-[#7F1D1D]/20 text-[#EF4444] border-[#EF4444]/20';
      default:
        return 'bg-[#1E293B]/40 text-[#94A3B8] border-white/10';
    }
  };

  const getStatusText = () => {
    if (isExpired) return 'Expired';
    if (status === GiftStatus.CLAIMED) return 'Claimed';
    if (status === GiftStatus.REFUNDED) return 'Refunded';
    if (status === GiftStatus.EXPIRED || status === GiftStatus.EXPIRED_EMPTY || status === GiftStatus.EXPIRED_LOW_BALANCE) return 'Expired';
    return 'Sent';
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border ${sizeClasses[size]} ${getStatusStyles()} ${className}`}
    >
      {getStatusText()}
    </span>
  );
};

export default StatusChip;

