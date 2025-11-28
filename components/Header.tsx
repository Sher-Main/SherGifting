import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Gift, History, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from './UI/GlowButton';
import UserMenuDropdown from './UI/UserMenuDropdown';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', label: 'Portfolio', icon: null },
    { path: '/history', label: 'History', icon: History },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0B1120]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div 
          className="flex items-center gap-2 text-[#BE123C] cursor-pointer" 
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/');
            }
          }}
          aria-label="Go to homepage"
        >
          <Gift className="drop-shadow-[0_0_8px_rgba(190,18,60,0.5)]" size={24} />
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white hidden sm:inline">
              Crypto<span className="text-[#BE123C]">Gifting</span>
            </span>
            <span className="text-xs text-[#94A3B8] font-normal hidden lg:inline">
              powered by <span className="text-[#D97706]">sher</span>
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className={`
                  flex items-center gap-2 text-sm font-medium transition-all relative
                  ${active 
                    ? 'text-white' 
                    : 'text-[#94A3B8] hover:text-white'
                  }
                `}
                aria-current={active ? 'page' : undefined}
              >
                {Icon && <Icon size={16} />}
                <span>{item.label}</span>
                {active && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#BE123C] rounded-full"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          <div className="h-4 w-px bg-white/10 hidden md:block" />

          {/* User Menu */}
          {user && (
            <>
              <div className="hidden md:block">
                <UserMenuDropdown user={user} onLogout={logout} />
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X size={24} className="text-white" />
                ) : (
                  <Menu size={24} className="text-white" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-[#0B1120]/95 backdrop-blur-md border-t border-white/5 overflow-hidden"
          >
            <nav className="px-4 py-4 space-y-2" aria-label="Mobile navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                      ${active
                        ? 'bg-[#BE123C]/20 text-white border border-[#BE123C]/30'
                        : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                      }
                    `}
                    aria-current={active ? 'page' : undefined}
                  >
                    {Icon && <Icon size={18} />}
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {/* Mobile User Info */}
              {user && (
                <div className="pt-4 border-t border-white/10 mt-2">
                  <div className="px-4 py-3 bg-white/5 rounded-lg">
                    <p className="text-white font-bold text-sm">{user.username || user.email}</p>
                    {user.wallet_address && (
                      <p className="text-[#94A3B8] text-xs mt-1 font-mono">
                        {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full mt-2 px-4 py-3 rounded-lg text-sm font-medium text-[#EF4444] hover:bg-[#7F1D1D]/20 transition-colors text-left"
                  >
                    Logout
                  </button>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
