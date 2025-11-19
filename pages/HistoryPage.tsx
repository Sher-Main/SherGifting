import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { giftService } from '../services/api';
import { Gift, GiftStatus } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';

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

  const getStatusChip = (status: GiftStatus) => {
    switch (status) {
      case GiftStatus.SENT:
        return <span className="px-2 py-1 text-xs font-medium text-yellow-300 bg-yellow-900/50 rounded-full">Sent</span>;
      case GiftStatus.CLAIMED:
        return <span className="px-2 py-1 text-xs font-medium text-green-300 bg-green-900/50 rounded-full">Claimed</span>;
      case GiftStatus.EXPIRED:
        return <span className="px-2 py-1 text-xs font-medium text-red-300 bg-red-900/50 rounded-full">Expired</span>;
      default:
        return null;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
     <div className="animate-fade-in">
        <button 
            onClick={() => navigate(-1)} 
            className="mb-4 text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors font-medium"
        >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back</span>
        </button>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg">
          <h1 className="text-3xl font-bold p-6 border-b border-slate-700">Gift History</h1>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Spinner />
            </div>
          ) : error ? (
            <p className="text-center text-red-400 py-10">{error}</p>
          ) : gifts.length === 0 ? (
            <p className="text-center text-slate-400 py-10">You haven't sent any gifts yet.</p>
          ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-800">
                        <tr>
                            <th scope="col" className="px-6 py-3">Recipient</th>
                            <th scope="col" className="px-6 py-3">Amount</th>
                            <th scope="col" className="px-6 py-3">Date</th>
                            <th scope="col" className="px-6 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {gifts.map(gift => (
                            <tr key={gift.id} className="hover:bg-slate-800 transition-colors">
                                <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{gift.recipient_email}</td>
                                <td className="px-6 py-4">
                                    {gift.usd_value !== null && gift.usd_value !== undefined ? (
                                        <>
                                            <span className="text-white font-semibold">${gift.usd_value.toFixed(3)} USD</span>
                                            <span className="text-slate-400 text-sm ml-2">({gift.amount.toFixed(3)} {gift.token_symbol})</span>
                                        </>
                                    ) : (
                                        <span className="text-white">{gift.amount.toFixed(3)} {gift.token_symbol}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-300">{formatDate(gift.created_at)}</td>
                                <td className="px-6 py-4">{getStatusChip(gift.status)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          )}
        </div>
    </div>
  );
};

export default HistoryPage;