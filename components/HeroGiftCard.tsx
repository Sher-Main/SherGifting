import React, { useState, useRef } from 'react';
import { Gift, Coins } from 'lucide-react';
import GlassCard from './UI/GlassCard';

const HeroGiftCard: React.FC = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePosition({ x, y });
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  // Calculate tilt based on mouse position
  const centerX = 200; // Approximate center of card
  const centerY = 150;
  const tiltX = ((mousePosition.y - centerY) / centerY) * 10;
  const tiltY = ((centerX - mousePosition.x) / centerX) * 10;

  return (
    <div
      ref={cardRef}
      className="relative perspective-1000 pt-8"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <GlassCard
        className="relative overflow-hidden transition-all duration-300"
        style={{
          transform: isHovered
            ? `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`
            : 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Shine effect */}
        <div
          className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ${
            isHovered ? 'translate-x-full' : '-translate-x-full'
          }`}
          style={{
            transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)',
          }}
        />

        {/* Ribbon/Bow decoration */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
            isHovered ? 'rotate-6 scale-110' : 'rotate-0 scale-100'
          }`}
        >
          <div className="w-16 h-16 bg-gradient-to-br from-[#BE123C] to-[#EF4444] rounded-full flex items-center justify-center shadow-lg">
            <Gift className="text-white" size={24} />
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-4 bg-[#BE123C] rounded-t-full"></div>
        </div>

        {/* Card content */}
        <div className="relative z-10 pt-12 pb-8 px-6">
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-white mb-2">$50.00</div>
            <div className="text-sm text-[#94A3B8] flex items-center justify-center gap-2">
              <Coins size={16} />
              <span>USDC</span>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-xs text-[#94A3B8]">From</span>
              <span className="text-sm text-white font-medium">You</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-xs text-[#94A3B8]">To</span>
              <span className="text-sm text-white font-medium">Recipient</span>
            </div>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#BE123C]/20 border border-[#BE123C]/30">
              <span className="text-xs text-[#BE123C] font-medium">Wrapped</span>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default HeroGiftCard;

