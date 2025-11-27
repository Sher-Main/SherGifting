
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Gift, History, LogOut } from 'lucide-react';
import GlowButton from './UI/GlowButton';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0B1120]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[#BE123C] cursor-pointer" onClick={() => navigate('/')}>
            <Gift className="drop-shadow-[0_0_8px_rgba(190,18,60,0.5)]" size={24} />
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white hidden md:inline">
                Crypto<span className="text-[#BE123C]">Gifting</span>
              </span>
              <span className="text-xs text-[#94A3B8] font-normal hidden lg:inline">
                powered by <span className="text-[#D97706]">sher</span>
              </span>
            </div>
          </div>
          <button 
            onClick={() => navigate('/')} 
            className={`text-sm font-medium transition-colors ${location.pathname === '/' ? 'text-white' : 'text-[#94A3B8] hover:text-white'}`}
          >
            Portfolio
          </button>
          <button 
            onClick={() => navigate('/history')} 
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${location.pathname === '/history' ? 'text-white' : 'text-[#94A3B8] hover:text-white'}`}
          >
            <History size={16} /> History
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="h-4 w-px bg-white/10 mx-2" />
          {user && (
            <>
              <div className="text-right hidden md:block">
                <div className="text-xs text-white font-bold">{user.username || user.email}</div>
                <div className="text-[10px] text-[#94A3B8]">{truncateAddress(user.wallet_address || '')}</div>
              </div>
              <GlowButton variant="primary" className="!py-2 !px-4 !text-xs" onClick={logout} icon={LogOut}>
                Logout
              </GlowButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
