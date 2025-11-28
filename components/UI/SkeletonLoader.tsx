import React from 'react';

interface SkeletonLoaderProps {
  type?: 'text' | 'card' | 'list-item' | 'table-row' | 'card-grid' | 'form-field' | 'page';
  rows?: number;
  className?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'text',
  rows = 1,
  className = '',
}) => {
  if (type === 'list-item') {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-16 bg-[#1E293B]/40 rounded-lg animate-pulse border border-white/5"
          />
        ))}
      </div>
    );
  }

  if (type === 'table-row') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-12 bg-[#1E293B]/40 rounded animate-pulse border border-white/5"
          />
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`bg-[#1E293B]/40 rounded-xl p-6 animate-pulse border border-white/5 ${className}`}>
        <div className="h-6 bg-white/10 rounded w-3/4 mb-4" />
        <div className="h-4 bg-white/10 rounded w-full mb-2" />
        <div className="h-4 bg-white/10 rounded w-5/6" />
      </div>
    );
  }

  if (type === 'card-grid') {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {Array.from({ length: rows || 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-[#1E293B]/40 rounded-xl p-6 animate-pulse border border-white/5"
          >
            <div className="h-6 bg-white/10 rounded w-3/4 mb-4" />
            <div className="h-4 bg-white/10 rounded w-full mb-2" />
            <div className="h-4 bg-white/10 rounded w-5/6" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'form-field') {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 bg-white/10 rounded w-1/4 animate-pulse" />
            <div className="h-10 bg-white/10 rounded w-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'page') {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="h-10 bg-white/10 rounded w-1/3 animate-pulse" />
        <div className="h-4 bg-white/10 rounded w-1/2 animate-pulse" />
        <div className="space-y-4 mt-8">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 bg-white/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Default: text
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-4 bg-[#1E293B]/40 rounded animate-pulse"
          style={{ width: index === rows - 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  );
};

export default SkeletonLoader;


