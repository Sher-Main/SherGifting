import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogOut, Copy, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from './ToastContainer';
import GlowButton from './GlowButton';

interface UserMenuDropdownProps {
  user: {
    username?: string | null;
    email: string;
    wallet_address?: string;
  };
  onLogout: () => void;
}

const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleCopyAddress = async () => {
    if (user.wallet_address) {
      try {
        await navigator.clipboard.writeText(user.wallet_address);
        showToast({
          type: 'success',
          message: 'Wallet address copied!',
        });
        setIsOpen(false);
      } catch (err) {
        showToast({
          type: 'error',
          message: 'Failed to copy address',
        });
      }
    }
  };

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
        aria-label="User menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#BE123C]/20 to-[#06B6D4]/20 border border-white/10 flex items-center justify-center">
          <span className="text-white font-bold text-xs">
            {(user.username || user.email).charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="text-left hidden md:block">
          <div className="text-xs text-white font-bold">{user.username || user.email}</div>
          {user.wallet_address && (
            <div className="text-[10px] text-[#94A3B8]">{truncateAddress(user.wallet_address)}</div>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[#94A3B8] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-64 bg-[#1E293B] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
            role="menu"
            aria-orientation="vertical"
          >
            {/* User Info Section */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#BE123C]/20 to-[#06B6D4]/20 border border-white/10 flex items-center justify-center">
                  <span className="text-white font-bold">
                    {(user.username || user.email).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{user.username || user.email}</p>
                  {user.wallet_address && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[#94A3B8] text-xs font-mono truncate">
                        {truncateAddress(user.wallet_address)}
                      </p>
                      <button
                        onClick={handleCopyAddress}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        aria-label="Copy wallet address"
                      >
                        <Copy size={12} className="text-[#94A3B8]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              <div className="h-px bg-white/10 my-2" />
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="w-full px-4 py-3 text-left text-sm text-[#EF4444] hover:bg-[#7F1D1D]/20 transition-colors flex items-center gap-3"
                role="menuitem"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenuDropdown;


