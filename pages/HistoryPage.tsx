import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { giftService } from '../services/api';
import { Gift, GiftStatus } from '../types';
import { motion } from 'framer-motion';
import { History, ChevronLeft, ArrowUpRight, Gift as GiftIcon, Mail, Copy, Calendar, DollarSign } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import StatusChip from '../components/UI/StatusChip';
import SearchBar from '../components/UI/SearchBar';
import FilterChips from '../components/UI/FilterChips';
import SortDropdown, { SortDirection } from '../components/UI/SortDropdown';
import ViewToggle from '../components/UI/ViewToggle';
import EmptyState from '../components/UI/EmptyState';
import GiftDetailsModal from '../components/UI/GiftDetailsModal';
import SkeletonLoader from '../components/UI/SkeletonLoader';
import PageHeader from '../components/UI/PageHeader';
import { useToast } from '../components/UI/ToastContainer';
import GlowButton from '../components/UI/GlowButton';

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

type SortField = 'date' | 'amount' | 'status' | 'recipient';

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const { getAccessToken } = usePrivy();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gifts' | 'transactions'>('gifts');
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [showGiftModal, setShowGiftModal] = useState(false);

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

  // Filter and sort gifts
  const filteredAndSortedGifts = useMemo(() => {
    let filtered = [...gifts];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (gift) =>
          gift.recipient_email.toLowerCase().includes(query) ||
          gift.amount.toString().includes(query) ||
          gift.token_symbol.toLowerCase().includes(query) ||
          (gift.message && gift.message.toLowerCase().includes(query))
      );
    }

    // Apply status filters
    if (statusFilters.length > 0) {
      filtered = filtered.filter((gift) => {
        const status = gift.status;
        // Handle expired SENT gifts
        if (status === GiftStatus.SENT && gift.expires_at) {
          const isExpired = new Date(gift.expires_at) < new Date();
          const effectiveStatus = isExpired ? GiftStatus.EXPIRED : status;
          return statusFilters.includes(effectiveStatus);
        }
        return statusFilters.includes(status);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'amount':
          comparison = (a.usd_value || a.amount) - (b.usd_value || b.amount);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'recipient':
          comparison = a.recipient_email.localeCompare(b.recipient_email);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [gifts, searchQuery, statusFilters, sortField, sortDirection]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    transactions.forEach((tx) => {
      const txDate = new Date(tx.completedAt || tx.createdAt || new Date().toISOString());
      let groupKey: string;

      if (txDate >= today) {
        groupKey = 'Today';
      } else if (txDate >= yesterday) {
        groupKey = 'Yesterday';
      } else if (txDate >= thisWeek) {
        groupKey = 'This Week';
      } else {
        groupKey = 'Older';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(tx);
    });

    return groups;
  }, [transactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  };

  const handleGiftClick = (gift: Gift) => {
    setSelectedGift(gift);
    setShowGiftModal(true);
  };

  const handleCopyLink = async (gift: Gift) => {
    const claimUrl = `${window.location.origin}${gift.tiplink_url}`;
    try {
      await navigator.clipboard.writeText(claimUrl);
      showToast({
        type: 'success',
        message: 'Claim link copied!',
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: 'Failed to copy link',
      });
    }
  };

  const handleResendEmail = (gift: Gift) => {
    const subject = encodeURIComponent('You received a crypto gift!');
    const body = encodeURIComponent(`You've received a gift! Claim it here: ${window.location.origin}${gift.tiplink_url}`);
    window.open(`mailto:${gift.recipient_email}?subject=${subject}&body=${body}`);
  };

  // Status filter options with counts
  const statusFilterOptions = useMemo(() => {
    const counts: { [key: string]: number } = {};
    gifts.forEach((gift) => {
      let status = gift.status;
      if (status === GiftStatus.SENT && gift.expires_at) {
        const isExpired = new Date(gift.expires_at) < new Date();
        status = isExpired ? GiftStatus.EXPIRED : status;
      }
      counts[status] = (counts[status] || 0) + 1;
    });

    return [
      { value: GiftStatus.SENT, label: 'Sent', count: counts[GiftStatus.SENT] || 0 },
      { value: GiftStatus.CLAIMED, label: 'Claimed', count: counts[GiftStatus.CLAIMED] || 0 },
      { value: GiftStatus.EXPIRED, label: 'Expired', count: counts[GiftStatus.EXPIRED] || 0 },
      { value: GiftStatus.REFUNDED, label: 'Refunded', count: counts[GiftStatus.REFUNDED] || 0 },
    ];
  }, [gifts]);

  const sortOptions = [
    { value: 'date', label: 'Date' },
    { value: 'amount', label: 'Amount' },
    { value: 'status', label: 'Status' },
    { value: 'recipient', label: 'Recipient' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 animate-fade-in-up">
      <PageHeader
        title="Gift & Transaction History"
        subtitle="View all your sent gifts and account activity"
        breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'History' }]}
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('gifts')}
          className={`px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'gifts'
              ? 'bg-[#BE123C] text-white shadow-lg'
              : 'bg-[#1E293B]/60 text-[#94A3B8] hover:bg-[#1E293B]/80 border border-white/10'
          }`}
        >
          Gifts ({gifts.length})
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'transactions'
              ? 'bg-[#BE123C] text-white shadow-lg'
              : 'bg-[#1E293B]/60 text-[#94A3B8] hover:bg-[#1E293B]/80 border border-white/10'
          }`}
        >
          Transactions ({transactions.length})
        </button>
      </div>

      {activeTab === 'gifts' ? (
        <div className="space-y-6">
          {/* Search and Filters */}
          <GlassCard>
            <div className="space-y-4">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by recipient, amount, or message..."
                className="w-full"
              />
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <FilterChips
                  options={statusFilterOptions}
                  selected={statusFilters}
                  onChange={setStatusFilters}
                  showCount={true}
                  className="flex-1"
                />
                
                <div className="flex items-center gap-3">
                  <SortDropdown
                    options={sortOptions}
                    value={sortField}
                    direction={sortDirection}
                    onChange={(value, direction) => {
                      setSortField(value as SortField);
                      setSortDirection(direction);
                    }}
                  />
                  <ViewToggle
                    viewMode={viewMode}
                    onViewChange={setViewMode}
                    storageKey="history_view_preference"
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Gift List */}
          <GlassCard>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonLoader key={index} type="list-item" />
                ))}
              </div>
            ) : error ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-center text-[#EF4444] px-6">{error}</p>
              </div>
            ) : filteredAndSortedGifts.length === 0 ? (
              <EmptyState
                icon={GiftIcon}
                title={searchQuery || statusFilters.length > 0 ? "No gifts found" : "No gifts sent yet"}
                description={
                  searchQuery || statusFilters.length > 0
                    ? "Try adjusting your search or filters"
                    : "Send your first gift to see it here!"
                }
                action={
                  !searchQuery && statusFilters.length === 0
                    ? {
                        label: 'Send a Gift',
                        onClick: () => navigate('/gift'),
                      }
                    : undefined
                }
              />
            ) : viewMode === 'list' ? (
              <div className="space-y-3">
                {filteredAndSortedGifts.map((gift, index) => (
                  <motion.div
                    key={gift.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleGiftClick(gift)}
                    className="p-5 rounded-xl border border-white/10 hover:border-[#BE123C]/30 hover:bg-white/5 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#BE123C]/20 to-[#06B6D4]/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-lg">
                            {gift.recipient_email.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Gift Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-bold truncate">{gift.recipient_email}</p>
                            {gift.has_greeting_card && (
                              <span className="bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0">
                                🎴 Card
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {gift.usd_value !== null && gift.usd_value !== undefined ? (
                              <>
                                <span className="text-white font-bold">{formatCurrency(gift.usd_value)}</span>
                                <span className="text-[#94A3B8]">{gift.amount.toFixed(4)} {gift.token_symbol}</span>
                              </>
                            ) : (
                              <span className="text-white font-bold">{gift.amount.toFixed(4)} {gift.token_symbol}</span>
                            )}
                            <span className="text-[#64748B]">•</span>
                            <span className="text-[#94A3B8]">{getRelativeTime(gift.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status and Actions */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <StatusChip status={gift.status} gift={gift} />
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyLink(gift);
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            aria-label="Copy claim link"
                          >
                            <Copy size={16} className="text-[#94A3B8]" />
                          </button>
                          {gift.status === GiftStatus.SENT && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResendEmail(gift);
                              }}
                              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                              aria-label="Resend email"
                            >
                              <Mail size={16} className="text-[#94A3B8]" />
                            </button>
                          )}
                          {gift.claim_signature && (
                            <a
                              href={`https://solscan.io/tx/${gift.claim_signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                              aria-label="View transaction"
                            >
                              <ArrowUpRight size={16} className="text-[#94A3B8]" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedGifts.map((gift, index) => (
                  <motion.div
                    key={gift.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleGiftClick(gift)}
                    className="p-5 rounded-xl border border-white/10 hover:border-[#BE123C]/30 hover:bg-white/5 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col gap-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#BE123C]/20 to-[#06B6D4]/20 border border-white/10 flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {gift.recipient_email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <StatusChip status={gift.status} gift={gift} size="sm" />
                      </div>

                      {/* Recipient */}
                      <div>
                        <p className="text-white font-bold text-sm mb-1 truncate">{gift.recipient_email}</p>
                        <p className="text-[#94A3B8] text-xs">{getRelativeTime(gift.created_at)}</p>
                      </div>

                      {/* Amount */}
                      <div>
                        {gift.usd_value !== null && gift.usd_value !== undefined ? (
                          <>
                            <p className="text-white font-bold text-xl">{formatCurrency(gift.usd_value)}</p>
                            <p className="text-[#94A3B8] text-sm">{gift.amount.toFixed(4)} {gift.token_symbol}</p>
                          </>
                        ) : (
                          <p className="text-white font-bold text-xl">{gift.amount.toFixed(4)} {gift.token_symbol}</p>
                        )}
                      </div>

                      {/* Card Badge */}
                      {gift.has_greeting_card && (
                        <div className="bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20 px-2 py-1 rounded-full text-xs font-medium inline-block w-fit">
                          🎴 Greeting Card
                        </div>
                      )}

                      {/* Message Preview */}
                      {gift.message && (
                        <p className="text-[#94A3B8] text-xs italic line-clamp-2">"{gift.message}"</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      ) : (
        <div className="space-y-6">
          <GlassCard>
            {isLoadingTransactions ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonLoader key={index} type="list-item" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No transactions yet"
                description="Your transaction history will appear here once you add funds or send gifts."
              />
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedTransactions)
                  .sort(([a], [b]) => {
                    const order = ['Today', 'Yesterday', 'This Week', 'Older'];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map(([groupKey, groupTransactions]) => (
                    <div key={groupKey}>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3 flex items-center gap-2">
                        <Calendar size={14} />
                        {groupKey}
                      </h3>
                      <div className="space-y-2">
                        {groupTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="p-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  tx.type === 'onramp' 
                                    ? 'bg-[#10B981]/20' 
                                    : 'bg-[#06B6D4]/20'
                                }`}>
                                  {tx.type === 'onramp' ? '💰' : tx.isFree ? '🎁' : '💳'}
                                </div>
                                <div>
                                  <p className="text-white font-medium">
                                    {tx.type === 'onramp' ? 'Added Funds' : 'Card Transfer'}
                                  </p>
                                  <p className="text-[#94A3B8] text-sm">{formatDate(tx.completedAt || tx.createdAt || new Date().toISOString())}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                {tx.type === 'onramp' ? (
                                  <p className="text-white font-bold">+{formatCurrency(tx.amountFiat || 0)}</p>
                                ) : (
                                  <p className={tx.isFree ? 'text-[#10B981] font-bold' : 'text-white font-bold'}>
                                    {tx.isFree ? 'FREE' : formatCurrency(tx.amountCharged || 0)}
                                  </p>
                                )}
                                {tx.creditIssued && (
                                  <p className="text-[#10B981] text-xs mt-1">✨ $5 Credit</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* Gift Details Modal */}
      <GiftDetailsModal
        isOpen={showGiftModal}
        onClose={() => {
          setShowGiftModal(false);
          setSelectedGift(null);
        }}
        gift={selectedGift}
      />
    </div>
  );
};

export default HistoryPage;
