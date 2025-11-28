import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gift } from 'lucide-react';
import GlassCard from './GlassCard';
import { CARD_TEMPLATES } from '../../lib/cardTemplates';

interface GiftPreviewProps {
  recipient: string;
  amount: string;
  tokenSymbol: string;
  usdValue: number | null;
  selectedCard: string | null;
  message: string;
  tokenPrice: number | null;
}

const GiftPreview: React.FC<GiftPreviewProps> = React.memo(({
  recipient,
  amount,
  tokenSymbol,
  usdValue,
  selectedCard,
  message,
  tokenPrice,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const selectedCardTemplate = selectedCard
    ? CARD_TEMPLATES.find(card => card.id === selectedCard)
    : null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const displayAmount = amount && !isNaN(parseFloat(amount))
    ? parseFloat(amount).toFixed(4)
    : '0.0000';

  const displayUsdValue = usdValue !== null && usdValue > 0
    ? formatCurrency(usdValue)
    : tokenPrice && amount && !isNaN(parseFloat(amount))
    ? formatCurrency(parseFloat(amount) * tokenPrice)
    : null;

  return (
    <div className="lg:sticky lg:top-20">
      <motion.div
        onHoverStart={() => !shouldReduceMotion && setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        animate={{
          rotateY: isHovered && !shouldReduceMotion ? 5 : 0,
          rotateX: isHovered && !shouldReduceMotion ? -2 : 0,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="perspective-1000"
      >
        <GlassCard variant="gift" className="relative overflow-hidden">
          {/* Ribbon border effect */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#BE123C]/40 via-[#06B6D4]/40 to-[#BE123C]/40" />
          
          {/* Shine effect on hover */}
          {isHovered && !shouldReduceMotion && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          )}

          <div className="relative z-10 space-y-4">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-[#94A3B8] text-sm mb-2">
                <Gift size={16} className="text-[#BE123C]" />
                <span>To:</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                {recipient || 'Recipient'}
              </h3>
            </div>

            {/* Amount Display */}
            <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-white/10 rounded-xl p-6 text-center">
              <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Gift Amount</p>
              <p className="text-3xl font-bold text-white mb-1">
                {displayAmount} <span className="text-xl text-[#06B6D4]">{tokenSymbol || 'SOL'}</span>
              </p>
              {displayUsdValue && (
                <p className="text-sm text-[#94A3B8]">{displayUsdValue}</p>
              )}
            </div>

            {/* Greeting Card Thumbnail */}
            {selectedCardTemplate && (
              <div className="relative rounded-lg overflow-hidden border border-white/10">
                <img
                  src={selectedCardTemplate.previewUrl}
                  alt={selectedCardTemplate.displayName}
                  className="w-full h-32 object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-xs text-white font-medium">{selectedCardTemplate.displayName}</p>
                </div>
              </div>
            )}

            {/* Message Preview */}
            {message && (
              <div className="bg-[#0F172A]/30 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-[#94A3B8] mb-1">Message:</p>
                <p className="text-sm text-white italic line-clamp-3">"{message}"</p>
              </div>
            )}

            {/* Unwrap hint on hover */}
            {isHovered && !shouldReduceMotion && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <p className="text-xs text-[#06B6D4] font-medium">Unwrap to claim</p>
              </motion.div>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
});

GiftPreview.displayName = 'GiftPreview';

export default GiftPreview;

