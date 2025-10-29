import React from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';

const WalletCreationPrompt: React.FC = () => {
  const { createWallet } = useAuth();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [isCreating, setIsCreating] = React.useState(false);

  // Check if user has any Solana wallet
  const hasSolanaWallet = wallets.some(w => {
    const isSolanaAddress = w.address && !w.address.startsWith('0x');
    console.log('WalletCreationPrompt checking wallet:', {
      address: w.address,
      isSolanaAddress,
      walletClientType: w.walletClientType,
      connectorType: w.connectorType
    });
    return isSolanaAddress;
  });

  // Don't show if user is not authenticated or already has a Solana wallet
  if (!authenticated || hasSolanaWallet) {
    return null;
  }

  const handleCreateWallet = async () => {
    setIsCreating(true);
    try {
      await createWallet();
    } catch (error) {
      console.error('Failed to create wallet:', error);
      
      // If wallet already exists, show a message and hide the prompt
      if (error.message && error.message.includes('already has an embedded wallet')) {
        console.log('Wallet already exists, hiding prompt...');
        // The prompt will hide automatically when the wallet is detected
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Create Your Wallet
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            We need to create a Solana wallet for you to get started. This will only take a moment.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleCreateWallet}
              disabled={isCreating}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Wallet...
                </>
              ) : (
                'Create Wallet'
              )}
            </button>
            
            <button
              onClick={handleRefresh}
              className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletCreationPrompt;
