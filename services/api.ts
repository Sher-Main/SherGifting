import axios from 'axios';
import { TokenBalance, Gift, GiftInfo, Token } from '../types';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Function to set auth token for API requests
export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

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

export const feeService = {
  getFeeConfig: async (): Promise<{ fee_wallet_address: string | null; fee_percentage: number }> => {
    const response = await apiClient.get('/fee-config');
    return response.data;
  },
};

export const tiplinkService = {
  create: async (): Promise<{ tiplink_url: string; tiplink_public_key: string }> => {
    const response = await apiClient.post('/tiplink/create');
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
    tiplink_url: string;
    tiplink_public_key: string;
    funding_signature: string;
    token_symbol?: string;
    token_decimals?: number;
  }): Promise<{ 
    gift_id: string;
    claim_url: string;
    tiplink_public_key: string;
    signature: string;
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
