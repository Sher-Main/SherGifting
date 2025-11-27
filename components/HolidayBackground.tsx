import React, { useRef } from 'react';
import { useScroll, useTransform } from 'framer-motion';
import { motion } from 'framer-motion';

const HolidayBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  // Parallax transforms for different elements
  const ornamentsY = useTransform(scrollYProgress, [0, 1], [0, -10]);
  const orbsY = useTransform(scrollYProgress, [0, 1], [0, -5]);
  // Generate random positions for elements
  const snowflakes = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${(i * 8.33) % 100}%`,
    delay: `${i * 0.5}s`,
    duration: `${15 + (i % 5)}s`,
  }));

  const stars = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    top: `${(i * 5) % 100}%`,
    left: `${(i * 7) % 100}%`,
    delay: `${i * 0.2}s`,
    size: `${2 + (i % 3)}px`,
  }));

  const ornaments = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    top: `${20 + (i * 15)}%`,
    left: `${10 + (i * 15)}%`,
    delay: `${i * 1.5}s`,
  }));

  return (
    <div ref={containerRef} className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Subtle twinkling stars */}
      {stars.map((star) => (
        <div
          key={`star-${star.id}`}
          className="absolute rounded-full bg-[#FCD34D] animate-twinkle"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            opacity: 0.2,
          }}
        />
      ))}

      {/* Gentle floating ornaments (very subtle circles) with parallax */}
      {ornaments.map((ornament) => (
        <motion.div
          key={`ornament-${ornament.id}`}
          className="absolute rounded-full animate-float-slow animate-gentle-pulse"
          style={{
            top: ornament.top,
            left: ornament.left,
            width: '40px',
            height: '40px',
            background: `radial-gradient(circle, rgba(190,18,60,0.08) 0%, transparent 70%)`,
            animationDelay: ornament.delay,
            filter: 'blur(8px)',
            y: ornamentsY,
          }}
        />
      ))}

      {/* Subtle snowflakes (simple dots) */}
      {snowflakes.map((flake) => (
        <div
          key={`flake-${flake.id}`}
          className="absolute rounded-full bg-white animate-drift"
          style={{
            left: flake.left,
            top: '-10px',
            width: '3px',
            height: '3px',
            animationDelay: flake.delay,
            animationDuration: flake.duration,
            opacity: 0.3,
            filter: 'blur(0.5px)',
          }}
        />
      ))}

      {/* Subtle gradient orbs (very low opacity) with parallax */}
      <motion.div
        className="absolute top-[10%] right-[10%] w-[200px] h-[200px] rounded-full bg-[#BE123C]/5 blur-[60px] animate-gentle-pulse"
        style={{ y: orbsY }}
      />
      <motion.div
        className="absolute bottom-[15%] left-[15%] w-[150px] h-[150px] rounded-full bg-[#FCD34D]/5 blur-[50px] animate-gentle-pulse"
        style={{ animationDelay: '2s', y: orbsY }}
      />
      <motion.div
        className="absolute top-[50%] left-[50%] w-[180px] h-[180px] rounded-full bg-[#06B6D4]/5 blur-[55px] animate-gentle-pulse"
        style={{ animationDelay: '4s', y: orbsY }}
      />
    </div>
  );
};

export default HolidayBackground;
