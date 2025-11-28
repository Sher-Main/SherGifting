import React, { useState, useEffect } from 'react';
import { List, Grid } from 'lucide-react';

type ViewMode = 'list' | 'grid';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  storageKey?: string;
  className?: string;
}

const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onViewChange,
  storageKey = 'view_preference',
  className = '',
}) => {
  // Load preference from localStorage on mount
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved && (saved === 'list' || saved === 'grid')) {
        onViewChange(saved as ViewMode);
      }
    }
  }, [storageKey, onViewChange]);

  // Save preference to localStorage when it changes
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, viewMode);
    }
  }, [viewMode, storageKey]);

  return (
    <div className={`flex items-center gap-2 bg-[#0F172A] p-1 rounded-xl border border-white/10 ${className}`}>
      <button
        type="button"
        onClick={() => onViewChange('list')}
        className={`p-2 rounded-lg transition-all ${
          viewMode === 'list'
            ? 'bg-[#06B6D4] text-white shadow-lg'
            : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
        }`}
        aria-label="List view"
        aria-pressed={viewMode === 'list'}
      >
        <List size={18} />
      </button>
      <button
        type="button"
        onClick={() => onViewChange('grid')}
        className={`p-2 rounded-lg transition-all ${
          viewMode === 'grid'
            ? 'bg-[#06B6D4] text-white shadow-lg'
            : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
        }`}
        aria-label="Grid view"
        aria-pressed={viewMode === 'grid'}
      >
        <Grid size={18} />
      </button>
    </div>
  );
};

export default ViewToggle;


