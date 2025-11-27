import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { giftService } from '../services/api';
import { Gift, GiftStatus } from '../types';
import Spinner from '../components/Spinner';
import { ArrowLeftIcon } from '../components/icons';

interface Transaction {
  id: string;
  type: 'onramp' | 'card';
  amountFiat?: number;
  creditIssued?: boolean;
  completedAt?: string;
  status?: string;
  isFree?: boolean;
  amountCharged?: number;
  createdAt?: string;
}

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const { getAccessToken } = usePrivy();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gifts' | 'transactions'>('gifts');
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

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user?.privy_did) return;

      setIsLoadingTransactions(true);
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/users/me/transaction-history', {
          headers: {
            'Authorization': `Bearer ${token || ''}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch transaction history');
        }

        const data = await response.json();
        setTransactions(data);
        console.log(`📜 Loaded ${data.length} transactions`);
      } catch (err) {
        console.error('Error fetching transaction history:', err);
      } finally {
        setIsLoadingTransactions(false);
      }
    };
    fetchTransactions();
  }, [user?.privy_did, getAccessToken]);

  const getStatusChip = (gift: Gift) => {
    switch (gift.status) {
      case GiftStatus.SENT:
        // Check if expired but not yet refunded
        if (gift.expires_at) {
          const expiresAt = new Date(gift.expires_at);
          const isExpired = expiresAt < new Date();
          if (isExpired) {
            return <span className="px-2 py-1 text-xs font-medium text-orange-300 bg-orange-900/50 rounded-full">Expired</span>;
          }
        }
        return <span className="px-2 py-1 text-xs font-medium text-yellow-300 bg-yellow-900/50 rounded-full">Sent</span>;
      case GiftStatus.CLAIMED:
        return <span className="px-2 py-1 text-xs font-medium text-green-300 bg-green-900/50 rounded-full">Claimed</span>;
      case GiftStatus.REFUNDED:
        return <span className="px-2 py-1 text-xs font-medium text-blue-300 bg-blue-900/50 rounded-full">Refunded</span>;
      case GiftStatus.EXPIRED:
      case GiftStatus.EXPIRED_EMPTY:
      case GiftStatus.EXPIRED_LOW_BALANCE:
        return <span className="px-2 py-1 text-xs font-medium text-red-300 bg-red-900/50 rounded-full">Expired</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium text-slate-300 bg-slate-700/50 rounded-full">{gift.status}</span>;
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
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h1 className="text-3xl font-bold">History</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('gifts')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'gifts'
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Gifts
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'transactions'
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Transactions
              </button>
            </div>
          </div>

          {activeTab === 'gifts' ? (
            <>
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
                            <th scope="col" className="px-6 py-3">Transaction</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {gifts.map(gift => (
                            <tr key={gift.id} className="hover:bg-slate-800 transition-colors">
                                <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <span>{gift.recipient_email}</span>
                                        {gift.has_greeting_card && (
                                            <span className="px-2 py-1 text-xs font-medium text-purple-300 bg-purple-900/50 rounded-full" title={`${gift.card_type ? gift.card_type.charAt(0).toUpperCase() + gift.card_type.slice(1) : 'Greeting'} Card`}>
                                                🎴 Card
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {gift.usd_value !== null && gift.usd_value !== undefined ? (
                                        <>
                                            <span className="text-white font-semibold">${gift.usd_value.toFixed(3)} USD</span>
                                            <span className="text-slate-400 text-sm ml-2">({gift.amount.toFixed(3)} {gift.token_symbol})</span>
                                        </>
                                    ) : (
                                        <span className="text-white">{gift.amount.toFixed(3)} {gift.token_symbol}</span>
                                    )}
                                    {gift.has_greeting_card && gift.card_price_usd && (
                                        <div className="text-xs text-purple-400 mt-1">+ ${gift.card_price_usd.toFixed(2)} card</div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-300">
                                    <div>{formatDate(gift.created_at)}</div>
                                    {gift.refunded_at && (
                                        <div className="text-xs text-blue-400 mt-1">Refunded: {formatDate(gift.refunded_at)}</div>
                                    )}
                                </td>
                                <td className="px-6 py-4">{getStatusChip(gift)}</td>
                                <td className="px-6 py-4">
                                    {gift.status === GiftStatus.CLAIMED && gift.claim_signature && (
                                        <a 
                                            href={`https://solscan.io/tx/${gift.claim_signature}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sky-400 hover:text-sky-300 text-xs"
                                        >
                                            View claim ↗
                                        </a>
                                    )}
                                    {gift.status === GiftStatus.REFUNDED && gift.refund_transaction_signature && (
                                        <a 
                                            href={`https://solscan.io/tx/${gift.refund_transaction_signature}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 text-xs"
                                        >
                                            View refund ↗
                                        </a>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          )}
            </>
          ) : (
            <>
              {isLoadingTransactions ? (
                <div className="flex justify-center items-center h-64">
                  <Spinner />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-center text-slate-400 py-10">No transactions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-800">
                      <tr>
                        <th scope="col" className="px-6 py-3">Type</th>
                        <th scope="col" className="px-6 py-3">Amount</th>
                        <th scope="col" className="px-6 py-3">Date</th>
                        <th scope="col" className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800 transition-colors">
                          <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                            {tx.type === 'onramp' ? (
                              <div className="flex items-center gap-2">
                                <span>💰 Added Funds (MoonPay)</span>
                                {tx.creditIssued && (
                                  <span className="px-2 py-1 text-xs font-medium text-green-300 bg-green-900/50 rounded-full">
                                    ✨ $5 Credit
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span>{tx.isFree ? '🎁' : '💳'} Card Transfer</span>
                                {tx.isFree && (
                                  <span className="px-2 py-1 text-xs font-medium text-green-300 bg-green-900/50 rounded-full">
                                    FREE
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {tx.type === 'onramp' ? (
                              <span className="text-white font-semibold">
                                +${tx.amountFiat?.toFixed(2) || '0.00'}
                              </span>
                            ) : (
                              <span className={tx.isFree ? 'text-green-400 font-semibold' : 'text-white'}>
                                {tx.isFree ? 'FREE' : `$${tx.amountCharged?.toFixed(2) || '0.00'}`}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            {formatDate(tx.completedAt || tx.createdAt || new Date().toISOString())}
                          </td>
                          <td className="px-6 py-4">
                            {tx.type === 'onramp' ? (
                              <span className="px-2 py-1 text-xs font-medium text-green-300 bg-green-900/50 rounded-full">
                                ✓ Completed
                              </span>
                            ) : (
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                tx.isFree
                                  ? 'text-green-300 bg-green-900/50'
                                  : 'text-slate-300 bg-slate-700/50'
                              }`}>
                                {tx.isFree ? '💚 On Us' : 'Charged'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
};

export default HistoryPage;