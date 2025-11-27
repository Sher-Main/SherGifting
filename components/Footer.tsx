import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-[#64748B] text-center md:text-left">
            © 2025 CryptoGifting
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a
              href="#"
              className="text-[#94A3B8] hover:text-white transition-colors"
            >
              Terms of Service
            </a>
            <span className="text-[#64748B]">•</span>
            <a
              href="#"
              className="text-[#94A3B8] hover:text-white transition-colors"
            >
              Privacy Policy
            </a>
            <span className="text-[#64748B]">•</span>
            <span className="text-[#94A3B8]">
              Built by <span className="text-[#D97706]">Sher</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

