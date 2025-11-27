import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { giftService } from '../services/api';
import { Gift, GiftStatus } from '../types';
import Spinner from '../components/Spinner';
import { History, ChevronLeft, ArrowUpRight } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';

const HistoryPage: React.FC = () => {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const giftHistory = await giftService.getGiftHistory();
        setGifts(giftHistory);
      } catch (err) {
        setError('Failed to fetch gift history.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const getStatusChip = (gift: Gift) => {
    switch (gift.status) {
      case GiftStatus.SENT:
        // Check if expired but not yet refunded
        if (gift.expires_at) {
          const expiresAt = new Date(gift.expires_at);
          const isExpired = expiresAt < new Date();
          if (isExpired) {
            return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-[#7F1D1D]/20 text-[#EF4444] border-[#EF4444]/20">Expired</span>;
          }
        }
        return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20">Sent</span>;
      case GiftStatus.CLAIMED:
        return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-[#064E3B]/20 text-[#10B981] border-[#10B981]/20">Claimed</span>;
      case GiftStatus.REFUNDED:
        return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-blue-500/10 text-blue-400 border-blue-400/20">Refunded</span>;
      case GiftStatus.EXPIRED:
      case GiftStatus.EXPIRED_EMPTY:
      case GiftStatus.EXPIRED_LOW_BALANCE:
        return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-[#7F1D1D]/20 text-[#EF4444] border-[#EF4444]/20">Expired</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-bold border bg-[#1E293B]/40 text-[#94A3B8] border-white/10">{gift.status}</span>;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 animate-fade-in-up">
      <button 
        onClick={() => navigate(-1)} 
        className="flex items-center gap-2 text-[#94A3B8] hover:text-white mb-8 transition-colors"
      >
        <ChevronLeft size={20} />
        <span>Back</span>
      </button>
      
      <GlassCard>
        <div className="flex items-center gap-3 mb-8">
          <History className="text-[#BE123C]" size={24} />
          <h1 className="text-2xl font-bold text-white">Gift History</h1>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner size="8" color="border-[#06B6D4]" />
          </div>
        ) : error ? (
          <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-4 text-center">
            <p className="text-[#EF4444]">{error}</p>
          </div>
        ) : gifts.length === 0 ? (
          <p className="text-center text-[#94A3B8] py-10">You haven't sent any gifts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold uppercase text-[#64748B] border-b border-white/10">
                  <th scope="col" className="pb-4 pl-4">Recipient</th>
                  <th scope="col" className="pb-4">Amount</th>
                  <th scope="col" className="pb-4">Date</th>
                  <th scope="col" className="pb-4">Status</th>
                  <th scope="col" className="pb-4 pr-4">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map(gift => (
                  <tr key={gift.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="py-6 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{gift.recipient_email}</span>
                        {gift.has_greeting_card && (
                          <span className="bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20 px-2 py-1 rounded-full text-xs font-medium" title={`${gift.card_type ? gift.card_type.charAt(0).toUpperCase() + gift.card_type.slice(1) : 'Greeting'} Card`}>
                            🎴 Card
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-6">
                      {gift.usd_value !== null && gift.usd_value !== undefined ? (
                        <>
                          <span className="text-white font-bold">${gift.usd_value.toFixed(3)} USD</span>
                          <span className="text-[#94A3B8] text-xs ml-2">({gift.amount.toFixed(3)} {gift.token_symbol})</span>
                        </>
                      ) : (
                        <span className="text-white font-bold">{gift.amount.toFixed(3)} {gift.token_symbol}</span>
                      )}
                      {gift.has_greeting_card && gift.card_price_usd && (
                        <div className="text-xs text-[#06B6D4] mt-1">+ ${gift.card_price_usd.toFixed(2)} card</div>
                      )}
                    </td>
                    <td className="py-6 text-[#94A3B8]">
                      <div>{formatDate(gift.created_at)}</div>
                      {gift.refunded_at && (
                        <div className="text-xs text-blue-400 mt-1">Refunded: {formatDate(gift.refunded_at)}</div>
                      )}
                    </td>
                    <td className="py-6">{getStatusChip(gift)}</td>
                    <td className="py-6 pr-4">
                      {gift.status === GiftStatus.CLAIMED && gift.claim_signature && (
                        <a 
                          href={`https://solscan.io/tx/${gift.claim_signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#06B6D4] hover:text-[#0891B2] text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          View claim <ArrowUpRight size={12} />
                        </a>
                      )}
                      {gift.status === GiftStatus.REFUNDED && gift.refund_transaction_signature && (
                        <a 
                          href={`https://solscan.io/tx/${gift.refund_transaction_signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#06B6D4] hover:text-[#0891B2] text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          View refund <ArrowUpRight size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default HistoryPage;