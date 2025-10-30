import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { User } from '../types';
import { userService } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const syncUser = useCallback(async () => {
    console.log('🔄 syncUser called', { ready, walletsReady, authenticated, walletsCount: wallets.length, retryCount });
    
    if (!ready || !walletsReady) {
      console.log('⏸️ Not ready yet');
      return;
    }

    if (authenticated && privyUser) {
      // If no wallets yet, retry a few times before giving up
      if (wallets.length === 0) {
        if (retryCount < 10) {
          console.log(`⏳ No wallets found yet (attempt ${retryCount + 1}/10), waiting for automatic creation...`);
          setIsLoading(true);
          
          // Wait 1 second and then increment retry count to trigger a re-check
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 1000);
          return;
        } else {
          // After 10 attempts, check the Privy user object directly for wallet info
          console.log('⚠️ Wallet not appearing in useWallets(), checking privyUser object...');
          console.log('Privy user object:', privyUser);
          
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
                console.log('📡 Creating/fetching backend user with wallet from linkedAccounts...');
                const backendUser = await userService.getOrCreateUser({
                  privy_did: privyUser.id,
                  wallet_address: walletAddress,
                  email: email,
                });
                console.log('✅ Backend user synced:', backendUser);
                setUser(backendUser);
                setIsLoading(false);
                return;
              } catch (error) {
                console.error('❌ Error syncing user:', error);
                setIsLoading(false);
                return;
              }
            }
          }
          
          console.error('❌ No wallet found after 10 attempts. Please refresh the page.');
          setIsLoading(false);
          return;
        }
      }
      
      // Reset retry count if wallets are found
      if (retryCount > 0) {
        setRetryCount(0);
      }

      console.log('📦 Wallets found:', wallets.length);
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
      } catch (error) {
        console.error('❌ Sync error:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      console.log('👤 Not authenticated');
      setUser(null);
      setRetryCount(0);
      setIsLoading(false);
    }
  }, [ready, walletsReady, authenticated, privyUser, wallets, retryCount]);

  useEffect(() => {
    syncUser();
  }, [syncUser]);

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
    isLoading: !ready || !walletsReady || isLoading,
    isAuthenticated: !!(user && authenticated),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
