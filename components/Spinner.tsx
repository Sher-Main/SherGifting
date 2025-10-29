
import React from 'react';

interface SpinnerProps {
    size?: string;
    color?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = '8', color = 'border-sky-400' }) => {
  const sizeClasses = `h-${size} w-${size}`;
  return (
    <div className={`animate-spin rounded-full ${sizeClasses} border-t-2 border-b-2 ${color}`}></div>
  );
};

export default Spinner;
