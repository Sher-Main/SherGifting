import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
// 🔥 Import usePrivy from main package
import { usePrivy } from '@privy-io/react-auth';
// 🔥 Import useWallets from SOLANA package (returns Solana wallets)
import { useWallets } from '@privy-io/react-auth/solana';
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
  showUsernameSetup: boolean;
  handleUsernameSetup: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'authenticating' | 'setting-up' | 'preparing' | 'ready'>('authenticating');
  const [retryCount, setRetryCount] = useState(0);
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);

  // 🔥 CRITICAL: Helper to detect Solana wallets robustly
  const isSolanaWallet = useCallback((w: any): boolean => {
    // Method 1: Check chainType (most reliable)
    if (w.chainType === 'solana') return true;
    if (w.chain_type === 'solana') return true;
    
    // Method 2: Check chainId
    if (w.chainId?.includes('solana')) return true;
    
    // Method 3: Address format (base58, not 0x)
    const address = w.address || w.walletAddress;
    if (!address) return false;
    
    return typeof address === 'string' && 
           !address.startsWith('0x') && 
           address.length >= 32 && 
           address.length <= 44;
  }, []);

  // 🔥 CRITICAL: This function ensures we ALWAYS get Solana wallet (works for existing users)
  const getSolanaWallet = useCallback(() => {
    // 🔥 STEP 1: Check useWallets() - Filter for ONLY Solana wallets
    if (wallets.length > 0) {
      const solanaWallets = wallets.filter(isSolanaWallet);
      
      console.log('🔍 Wallet filtering:', {
        total: wallets.length,
        solanaCount: solanaWallets.length,
        allWallets: wallets.map(w => ({
          address: w.address?.substring(0, 10) + '...',
          chainType: w.chainType,
          walletClientType: w.walletClientType,
          isSolana: isSolanaWallet(w),
        }))
      });
      
      if (solanaWallets.length > 0) {
        console.log('✅ Found Solana wallet in useWallets():', solanaWallets[0].address);
        return { wallet: solanaWallets[0], source: 'useWallets' };
      }
      
      // Debug: Show what wallets exist
      const ethereumWallets = wallets.filter(w => w.address?.startsWith('0x'));
      if (ethereumWallets.length > 0) {
        console.warn(`⚠️ Found ${ethereumWallets.length} Ethereum wallet(s) but no Solana wallet!`);
        console.log('Ethereum wallets:', ethereumWallets.map(w => w.address));
      }
    }
    
    // 🔥 STEP 2: Fallback to linkedAccounts - Filter for ONLY Solana
    if (privyUser?.linkedAccounts) {
      const walletAccounts = privyUser.linkedAccounts.filter(
        (acc: any) => acc.type === 'wallet' || acc.type === 'solana'
      );
      
      const solanaAccounts = walletAccounts.filter((acc: any) => isSolanaWallet(acc));
      
      console.log('🔍 LinkedAccounts filtering:', {
        total: privyUser.linkedAccounts.length,
        walletAccounts: walletAccounts.length,
        solanaCount: solanaAccounts.length,
      });
      
      if (solanaAccounts.length > 0) {
        const solanaAccount = solanaAccounts[0];
        const walletAddress = solanaAccount.address || solanaAccount.walletAddress;
        console.log('✅ Found Solana wallet in linkedAccounts:', walletAddress);
        return { 
          account: solanaAccount, 
          source: 'linkedAccounts',
          address: walletAddress
        };
      }
      
      // Debug: Show Ethereum accounts if found
      const ethereumAccounts = walletAccounts.filter((acc: any) => {
        const address = acc.address || acc.walletAddress;
        return address && address.startsWith('0x');
      });
      if (ethereumAccounts.length > 0) {
        console.warn(`⚠️ Found ${ethereumAccounts.length} Ethereum wallet(s) in linkedAccounts but no Solana wallet!`);
      }
    }
    
    return null;
  }, [wallets, privyUser, isSolanaWallet]);

  const syncUser = useCallback(async () => {
    console.log('🔄 syncUser called', { ready, walletsReady, authenticated, walletsCount: wallets.length, retryCount });
    
    if (!ready || !walletsReady) {
      console.log('⏸️ Not ready yet');
      setLoadingStage('authenticating');
      setIsLoading(true);
      return;
    }

    if (authenticated && privyUser) {
      // 🔥 Get Solana wallet (works for existing users with both wallets)
      const solanaWalletResult = getSolanaWallet();
      
      // If no wallets yet in useWallets(), check linkedAccounts and retry
      if (wallets.length === 0) {
        if (solanaWalletResult && solanaWalletResult.source === 'linkedAccounts') {
          // Found Solana wallet in linkedAccounts
          const walletAddress = solanaWalletResult.address;
          console.log('✅ Using Solana wallet from linkedAccounts:', walletAddress);
          
          // Get email
          const email = privyUser.email?.address || privyUser.google?.email || undefined;

          if (email && walletAddress) {
            try {
              console.log('🔑 Fetching auth token...');
              const token = await getAccessToken();
              console.log('🔑 Token retrieved:', token ? `${token.substring(0, 20)}...` : 'null');
              setAuthToken(token);
              console.log('✅ Auth token set for API requests');
              
              console.log('📡 Creating/fetching backend user with Solana wallet from linkedAccounts...');
              console.log('📋 User data:', { privy_did: privyUser.id, wallet_address: walletAddress, email });
              const backendUser = await userService.getOrCreateUser({
                privy_did: privyUser.id,
                wallet_address: walletAddress,
                email: email,
              });
              console.log('✅ Backend user synced:', backendUser);
              setUser(backendUser);
              setLoadingStage('ready');
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
        
        // If no Solana wallet found in linkedAccounts, retry a few times
        if (retryCount < 5) {
          console.log(`⏳ Setting up your account (attempt ${retryCount + 1}/5)...`);
          setLoadingStage('setting-up');
          setIsLoading(true);
          
          // Wait 1 second for wallet to appear in useWallets()
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 1000);
          return;
        } else {
          console.error('❌ No Solana wallet found after 5 attempts. Please refresh the page.');
          console.log('📋 Final linkedAccounts state:', privyUser.linkedAccounts);
          console.log('📋 Available wallets:', wallets);
          setIsLoading(false);
          return;
        }
      }
      
      // Reset retry count if wallets are found
      if (retryCount > 0) {
        setRetryCount(0);
      }

      // 🔥 When wallets are available, use enhanced detection
      if (solanaWalletResult && solanaWalletResult.source === 'useWallets') {
        const solanaWallet = solanaWalletResult.wallet;
        const walletAddress = solanaWallet.address;
        console.log('🎯 Using Solana wallet from useWallets():', walletAddress);
        console.log('🔍 Wallet details:', {
          address: walletAddress,
          chainType: solanaWallet.chainType,
          chain_type: (solanaWallet as any).chain_type,
          walletClientType: solanaWallet.walletClientType,
          connectorType: solanaWallet.connectorType,
        });
        
        // Get email
        const email = privyUser.email?.address || privyUser.google?.email || undefined;

        if (!email || !walletAddress) {
          console.error('❌ Missing email or wallet address');
          setIsLoading(false);
          return;
        }

        try {
          console.log('📡 Creating/fetching backend user...');
          const backendUser = await userService.getOrCreateUser({
            privy_did: privyUser.id,
            wallet_address: walletAddress,
            email: email,
          });

          console.log('✅ Backend user synced:', backendUser);
          setUser(backendUser);
          setLoadingStage('ready');
          setTimeout(() => {
            setIsLoading(false);
          }, 300);
        } catch (error) {
          console.error('❌ Sync error:', error);
          setIsLoading(false);
        }
      } else {
        // No Solana wallet found
        console.error('❌ No Solana wallet found!');
        console.log('📋 Available wallets:', wallets.map(w => ({
          address: w.address,
          chainType: w.chainType,
          chain_type: (w as any).chain_type,
          walletClientType: w.walletClientType,
          connectorType: w.connectorType,
          isSolana: isSolanaWallet(w),
        })));
        
        // Check if user has Ethereum wallets
        const ethereumWallets = wallets.filter(w => w.address?.startsWith('0x'));
        if (ethereumWallets.length > 0) {
          console.error('⚠️ User has Ethereum wallet(s) but no Solana wallet!');
          console.log('Ethereum wallets:', ethereumWallets.map(w => w.address));
          // TODO: Show UI to create Solana wallet or handle this case
        }
        
        setIsLoading(false);
        return;
      }
    } else {
      console.log('👤 Not authenticated');
      setUser(null);
      setRetryCount(0);
      setIsLoading(false);
    }
  }, [ready, walletsReady, authenticated, privyUser, wallets, retryCount, getAccessToken, getSolanaWallet, isSolanaWallet]);

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

  useEffect(() => {
    if (user && !user.username) {
      setShowUsernameSetup(true);
    } else {
      setShowUsernameSetup(false);
    }
  }, [user]);

  const handleUsernameSetup = useCallback(
    async (username: string) => {
      setUser((prev) => (prev ? { ...prev, username } : prev));
      setShowUsernameSetup(false);
      await syncUser();
    },
    [syncUser]
  );

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
    showUsernameSetup,
    handleUsernameSetup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
