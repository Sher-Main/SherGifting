import React from 'react';

interface QuickAmountChipsProps {
  onAmountSelect: (amount: string | null) => void;
  selectedAmount: string | null;
  className?: string;
  tokenPrice?: number | null;
}

const quickAmounts = [
  { label: '$10', value: '10' },
  { label: '$25', value: '25' },
  { label: '$50', value: '50' },
  { label: '$100', value: '100' },
  { label: 'Custom', value: 'custom' },
];

const QuickAmountChips: React.FC<QuickAmountChipsProps> = ({
  onAmountSelect,
  selectedAmount,
  className = '',
  tokenPrice,
}) => {
  const handleChipClick = (value: string) => {
    if (value === 'custom') {
      onAmountSelect(null);
    } else {
      onAmountSelect(value);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap gap-2">
        {quickAmounts.map((chip) => {
          const isSelected = selectedAmount === chip.value || 
            (chip.value !== 'custom' && selectedAmount === chip.value);
          
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => handleChipClick(chip.value)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${isSelected
                  ? 'bg-[#06B6D4] text-white shadow-lg shadow-[#06B6D4]/20'
                  : 'bg-[#0F172A]/50 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white border border-white/10'
                }
                active:scale-95
              `}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickAmountChips;


