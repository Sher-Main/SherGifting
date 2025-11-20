import axios from 'axios';
import {
  TokenBalance,
  Gift,
  GiftInfo,
  Token,
  User,
  UsernameCheckResponse,
  SetUsernameResponse,
  ResolveRecipientResponse,
} from '../types';

// Use environment variable for backend URL in production, fallback to /api for local dev
// If VITE_BACKEND_URL is set but doesn't end with /api, append it
let BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
if (BACKEND_URL !== '/api' && !BACKEND_URL.endsWith('/api')) {
  BACKEND_URL = `${BACKEND_URL}/api`;
}

const apiClient = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for debugging
apiClient.interceptors.request.use(
  (config) => {
    console.log('📤 API Request:', {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      hasAuth: !!config.headers?.Authorization,
      authHeader: config.headers?.Authorization ? `${config.headers.Authorization.substring(0, 20)}...` : 'none',
    });
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', {
      status: response.status,
      url: response.config.url,
    });
    return response;
  },
  (error) => {
    console.error('❌ API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

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
  }): Promise<User> => {
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

export const usernameService = {
  checkAvailability: async (username: string): Promise<UsernameCheckResponse> => {
    const response = await apiClient.get(`/user/username/check/${encodeURIComponent(username)}`);
    return response.data;
  },
  setUsername: async (username: string): Promise<SetUsernameResponse> => {
    const response = await apiClient.post('/user/username/set', { username });
    return response.data;
  },
  resolveRecipient: async (identifier: string): Promise<ResolveRecipientResponse> => {
    const response = await apiClient.post('/user/resolve-recipient', { identifier });
    return response.data;
  },
};

export const priceService = {
  getTokenPrice: async (mint: string): Promise<{ 
    price: number; 
    symbol: string; 
    source: string;
    timestamp: number;
  }> => {
    const response = await apiClient.get(`/tokens/${mint}/price`);
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

  getGiftInfoByToken: async (claimToken: string): Promise<GiftInfo> => {
    const response = await apiClient.get(`/gifts/info?token=${encodeURIComponent(claimToken)}`);
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

  claimGiftSecure: async (claimToken: string): Promise<{ 
    success: boolean;
    signature: string;
    amount: number;
    token_symbol: string;
  }> => {
    const response = await apiClient.post('/gifts/claim', { claim_token: claimToken });
    return response.data;
  },

  getGiftHistory: async (): Promise<Gift[]> => {
    const response = await apiClient.get('/gifts/history');
    return response.data;
  },
};
