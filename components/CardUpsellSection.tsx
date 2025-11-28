import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { CARD_TEMPLATES, CARD_UPSELL_PRICE } from '../lib/cardTemplates';

interface CardUpsellSectionProps {
  recipientName: string;
  onCardSelect: (cardType: string | null) => void;
  selectedCard: string | null;
}

interface CardUpsellSectionProps {
  recipientName: string;
  onCardSelect: (cardType: string | null) => void;
  selectedCard: string | null;
  onOpenModal?: () => void;
}

export const CardUpsellSection: React.FC<CardUpsellSectionProps> = ({
  recipientName,
  onCardSelect,
  selectedCard,
  onOpenModal,
}) => {
  return (
    <div className="bg-[#0F172A]/30 border border-white/5 rounded-xl p-6">
      {/* Header with Checkbox */}
      <div className="flex items-center gap-3 mb-2">
        <div
          onClick={() => {
            if (!selectedCard) {
              // Open modal if provided, otherwise use inline selection
              if (onOpenModal) {
                onOpenModal();
              } else {
                onCardSelect(CARD_TEMPLATES[0].id);
              }
            } else {
              onCardSelect(null);
            }
          }}
          className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition-colors ${
            selectedCard ? 'bg-[#06B6D4] border-[#06B6D4]' : 'border-[#94A3B8]'
          }`}
        >
          {selectedCard && <Check size={14} className="text-white" />}
        </div>
        <label 
          htmlFor="add-card-checkbox" 
          className="cursor-pointer font-bold text-white text-sm flex items-center gap-2"
        >
          Add a Greeting Card
          <span className="bg-[#06B6D4]/20 text-[#06B6D4] text-xs px-2 py-0.5 rounded font-bold">
            +$1.00
          </span>
        </label>
      </div>
      
      <p className="text-xs text-[#94A3B8] mb-6 pl-8">
        Make your gift extra special with a personalized greeting card
      </p>

      {/* Selected Card Preview */}
      {selectedCard && (
        <div className="space-y-3">
          {(() => {
            const card = CARD_TEMPLATES.find(c => c.id === selectedCard);
            if (!card) return null;
            return (
              <>
                <div className="flex items-center gap-3">
                  <img
                    src={card.previewUrl}
                    alt={card.displayName}
                    className="w-16 h-16 rounded-lg object-cover border border-white/10"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{card.displayName}</p>
                    <p className="text-xs text-[#94A3B8]">{card.occasion}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModal ? onOpenModal() : onCardSelect(null)}
                    className="text-xs text-[#06B6D4] hover:text-[#0891B2]"
                  >
                    Change
                  </button>
                </div>
                <div className="p-3 bg-[#06B6D4]/10 rounded border border-[#06B6D4]/20 text-[#06B6D4] text-xs text-center">
                  A beautiful greeting card will be included with your gift email
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

