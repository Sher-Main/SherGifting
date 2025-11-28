import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import { CARD_TEMPLATES, CardTemplate } from '../../lib/cardTemplates';

interface GreetingCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCard: string | null;
  onSelect: (cardId: string) => void;
  recipientName?: string;
}

const GreetingCardModal: React.FC<GreetingCardModalProps> = ({
  isOpen,
  onClose,
  selectedCard,
  onSelect,
  recipientName,
}) => {
  if (!isOpen) return null;

  const handleCardSelect = (card: CardTemplate) => {
    onSelect(card.id);
  };

  const handleRemoveCard = () => {
    onSelect('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="greeting-card-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl"
          >
            <GlassCard className="relative max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 id="greeting-card-modal-title" className="text-2xl font-bold text-white">
                    Choose a Greeting Card
                  </h2>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    Make your gift extra special (+$1.00)
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  aria-label="Close modal"
                >
                  <X size={18} className="text-[#94A3B8]" />
                </button>
              </div>

              {/* Card Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {CARD_TEMPLATES.map((card) => {
                  const isSelected = selectedCard === card.id;

                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleCardSelect(card)}
                      className={`
                        relative rounded-xl overflow-hidden border-2 transition-all
                        ${isSelected
                          ? 'border-[#06B6D4] ring-4 ring-[#06B6D4]/20'
                          : 'border-white/10 hover:border-white/20'
                        }
                        active:scale-95
                      `}
                    >
                      <div className="relative">
                        <img
                          src={card.previewUrl}
                          alt={card.displayName}
                          className="w-full h-48 object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center">
                            <Check size={18} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-4 bg-[#0F172A]/50">
                        <h3 className="font-bold text-white text-sm">{card.displayName}</h3>
                        <p className="text-xs text-[#94A3B8] mt-1">{card.occasion}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                {selectedCard && (
                  <GlowButton
                    variant="secondary"
                    onClick={handleRemoveCard}
                    className="flex-1"
                  >
                    Remove Card
                  </GlowButton>
                )}
                <GlowButton
                  variant="cyan"
                  onClick={onClose}
                  className="flex-1"
                >
                  {selectedCard ? 'Continue' : 'Skip Card'}
                </GlowButton>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default GreetingCardModal;


