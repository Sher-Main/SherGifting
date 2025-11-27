import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { CARD_TEMPLATES, CARD_UPSELL_PRICE } from '../lib/cardTemplates';

interface CardUpsellSectionProps {
  recipientName: string;
  onCardSelect: (cardType: string | null) => void;
  selectedCard: string | null;
}

export const CardUpsellSection: React.FC<CardUpsellSectionProps> = ({
  recipientName,
  onCardSelect,
  selectedCard
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-[#0F172A]/30 border border-white/5 rounded-xl p-6">
      {/* Header with Checkbox */}
      <div className="flex items-center gap-3 mb-2">
        <div
          onClick={() => {
            if (!selectedCard) {
              setIsExpanded(true);
              onCardSelect(CARD_TEMPLATES[0].id);
            } else {
              onCardSelect(null);
              setIsExpanded(false);
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

      {/* Card Template Selector */}
      {(isExpanded || selectedCard) && (
        <div className="animate-fade-in-up">
          <p className="text-xs font-bold text-[#94A3B8] uppercase mb-3">
            Choose a card design:
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CARD_TEMPLATES.map((template) => (
              <div
                key={template.id}
                onClick={() => onCardSelect(template.id)}
                className={`cursor-pointer border-2 rounded-lg relative overflow-hidden transition-all flex flex-col group ${
                  selectedCard === template.id
                    ? 'border-[#06B6D4]'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <div className="relative w-full pb-[66.67%]">
                  <img
                    src={template.previewUrl}
                    alt={template.displayName}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <div className="bg-[#1E293B] py-2 px-1 text-center text-[10px] text-white font-medium border-t border-white/5">
                  {template.displayName}
                </div>
              </div>
            ))}
          </div>

          {/* Preview message */}
          {selectedCard && (
            <div className="mt-4 p-3 bg-[#06B6D4]/10 rounded border border-[#06B6D4]/20 text-[#06B6D4] text-xs text-center">
              A beautiful greeting card will be included with your gift email
            </div>
          )}
        </div>
      )}
    </div>
  );
};

