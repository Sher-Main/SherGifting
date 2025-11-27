import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import GlowButton from '../components/UI/GlowButton';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
      <h1 className="text-8xl md:text-9xl font-bold text-[#BE123C] mb-4">404</h1>
      <p className="text-2xl md:text-3xl font-bold text-white mb-2">Page Not Found</p>
      <p className="text-lg text-[#94A3B8] mb-8">The page you're looking for doesn't exist</p>
      <GlowButton
        onClick={() => navigate('/')}
        variant="primary"
        icon={ArrowRight}
      >
        Go Home
      </GlowButton>
    </div>
  );
};

export default NotFoundPage;
