import React from 'react';
import { X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterChipsProps {
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiSelect?: boolean;
  showCount?: boolean;
  className?: string;
}

const FilterChips: React.FC<FilterChipsProps> = ({
  options,
  selected,
  onChange,
  multiSelect = true,
  showCount = false,
  className = '',
}) => {
  const handleToggle = (value: string) => {
    if (multiSelect) {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      onChange(selected.includes(value) ? [] : [value]);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const activeCount = selected.length;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${isSelected
                  ? 'bg-[#BE123C] text-white shadow-lg shadow-[#BE123C]/20'
                  : 'bg-[#0F172A]/50 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white border border-white/10'
                }
                active:scale-95
              `}
            >
              {option.label}
              {showCount && option.count !== undefined && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                  isSelected ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-2 rounded-lg text-sm font-medium text-[#94A3B8] hover:text-white hover:bg-[#1E293B] border border-white/10 transition-all flex items-center gap-1"
          >
            <X size={14} />
            Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterChips;


