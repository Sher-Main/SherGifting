import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { User } from '../types';
import { userService, setAuthToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  loadingStage: 'authenticating' | 'setting-up' | 'preparing' | 'ready';
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'authenticating' | 'setting-up' | 'preparing' | 'ready'>('authenticating');
  const [retryCount, setRetryCount] = useState(0);

  const syncUser = useCallback(async () => {
    console.log('🔄 syncUser called', { ready, walletsReady, authenticated, walletsCount: wallets.length, retryCount });
    
    if (!ready || !walletsReady) {
      console.log('⏸️ Not ready yet');
      setLoadingStage('authenticating');
      setIsLoading(true);
      return;
    }

    if (authenticated && privyUser) {
      // If no wallets yet, retry a few times before giving up
      if (wallets.length === 0) {
        if (retryCount < 3) {
          console.log(`⏳ Setting up your account (attempt ${retryCount + 1}/3)...`);
          setLoadingStage('setting-up');
          setIsLoading(true);
          
          // Wait 500ms and then increment retry count to trigger a re-check
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 500);
          return;
        } else {
          // After 3 attempts, check the Privy user object directly for wallet info
          console.log('⚠️ Wallet not appearing in useWallets(), checking privyUser object...');
          console.log('Privy user object:', privyUser);
          
          setLoadingStage('preparing');
          
          // Check if wallet exists in the linkedAccounts
          const walletAccount = privyUser.linkedAccounts?.find(
            (account: any) => account.type === 'wallet' || account.type === 'solana'
          );
          
          if (walletAccount && 'address' in walletAccount) {
            console.log('✅ Found wallet in linkedAccounts:', walletAccount);
            const walletAddress = walletAccount.address;
            
            // Get email
            let email = privyUser.email?.address || privyUser.google?.email || undefined;
            if (!email && privyUser.linkedAccounts) {
              const emailAccount = privyUser.linkedAccounts.find(
                (account: any) => account.type === 'email' || account.type === 'google'
              );
              if (emailAccount && 'email' in emailAccount) {
                email = emailAccount.email || undefined;
              }
            }

            if (email && walletAddress) {
              try {
                // Fetch and set auth token before making API call
                console.log('🔑 Fetching auth token...');
                const token = await getAccessToken();
                setAuthToken(token);
                console.log('✅ Auth token set for API requests');
                
                console.log('📡 Creating/fetching backend user with wallet from linkedAccounts...');
                const backendUser = await userService.getOrCreateUser({
                  privy_did: privyUser.id,
                  wallet_address: walletAddress,
                  email: email,
                });
                console.log('✅ Backend user synced:', backendUser);
                setUser(backendUser);
                setLoadingStage('ready');
                // Small delay to show "ready" state
                setTimeout(() => {
                  setIsLoading(false);
                }, 300);
                return;
              } catch (error) {
                console.error('❌ Error syncing user:', error);
                setIsLoading(false);
                return;
              }
            }
          }
          
          console.error('❌ No wallet found after 3 attempts. Please refresh the page.');
          setIsLoading(false);
          return;
        }
      }
      
      // Reset retry count if wallets are found
      if (retryCount > 0) {
        setRetryCount(0);
      }

      console.log('📦 Wallets found:', wallets.length);
      setLoadingStage('preparing');
      setIsLoading(true);
      
      try {
        // ✅ FILTER FOR SOLANA WALLET ONLY (base58 addresses don't start with 0x)
        const solanaWallet = wallets.find(w => {
          const isSolanaAddress = w.address && !w.address.startsWith('0x');
          console.log('🔍 Checking wallet:', {
            address: w.address,
            isSolanaAddress,
            type: w.walletClientType,
            connector: w.connectorType,
          });
          return isSolanaAddress;
        });

        if (!solanaWallet) {
          console.error('❌ No Solana wallet found!');
          console.log('Available wallets:', wallets);
          setIsLoading(false);
          return;
        }

        const walletAddress = solanaWallet.address;
        console.log('✅ Found Solana wallet:', walletAddress);
        
        // Get email
        let email = privyUser.email?.address || privyUser.google?.email || undefined;
        if (!email && privyUser.linkedAccounts) {
          const emailAccount = privyUser.linkedAccounts.find(
            (account: any) => account.type === 'email' || account.type === 'google'
          );
          if (emailAccount && 'email' in emailAccount) {
            email = emailAccount.email || undefined;
          }
        }

        if (!email || !walletAddress) {
          console.error('❌ Missing email or wallet address');
          setIsLoading(false);
          return;
        }

        console.log('📡 Creating/fetching backend user...');
        const backendUser = await userService.getOrCreateUser({
          privy_did: privyUser.id,
          wallet_address: walletAddress,
          email: email,
        });

        console.log('✅ Backend user synced:', backendUser);
        setUser(backendUser);
        setLoadingStage('ready');
        // Small delay to show "ready" state
        setTimeout(() => {
          setIsLoading(false);
        }, 300);
      } catch (error) {
        console.error('❌ Sync error:', error);
        setIsLoading(false);
      }
    } else {
      console.log('👤 Not authenticated');
      setUser(null);
      setRetryCount(0);
      setIsLoading(false);
    }
  }, [ready, walletsReady, authenticated, privyUser, wallets, retryCount, getAccessToken]);

  useEffect(() => {
    syncUser();
  }, [syncUser]);

  // Set auth token when user is authenticated
  useEffect(() => {
    const setToken = async () => {
      if (authenticated && privyUser) {
        try {
          const token = await getAccessToken();
          setAuthToken(token);
          console.log('✅ Auth token set for API requests');
        } catch (error) {
          console.error('❌ Error getting auth token:', error);
        }
      } else {
        setAuthToken(null);
      }
    };
    setToken();
  }, [authenticated, privyUser, getAccessToken]);

  const handleLogin = async () => {
    try {
      // Check if already authenticated
      if (authenticated) {
        console.log('User already authenticated, logging out first...');
        await privyLogout();
        // Wait a bit for logout to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      privyLogin();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const value = {
    user,
    login: handleLogin,
    logout: privyLogout,
    refreshUser: syncUser,
    isLoading: isLoading,
    loadingStage: loadingStage,
    isAuthenticated: !!(user && authenticated),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
