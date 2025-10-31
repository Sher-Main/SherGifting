import axios from 'axios';
import { TokenBalance, Gift, GiftInfo, Token } from '../types';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const userService = {
  getOrCreateUser: async (userData: { 
    privy_did: string; 
    wallet_address: string; 
    email: string; 
  }) => {
    const response = await apiClient.post('/user/sync', userData);
    return response.data;
  },
};

export const heliusService = {
  getTokenBalances: async (walletAddress: string): Promise<TokenBalance[]> => {
    try {
      const response = await apiClient.get(`/wallet/balances/${walletAddress}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching token balances:', error);
      return [];
    }
  },
};

export const tokenService = {
  getSupportedTokens: async (): Promise<Token[]> => {
    const response = await apiClient.get('/tokens');
    return response.data.tokens;
  },
};

export const treasuryService = {
  getBalance: async (): Promise<{ balance: number }> => {
    const response = await apiClient.get('/treasury/balance');
    return response.data;
  },

  addTestBalance: async (privyDid: string, amount: number): Promise<{ success: boolean; new_balance: number }> => {
    const response = await apiClient.post('/treasury/add-test-balance', {
      privy_did: privyDid,
      amount,
    });
    return response.data;
  },
};

export const giftService = {
  createGift: async (giftData: {
    recipient_email: string;
    token_mint: string;
    amount: number;
    message?: string;
    sender_did: string;
  }): Promise<{ 
    gift_id: string;
    claim_url: string;
    tiplink_public_key: string;
    signature: string;
    treasury_balance: number;
  }> => {
    const response = await apiClient.post('/gifts/create', giftData);
    return response.data;
  },

  getGiftInfo: async (giftId: string): Promise<GiftInfo> => {
    const response = await apiClient.get(`/gifts/${giftId}`);
    return response.data;
  },

  claimGift: async (giftId: string, claimData: { 
    recipient_did: string; 
    recipient_wallet: string;
  }): Promise<{ 
    success: boolean;
    signature: string;
    amount: number;
    token_symbol: string;
  }> => {
    const response = await apiClient.post(`/gifts/${giftId}/claim`, claimData);
    return response.data;
  },

  getGiftHistory: async (): Promise<Gift[]> => {
    const response = await apiClient.get('/gifts/history');
    return response.data;
  },
};
