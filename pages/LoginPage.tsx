import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Gift, Sparkles, ArrowRight, Shield, Link2, Building2 } from 'lucide-react';
import GlowButton from '../components/UI/GlowButton';
import HolidayBackground from '../components/HolidayBackground';
import CursorGlow from '../components/CursorGlow';
import HeroGiftCard from '../components/HeroGiftCard';
import TheProblem from '../components/sections/TheProblem';
import HowItWorks from '../components/sections/HowItWorks';
import RecipientExperience from '../components/sections/RecipientExperience';
import Comparison from '../components/sections/Comparison';
import RiskReversal from '../components/sections/RiskReversal';
import FAQ from '../components/sections/FAQ';
import FinalCTA from '../components/sections/FinalCTA';
import Footer from '../components/Footer';

const LoginPage: React.FC = () => {
  const { login, logout, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showLogout, setShowLogout] = React.useState(false);

  // ✅ Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
      // If user is already logged in, show logout option
      if (error instanceof Error) {
        if (error.message && error.message.includes('already logged in')) {
          setShowLogout(true);
        }
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowLogout(false);
      // Reload page to clear all state
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const navHeight = 80; // Approximate height of sticky nav
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - navHeight;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // ✅ Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B1120]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // ✅ If already authenticated, show redirect message
  if (isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0B1120]">
        <div className="text-white">Redirecting to home...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative bg-[#0B1120]">
      <HolidayBackground />
      
      <nav className="fixed top-0 w-full py-4 sm:py-6 px-4 sm:px-8 flex justify-between items-center z-50 bg-[#0B1120]/80 backdrop-blur-md border-b border-white/5 relative">
        <div className="flex items-center gap-2 text-[#BE123C]">
          <Gift strokeWidth={2.5} className="drop-shadow-[0_0_8px_rgba(190,18,60,0.5)]" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg sm:text-xl tracking-tight text-white">
              Crypto<span className="text-[#BE123C]">Gifting</span>
            </span>
            <span className="text-xs text-[#94A3B8] font-normal">
              powered by <span className="text-[#D97706]">sher</span>
            </span>
          </div>
        </div>
        
        {/* Middle navigation - centered, hidden on mobile */}
        <div className="hidden lg:flex items-center gap-6 absolute left-1/2 transform -translate-x-1/2">
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="text-sm font-medium text-[#94A3B8] hover:text-white transition-colors"
          >
            How it works
          </button>
          <span className="text-[#94A3B8]">•</span>
          <button
            onClick={() => scrollToSection('preview')}
            className="text-sm font-medium text-[#94A3B8] hover:text-white transition-colors"
          >
            Preview
          </button>
          <span className="text-[#94A3B8]">•</span>
          <button
            onClick={() => scrollToSection('faq')}
            className="text-sm font-medium text-[#94A3B8] hover:text-white transition-colors"
          >
            FAQs
          </button>
        </div>
        
        {/* Spacer to balance the layout */}
        <div className="hidden lg:block w-[200px]"></div>
      </nav>

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-8 sm:pb-12 lg:pb-16 relative z-10">
        <div className="w-full max-w-7xl mx-auto">
          {/* Hero Section - 2 Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center mb-16 lg:mb-24">
            {/* Left Column - Copy + Actions */}
            <div className="text-center lg:text-left space-y-6 sm:space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 shadow-lg shadow-black/20 animate-fade-in-up backdrop-blur-md">
                <Sparkles size={14} className="text-[#FCD34D]" />
                <span className="text-xs font-bold tracking-widest uppercase text-[#94A3B8]">
                  The 2025 Holiday Collection
                </span>
              </div>
              
              <h1 className="text-h1 font-bold text-white tracking-tight animate-fade-in-up delay-100 drop-shadow-2xl">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#BE123C] via-[#FCD34D] to-[#BE123C] bg-size-200 animate-gradient">
                  Gift crypto like a gift card — festive, instant, effortless.
                </span>
              </h1>
              
              <p className="text-body-lg text-[#CBD5E1] text-max-width mx-auto lg:mx-0 leading-relaxed animate-fade-in-up delay-200">
                Your person claims it with email/phone
              </p>

              {/* CTAs */}
              {showLogout ? (
                <div className="space-y-4 animate-fade-in-up delay-300">
                  <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/20 rounded-lg p-4">
                    <p className="text-[#FCD34D] text-sm text-center">
                      You're already logged in with another account. Please log out first to sign in with a different account.
                    </p>
                  </div>
                  <GlowButton onClick={handleLogout} variant="primary" fullWidth className="lg:w-auto">
                    Log Out & Try Again
                  </GlowButton>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in-up delay-300">
                  <GlowButton onClick={handleLogin} variant="primary" icon={ArrowRight} fullWidth className="sm:w-auto">
                    Send a Gift
                  </GlowButton>
                  <GlowButton 
                    onClick={() => scrollToSection('preview')} 
                    variant="secondary" 
                    fullWidth 
                    className="sm:w-auto"
                  >
                    See recipient experience
                  </GlowButton>
                </div>
              )}

              {/* Micro trust row */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-[#94A3B8] animate-fade-in-up delay-400">
                <div className="flex items-center gap-1.5">
                  <Shield size={12} />
                  <span>Powered by Privy</span>
                </div>
                <span className="hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Link2 size={12} />
                  <span>Link-based claiming</span>
                </div>
                <span className="hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Building2 size={12} />
                  <span>Built by Sher</span>
                </div>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="hidden lg:block animate-fade-in-up delay-200 overflow-visible">
              <CursorGlow>
                <div className="flex justify-center items-center py-8">
                  <HeroGiftCard />
                </div>
              </CursorGlow>
            </div>
          </div>

          {/* Terms */}
          <p className="text-xs text-[#64748B] text-center mt-6 sm:mt-10">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>

        {/* The Problem Section */}
        <TheProblem />

        {/* How It Works Section */}
        <HowItWorks />

        {/* Recipient Experience Section */}
        <RecipientExperience />

        {/* Comparison Section */}
        <Comparison />

        {/* Risk Reversal Section */}
        <RiskReversal />

        {/* FAQ Section */}
        <FAQ />

        {/* Final CTA Section */}
        <FinalCTA />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default LoginPage;
