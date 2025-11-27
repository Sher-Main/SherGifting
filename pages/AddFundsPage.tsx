import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building, ArrowDownLeft, ChevronLeft, Copy, QrCode } from 'lucide-react';
import GlassCard from '../components/UI/GlassCard';
import GlowButton from '../components/UI/GlowButton';
import QRCode from 'qrcode';

const AddFundsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'bank' | 'wallet' | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const handleCopy = () => {
    if (user?.wallet_address) {
      navigator.clipboard.writeText(user.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate QR code for wallet address when wallet option is selected
  useEffect(() => {
    const generateQRCode = async () => {
      if (selectedOption === 'wallet' && user?.wallet_address) {
        try {
          const qrCode = await QRCode.toDataURL(user.wallet_address, {
            width: 200,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          setQrCodeDataUrl(qrCode);
        } catch (error) {
          console.error('Failed to generate QR code:', error);
          setQrCodeDataUrl(null);
        }
      } else {
        setQrCodeDataUrl(null);
      }
    };

    generateQRCode();
  }, [selectedOption, user?.wallet_address]);

  // OptionCard component
  interface OptionCardProps {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    title: string;
    desc: string;
    onClick: () => void;
  }

  const OptionCard: React.FC<OptionCardProps> = ({ icon: Icon, title, desc, onClick }) => (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-8 rounded-3xl bg-[#1E293B]/40 border border-white/10 hover:border-[#BE123C] hover:bg-[#1E293B]/60 transition-all group text-center h-64 w-full"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#0F172A] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-white/5">
        <Icon size={32} className="text-[#BE123C]" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-[#94A3B8] text-sm px-4">{desc}</p>
    </button>
  );

  const renderContent = () => {
    if (!selectedOption) {
      return (
        <div className="grid md:grid-cols-2 gap-6">
          <OptionCard
            icon={Building}
            title="Transfer from Bank"
            desc="Purchase crypto with fiat currency."
            onClick={() => alert('Bank transfer coming soon!')}
          />
          <OptionCard
            icon={ArrowDownLeft}
            title="Transfer from Wallet"
            desc="Send funds from an external wallet."
            onClick={() => setSelectedOption('wallet')}
          />
        </div>
      );
    }

    if (selectedOption === 'bank') {
      return (
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold mb-2 text-center text-white">🎁 FUND YOUR GIFTING APP - FASTEST WAY (DEBIT CARD)</h3>
          <div className="mt-6 space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            {/* Step 1 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">1</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Sign Up on Coinbase (2 min)</h4>
                  <p className="text-[#94A3B8] mb-2">
                    Go to <a href="https://coinbase.com/signup" target="_blank" rel="noopener noreferrer" className="text-[#06B6D4] hover:text-[#0891B2] underline">coinbase.com/signup</a> → Click "Sign Up"
                  </p>
                  <ul className="list-disc list-inside text-[#64748B] space-y-1 ml-4">
                    <li>Email, password, name → Verify email</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">2</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Secure Your Account (2 min)</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Enter phone number</li>
                    <li>Enter code from text message</li>
                    <li className="text-[#10B981]">✅ Account secured</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">3</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Verify Your Identity (10 min)</h4>
                  <p className="text-[#94A3B8] mb-2">Upload these 3 things:</p>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4 mb-2">
                    <li><strong>ID photo</strong> (front + back) - Driver's license, passport, or state ID</li>
                    <li><strong>Selfie</strong> - Just your face, good lighting</li>
                    <li><strong>Proof of address</strong> - Recent utility bill, bank statement, or lease (dated within 3 months)</li>
                  </ul>
                  <p className="text-[#64748B] text-sm italic">All must be clear photos/scans, not screenshots.</p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">4</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Wait for Approval (5 min - 1 hour)</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Coinbase reviews your docs</li>
                    <li>Check email for approval notification</li>
                    <li className="text-[#10B981]">✅ Ready to fund</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">5</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Add Debit Card (INSTANT) ⚡</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Go to Settings → Payment Methods → Add</li>
                    <li>Select Debit Card</li>
                    <li>Enter card number, expiration, CVV</li>
                    <li>Address must match your bank records</li>
                    <li className="text-[#10B981]">✅ Card added & ready instantly</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">6</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Buy Solana (2 min)</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Click "Buy / Sell" on dashboard</li>
                    <li>Search "Solana" or "SOL"</li>
                    <li>Enter amount ($25-50 to start)</li>
                    <li>Select your Debit Card as payment method</li>
                    <li>Click "Buy Solana" → Enter 2FA code</li>
                    <li className="text-[#10B981]">✅ SOL in your wallet instantly</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 7 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">7</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Get Your Gifting App Wallet Address (1 min)</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Open Gifting App</li>
                    <li>Tap "Add Funds"</li>
                    <li>Select "Transfer from Wallet"</li>
                    <li>Tap the Copy icon</li>
                    <li className="text-[#10B981]">✅ Address copied</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 8 */}
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#06B6D4] rounded-full flex items-center justify-center font-bold text-white">8</div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold mb-2 text-white">Send SOL to Your App (2 min)</h4>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4 mb-3">
                    <li>In Coinbase, find your SOL balance</li>
                    <li>Click "Send" or "Withdraw"</li>
                    <li>Select Solana network (only option for SOL)</li>
                    <li>Paste the address you just copied</li>
                    <li>Enter amount (leave $1-2 for fees)</li>
                  </ul>
                  <div className="bg-[#0F172A]/50 border border-white/10 rounded-lg p-4 mb-3">
                    <p className="text-[#94A3B8] font-semibold mb-2">✅ Verify checklist:</p>
                    <ul className="space-y-1 text-[#94A3B8]">
                      <li>☑ Network = Solana</li>
                      <li>☑ Address matches the one you copied</li>
                      <li>☑ Amount is correct</li>
                    </ul>
                  </div>
                  <ul className="list-disc list-inside text-[#94A3B8] space-y-1 ml-4">
                    <li>Click "Send" → Enter 2FA code</li>
                    <li className="text-[#10B981]">✅ Done! SOL arrives in 30 seconds - 2 minutes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 text-center">
            <GlowButton variant="secondary" onClick={() => setSelectedOption(null)}>Back</GlowButton>
          </div>
        </div>
      );
    }
    
    if (selectedOption === 'wallet' && user) {
        return (
          <GlassCard className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Add Funds</h2>
            <h3 className="text-xl font-bold text-white mb-6">Your Gifting Wallet Address</h3>
            <p className="text-sm text-[#94A3B8] mb-8 leading-relaxed max-w-sm mx-auto">
              This is your personal gifting wallet. Send SOL or SPL tokens on the Solana network to this address to fund your gifts.
            </p>
            <p className="text-[#BE123C] mt-2 block font-bold text-sm mb-6">
              Sending tokens from other networks may result in permanent loss.
            </p>
            
            <div className="bg-[#0F172A] p-4 rounded-xl flex items-center justify-between border border-white/10 mb-8">
              <span className="text-[#FCD34D] text-sm truncate mr-4 font-mono">{user.wallet_address}</span>
              <GlowButton 
                variant="secondary" 
                className="!py-2 !px-4 !text-xs flex-shrink-0" 
                onClick={handleCopy} 
                icon={Copy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </GlowButton>
            </div>

            {qrCodeDataUrl && (
              <div className="bg-white p-4 rounded-2xl inline-block mx-auto mb-8">
                <img src={qrCodeDataUrl} alt="Wallet Address QR Code" className="w-48 h-48" />
              </div>
            )}

            <GlowButton variant="secondary" onClick={() => setSelectedOption(null)}>Back</GlowButton>
          </GlassCard>
        )
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 animate-fade-in-up">
      <button 
        onClick={() => selectedOption ? setSelectedOption(null) : navigate(-1)} 
        className="flex items-center gap-2 text-[#94A3B8] hover:text-white mb-8 transition-colors"
      >
        <ChevronLeft size={20} />
        <span>Back</span>
      </button>
      
      {!selectedOption && (
        <h1 className="text-3xl font-bold text-white mb-10 text-center">Add Funds</h1>
      )}
      
      {renderContent()}
    </div>
  );
};

export default AddFundsPage;