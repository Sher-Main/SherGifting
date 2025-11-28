import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift } from '../../types';
import { giftService } from '../../services/api';
import GlassCard from './GlassCard';
import StatusChip from './StatusChip';
import SkeletonLoader from './SkeletonLoader';
import GlowButton from './GlowButton';
import { Gift as GiftIcon, ArrowRight } from 'lucide-react';

interface RecentGiftsTimelineProps {
  maxItems?: number;
  className?: string;
}

const RecentGiftsTimeline: React.FC<RecentGiftsTimelineProps> = ({
  maxItems = 5,
  className = '',
}) => {
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGifts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const allGifts = await giftService.getGiftHistory();
        // Sort by created_at descending and take first maxItems
        const sortedGifts = allGifts
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, maxItems);
        setGifts(sortedGifts);
      } catch (err) {
        setError('Failed to load recent gifts');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGifts();
  }, [maxItems]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    // For older dates, show formatted date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const truncateEmail = (email: string, maxLength: number = 25) => {
    if (email.length <= maxLength) return email;
    return `${email.slice(0, maxLength - 3)}...`;
  };

  const handleGiftClick = (gift: Gift) => {
    navigate('/history');
  };

  return (
    <GlassCard className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GiftIcon size={18} className="text-[#BE123C]" />
            <h3 className="text-lg font-bold text-white">Recent Gifts</h3>
          </div>
          {gifts.length > 0 && (
            <button
              onClick={() => navigate('/history')}
              className="text-xs text-[#94A3B8] hover:text-white transition-colors flex items-center gap-1"
            >
              View all
              <ArrowRight size={12} />
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonLoader type="list-item" rows={3} />
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-sm text-[#EF4444]">{error}</p>
          </div>
        ) : gifts.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto bg-[#1E293B]/40 rounded-full flex items-center justify-center">
              <GiftIcon size={24} className="text-[#64748B]" />
            </div>
            <div>
              <p className="text-sm text-[#94A3B8] mb-2">No gifts sent yet</p>
              <GlowButton
                variant="cyan"
                onClick={() => navigate('/gift')}
                className="!py-2 !px-4 !text-sm"
              >
                Send Your First Gift
              </GlowButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {gifts.map((gift, index) => (
              <div
                key={gift.id}
                onClick={() => handleGiftClick(gift)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-[#06B6D4] group-hover:bg-[#BE123C] transition-colors" />
                  {index < gifts.length - 1 && (
                    <div className="w-px h-8 bg-white/10 mt-1" />
                  )}
                </div>

                {/* Gift info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-white truncate">
                      {truncateEmail(gift.recipient_email)}
                    </p>
                    <StatusChip status={gift.status} gift={gift} size="sm" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#94A3B8]">
                      {gift.amount.toFixed(4)} {gift.token_symbol}
                      {gift.usd_value && (
                        <span className="ml-1">({formatCurrency(gift.usd_value)})</span>
                      )}
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {getRelativeTime(gift.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default RecentGiftsTimeline;

