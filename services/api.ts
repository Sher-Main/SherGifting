import axios from 'axios';
import { TokenBalance, Gift } from '../types';

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

export const giftService = {
  createGift: async (giftData: {
    recipient_email: string;
    token_address: string;
    amount: number;
    message?: string;
    sender_did: string;
  }): Promise<{ 
    tiplink_url: string; 
    gift_id: string;
    tiplink_public_key: string;
  }> => {
    const response = await apiClient.post('/gifts/create', giftData);
    return response.data;
  },

  getGiftHistory: async (): Promise<Gift[]> => {
    const response = await apiClient.get('/gifts/history');
    return response.data;
  },

  getGiftInfo: async (tipLinkId: string): Promise<Gift> => {
    const response = await apiClient.get(`/gifts/info/${tipLinkId}`);
    return response.data;
  },

  claimGift: async (claimData: { tipLinkId: string; claimer_wallet_address: string }): Promise<{ success: boolean }> => {
    const response = await apiClient.post('/gifts/claim', claimData);
    return response.data;
  },
};
