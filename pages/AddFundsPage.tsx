import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BanknotesIcon, ArrowDownTrayIcon, ArrowLeftIcon } from '../components/icons';

const AddFundsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'bank' | 'wallet' | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (user?.wallet_address) {
      navigator.clipboard.writeText(user.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderContent = () => {
    if (!selectedOption) {
      return (
        <div className="grid md:grid-cols-2 gap-6">
          <button onClick={() => setSelectedOption('bank')} className="p-8 bg-slate-800 hover:bg-slate-700/50 border border-slate-700 rounded-2xl text-center transition-all duration-300 ease-in-out transform hover:-translate-y-1">
            <BanknotesIcon className="w-12 h-12 mx-auto mb-4 text-sky-400" />
            <h3 className="text-xl font-bold">Transfer from Bank</h3>
            <p className="text-slate-400 mt-2">Purchase crypto with fiat currency.</p>
          </button>
          <button onClick={() => setSelectedOption('wallet')} className="p-8 bg-slate-800 hover:bg-slate-700/50 border border-slate-700 rounded-2xl text-center transition-all duration-300 ease-in-out transform hover:-translate-y-1">
            <ArrowDownTrayIcon className="w-12 h-12 mx-auto mb-4 text-sky-400" />
            <h3 className="text-xl font-bold">Transfer from Wallet</h3>
            <p className="text-slate-400 mt-2">Send funds from an external wallet.</p>
          </button>
        </div>
      );
    }

    if (selectedOption === 'bank') {
      return (
        <div className="text-center">
            <h3 className="text-2xl font-bold mb-4">Transfer from Bank</h3>
            <p className="text-slate-400 mb-6">Our integration with OnMeta is coming soon. This will allow you to purchase crypto directly.</p>
            <button onClick={() => setSelectedOption(null)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Back</button>
        </div>
      );
    }
    
    if (selectedOption === 'wallet' && user) {
        return (
             <div className="text-center max-w-md mx-auto">
                <h3 className="text-2xl font-bold mb-4">Your Solana Wallet Address</h3>
                <p className="text-slate-400 mb-6">Only send SOL or SPL tokens on the Solana network to this address. Sending tokens from other networks may result in a permanent loss of funds.</p>
                <div className="bg-slate-900/50 p-4 rounded-lg mb-4 break-all font-mono text-sm text-slate-300 relative">
                    {user.wallet_address}
                    <button onClick={handleCopy} className="absolute top-2 right-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold py-1 px-2 rounded">
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                {/* QR Code would be rendered here */}
                <div className="bg-white p-4 inline-block rounded-lg mb-6">
                    <p className="text-black">QR Code Placeholder</p>
                </div>
                <br/>
                <button onClick={() => setSelectedOption(null)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Back</button>
            </div>
        )
    }
  };

  return (
    <div className="animate-fade-in">
        <button 
            onClick={() => navigate(-1)} 
            className="mb-4 text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors font-medium"
        >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back</span>
        </button>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-lg">
            <h1 className="text-3xl font-bold text-center mb-8">Add Funds</h1>
            {renderContent()}
        </div>
    </div>
  );
};

export default AddFundsPage;