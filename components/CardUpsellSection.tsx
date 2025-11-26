import React, { useState } from 'react';
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
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mt-6">
      {/* Header with Checkbox */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="add-card-checkbox"
          checked={!!selectedCard}
          onChange={(e) => {
            if (e.target.checked) {
              setIsExpanded(true);
              // Default to first card if none selected
              if (!selectedCard) {
                onCardSelect(CARD_TEMPLATES[0].id);
              }
            } else {
              onCardSelect(null);
              setIsExpanded(false);
            }
          }}
          className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-2 focus:ring-sky-500 cursor-pointer"
        />
        <label 
          htmlFor="add-card-checkbox" 
          className="cursor-pointer text-lg font-semibold text-white flex items-center gap-2"
        >
          Add a Greeting Card
          <span className="bg-sky-500 text-white px-3 py-1 rounded-full text-sm font-bold">
            +$1.00
          </span>
        </label>
      </div>
      
      <p className="mt-2 ml-8 text-slate-400 text-sm">
        Make your gift extra special with a personalized greeting card
      </p>

      {/* Card Template Selector */}
      {(isExpanded || selectedCard) && (
        <div className="mt-6 ml-8">
          <h4 className="text-md font-medium text-slate-300 mb-4">
            Choose a card design:
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CARD_TEMPLATES.map((template) => (
              <div
                key={template.id}
                onClick={() => onCardSelect(template.id)}
                className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all duration-200 ${
                  selectedCard === template.id
                    ? 'border-sky-500 bg-sky-500/10 shadow-lg shadow-sky-500/20'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="relative w-full pb-[66.67%] bg-slate-900">
                  <img
                    src={template.previewUrl}
                    alt={template.displayName}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 text-center bg-slate-900/50">
                  <p className={`text-sm font-medium ${
                    selectedCard === template.id
                      ? 'text-sky-400'
                      : 'text-slate-300'
                  }`}>
                    {template.displayName}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Preview message */}
          {selectedCard && (
            <div className="mt-4 p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg">
              <p className="text-sm text-slate-300">
                A beautiful greeting card will be included with your gift email
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

