import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          return (
            <li key={index} className="flex items-center gap-2">
              {isFirst && item.path === '/' && (
                <Home size={14} className="text-[#94A3B8]" />
              )}
              {item.path && !isLast ? (
                <button
                  onClick={() => navigate(item.path!)}
                  className="text-[#94A3B8] hover:text-white transition-colors"
                  aria-label={`Navigate to ${item.label}`}
                >
                  {item.label}
                </button>
              ) : (
                <span className={isLast ? 'text-white font-medium' : 'text-[#94A3B8]'}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight size={14} className="text-[#64748B]" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;


