import React from 'react';

const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-[#0B1120]">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#BE123C]/20 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-[#064E3B]/20 rounded-full blur-[120px] animate-pulse-slow delay-700" />
      <div className="absolute top-[30%] left-[30%] w-[40%] h-[40%] bg-[#F59E0B]/5 rounded-full blur-[100px] animate-pulse-slow delay-1000" />
      <div 
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay" 
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
        }} 
      />
    </div>
  );
};

export default AnimatedBackground;

