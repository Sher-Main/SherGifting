import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type SortDirection = 'asc' | 'desc';

interface SortOption {
  value: string;
  label: string;
}

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  direction: SortDirection;
  onChange: (value: string, direction: SortDirection) => void;
  className?: string;
}

const SortDropdown: React.FC<SortDropdownProps> = ({
  options,
  value,
  direction,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const handleToggleDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value, direction === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A]/50 border border-white/10 text-white hover:bg-[#1E293B] hover:border-white/20 transition-all"
        aria-label="Sort options"
        aria-expanded={isOpen}
      >
        <ArrowUpDown size={16} className="text-[#94A3B8]" />
        <span className="text-sm font-medium">{selectedOption.label}</span>
        <button
          type="button"
          onClick={handleToggleDirection}
          className="ml-1 p-1 rounded hover:bg-white/10 transition-colors"
          aria-label={`Sort ${direction === 'asc' ? 'ascending' : 'descending'}`}
        >
          {direction === 'asc' ? (
            <ArrowUp size={14} className="text-[#06B6D4]" />
          ) : (
            <ArrowDown size={14} className="text-[#06B6D4]" />
          )}
        </button>
        <ChevronDown size={16} className={`text-[#94A3B8] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 right-0 z-50 bg-[#1E293B] border border-white/10 rounded-xl shadow-2xl min-w-[200px] overflow-hidden"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value, direction);
                  setIsOpen(false);
                }}
                className={`
                  w-full px-4 py-3 text-left text-sm transition-colors
                  ${value === option.value
                    ? 'bg-[#BE123C]/20 text-white font-medium'
                    : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SortDropdown;


