import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Mail, ArrowUpRight, ExternalLink } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import StatusChip from './StatusChip';
import { Gift } from '../../types';
import { useToast } from './ToastContainer';

interface GiftDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gift: Gift | null;
}

const GiftDetailsModal: React.FC<GiftDetailsModalProps> = ({
  isOpen,
  onClose,
  gift,
}) => {
  const { showToast } = useToast();

  if (!isOpen || !gift) return null;

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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  const handleCopyLink = async () => {
    const claimUrl = `${window.location.origin}${gift.tiplink_url}`;
    try {
      await navigator.clipboard.writeText(claimUrl);
      showToast({
        type: 'success',
        message: 'Claim link copied to clipboard!',
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: 'Failed to copy link',
      });
    }
  };

  const handleResendEmail = () => {
    const subject = encodeURIComponent('You received a crypto gift!');
    const body = encodeURIComponent(`You've received a gift! Claim it here: ${window.location.origin}${gift.tiplink_url}`);
    window.open(`mailto:${gift.recipient_email}?subject=${subject}&body=${body}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gift-details-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl"
          >
            <GlassCard className="relative max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 id="gift-details-modal-title" className="text-2xl font-bold text-white">
                  Gift Details
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  aria-label="Close modal"
                >
                  <X size={18} className="text-[#94A3B8]" />
                </button>
              </div>

              {/* Gift Info */}
              <div className="space-y-6">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Status</span>
                  <StatusChip status={gift.status} gift={gift} />
                </div>

                {/* Recipient */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Recipient</span>
                  <p className="text-white font-medium">{gift.recipient_email}</p>
                </div>

                {/* Amount */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Amount</span>
                  {gift.usd_value !== null && gift.usd_value !== undefined ? (
                    <>
                      <p className="text-white font-bold text-2xl">{formatCurrency(gift.usd_value)}</p>
                      <p className="text-[#94A3B8] text-sm mt-1">{gift.amount.toFixed(4)} {gift.token_symbol}</p>
                    </>
                  ) : (
                    <p className="text-white font-bold text-2xl">{gift.amount.toFixed(4)} {gift.token_symbol}</p>
                  )}
                  {gift.has_greeting_card && gift.card_price_usd && (
                    <p className="text-[#06B6D4] text-sm mt-1">+ {formatCurrency(gift.card_price_usd)} greeting card</p>
                  )}
                </div>

                {/* Message */}
                {gift.message && (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Message</span>
                    <p className="text-white italic">"{gift.message}"</p>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Created</span>
                    <p className="text-white text-sm">{formatDate(gift.created_at)}</p>
                    <p className="text-[#64748B] text-xs mt-1">{getRelativeTime(gift.created_at)}</p>
                  </div>
                  {gift.expires_at && (
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Expires</span>
                      <p className="text-white text-sm">{formatDate(gift.expires_at)}</p>
                      {new Date(gift.expires_at) > new Date() && (
                        <p className="text-[#64748B] text-xs mt-1">
                          {Math.floor((new Date(gift.expires_at).getTime() - Date.now()) / (1000 * 60 * 60))} hours remaining
                        </p>
                      )}
                    </div>
                  )}
                  {gift.claimed_at && (
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Claimed</span>
                      <p className="text-white text-sm">{formatDate(gift.claimed_at)}</p>
                      <p className="text-[#64748B] text-xs mt-1">{getRelativeTime(gift.claimed_at)}</p>
                    </div>
                  )}
                  {gift.refunded_at && (
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Refunded</span>
                      <p className="text-white text-sm">{formatDate(gift.refunded_at)}</p>
                      <p className="text-[#64748B] text-xs mt-1">{getRelativeTime(gift.refunded_at)}</p>
                    </div>
                  )}
                </div>

                {/* Claim Link */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] block mb-2">Claim Link</span>
                  <div className="bg-[#0F172A] p-4 rounded-xl flex items-center justify-between border border-white/10">
                    <span className="text-[#FCD34D] text-sm truncate mr-4 font-mono flex-1">
                      {window.location.origin}{gift.tiplink_url}
                    </span>
                    <GlowButton
                      variant="secondary"
                      className="!py-2 !px-4 !text-xs flex-shrink-0"
                      onClick={handleCopyLink}
                      icon={Copy}
                    >
                      Copy
                    </GlowButton>
                  </div>
                </div>

                {/* Transaction Links */}
                <div className="space-y-3">
                  {gift.transaction_signature && (
                    <a
                      href={`https://solscan.io/tx/${gift.transaction_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A]/30 border border-white/10 hover:bg-[#0F172A]/50 transition-colors group"
                    >
                      <div>
                        <p className="text-white font-medium text-sm">Funding Transaction</p>
                        <p className="text-[#64748B] text-xs mt-1 font-mono">{gift.transaction_signature.slice(0, 16)}...</p>
                      </div>
                      <ArrowUpRight size={18} className="text-[#94A3B8] group-hover:text-[#06B6D4] transition-colors" />
                    </a>
                  )}
                  {gift.claim_signature && (
                    <a
                      href={`https://solscan.io/tx/${gift.claim_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A]/30 border border-white/10 hover:bg-[#0F172A]/50 transition-colors group"
                    >
                      <div>
                        <p className="text-white font-medium text-sm">Claim Transaction</p>
                        <p className="text-[#64748B] text-xs mt-1 font-mono">{gift.claim_signature.slice(0, 16)}...</p>
                      </div>
                      <ArrowUpRight size={18} className="text-[#94A3B8] group-hover:text-[#06B6D4] transition-colors" />
                    </a>
                  )}
                  {gift.refund_transaction_signature && (
                    <a
                      href={`https://solscan.io/tx/${gift.refund_transaction_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A]/30 border border-white/10 hover:bg-[#0F172A]/50 transition-colors group"
                    >
                      <div>
                        <p className="text-white font-medium text-sm">Refund Transaction</p>
                        <p className="text-[#64748B] text-xs mt-1 font-mono">{gift.refund_transaction_signature.slice(0, 16)}...</p>
                      </div>
                      <ArrowUpRight size={18} className="text-[#94A3B8] group-hover:text-[#06B6D4] transition-colors" />
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-white/10">
                  {gift.status === 'SENT' && (
                    <GlowButton
                      variant="secondary"
                      onClick={handleResendEmail}
                      icon={Mail}
                      className="flex-1"
                    >
                      Resend Email
                    </GlowButton>
                  )}
                  <GlowButton
                    variant="cyan"
                    onClick={handleCopyLink}
                    icon={Copy}
                    className="flex-1"
                  >
                    Copy Claim Link
                  </GlowButton>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default GiftDetailsModal;


