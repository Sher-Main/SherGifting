
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { heliusService } from '../services/api';
import { TokenBalance } from '../types';
import Spinner from '../components/Spinner';
import { GiftIcon, WalletIcon, ArrowUpTrayIcon } from '../components/icons';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!user?.wallet_address) return;
      setIsLoading(true);
      setError(null);
      try {
        const fetchedBalances = await heliusService.getTokenBalances(user.wallet_address);
        // Filter non-zero balances and sort alphabetically (backend already does this, but ensure it here too)
        const nonZeroBalances = fetchedBalances
          .filter(b => b.balance > 0)
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
        setBalances(nonZeroBalances);
      } catch (e) {
        setError('Failed to fetch token balances.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBalances();
  }, [user]);

  const totalBalanceUSD = useMemo(() => {
    return balances.reduce((acc, token) => acc + token.usdValue, 0);
  }, [balances]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Summary and Actions */}
        <div className="lg:col-span-1 space-y-8">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-lg space-y-6">
                <div>
                  <p className="text-slate-400 text-sm">Total Balance</p>
                  <p className="text-4xl font-bold text-white">{formatCurrency(totalBalanceUSD)}</p>
                </div>
                <div className="flex flex-col space-y-3">
                    <button 
                      onClick={() => navigate('/add-funds')} 
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
                    >
                      <WalletIcon className="w-5 h-5" /> Add Funds
                    </button>
                    <button 
                      onClick={() => navigate('/gift')} 
                      className="w-full bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out flex items-center justify-center gap-2 text-base shadow-lg"

                    >
                      <GiftIcon className="w-5 h-5" /> Send Gift
                    </button>
                    <button 
                      onClick={() => navigate('/withdraw')} 
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
                    >
                      <ArrowUpTrayIcon className="w-5 h-5" /> Withdraw Funds
                    </button>
                </div>
            </div>
        </div>

        {/* Right Column: Token List */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-2xl shadow-lg">
          <h2 className="text-xl font-bold p-6 border-b border-slate-700">Your Assets</h2>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Spinner />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center h-64">
              <p className="text-center text-red-400 px-6">{error}</p>
            </div>
          ) : balances.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <p className="text-center text-slate-400 px-6">You don't have any tokens yet. Click "Add Funds" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-slate-400 uppercase">
                  <tr>
                    <th scope="col" className="px-6 py-3">Asset</th>
                    <th scope="col" className="px-6 py-3 text-right">Balance</th>
                    <th scope="col" className="px-6 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((token) => (
                    <tr key={token.address} className="border-t border-slate-700 hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img src={token.logoURI} alt={token.name} className="w-10 h-10 rounded-full bg-slate-700" />
                          <div>
                            <p className="font-bold text-white">{token.symbol}</p>
                            <p className="text-sm text-slate-400">{token.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-medium text-white">{token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                         <p className="text-sm text-slate-500">{token.symbol}</p>
                      </td>
                       <td className="px-6 py-4 text-right font-medium text-white">
                        {formatCurrency(token.usdValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;

