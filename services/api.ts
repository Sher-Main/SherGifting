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
// IMPORTANT: Vite environment variables are embedded at BUILD TIME
// Make sure VITE_BACKEND_URL is set in Vercel before building
const envValue = import.meta.env.VITE_BACKEND_URL;
let BACKEND_URL = envValue || '/api';

// Log the backend URL for debugging (without exposing secrets)
console.log('🔧 API Configuration:', {
  hasViteBackendUrl: !!envValue,
  envValuePreview: envValue ? (envValue.length > 50 ? envValue.substring(0, 50) + '...' : envValue) : 'NOT SET',
  backendUrlPreview: BACKEND_URL.length > 50 ? BACKEND_URL.substring(0, 50) + '...' : BACKEND_URL,
  isProduction: import.meta.env.PROD,
  mode: import.meta.env.MODE,
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
  allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')),
});

// In production, we MUST have a valid backend URL (not localhost)
// Check if we're in production by hostname (more reliable than import.meta.env.PROD)
const isProduction = typeof window !== 'undefined' && 
  (window.location.hostname.includes('cryptogifting.app') || 
   window.location.hostname.includes('vercel.app') ||
   (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')));

if (isProduction) {
  // If env var is missing, empty, or points to localhost, use fallback
  if (!envValue || 
      envValue.trim() === '' || 
      envValue === '/api' || 
      envValue.includes('localhost') || 
      envValue.includes('127.0.0.1') ||
      envValue.includes(':3001')) {
    const errorMsg = `❌ CRITICAL: VITE_BACKEND_URL is not properly configured for production!
    
Current value: ${envValue || 'NOT SET'}
Expected: A production URL like https://crypto-gifting-app.onrender.com

Using fallback URL. Please ensure VITE_BACKEND_URL is set in Vercel environment variables and rebuild the application.`;
    console.error(errorMsg);
    // Use hardcoded fallback for production
    BACKEND_URL = 'https://crypto-gifting-app.onrender.com';
    console.warn('⚠️ Using fallback backend URL:', BACKEND_URL);
  }
}

// If BACKEND_URL is set but doesn't end with /api, append it
if (BACKEND_URL !== '/api' && !BACKEND_URL.endsWith('/api')) {
  BACKEND_URL = `${BACKEND_URL}/api`;
}

// Final safety check - never use localhost in production
if (isProduction && (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1') || BACKEND_URL.includes(':3001'))) {
  console.error('❌ BLOCKED: Attempted to use localhost in production! Forcing fallback.');
  BACKEND_URL = 'https://crypto-gifting-app.onrender.com/api';
}

console.log('✅ Final BACKEND_URL:', BACKEND_URL);

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

type ResponseCacheEntry<T> = { data: T; timestamp: number };
const responseCache = new Map<string, ResponseCacheEntry<any>>();
const CACHE_TTLS = {
  balances: 15_000,
  history: 15_000,
};

const getCachedResponse = <T>(key: string, ttlMs: number): T | null => {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
};

const setCachedResponse = <T>(key: string, data: T) => {
  responseCache.set(key, { data, timestamp: Date.now() });
};

const invalidateCache = (key: string) => {
  responseCache.delete(key);
};

const getGiftHistoryCacheKey = () => {
  const authHeader = apiClient.defaults.headers.common['Authorization'] || 'anon';
  return `gift_history:${authHeader.slice(-12)}`;
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
    const cacheKey = `wallet_balances:${walletAddress}`;
    const cached = getCachedResponse<TokenBalance[]>(cacheKey, CACHE_TTLS.balances);

    const fetchLatest = async () => {
      const response = await apiClient.get(`/wallet/balances/${walletAddress}`);
      setCachedResponse(cacheKey, response.data);
      return response.data;
    };

    if (cached) {
      fetchLatest().catch((error) => console.error('Error refreshing balances:', error));
      return cached;
    }

    try {
      return await fetchLatest();
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
    card_type?: string | null;
    card_recipient_name?: string | null;
    card_price_usd?: number;
  }): Promise<{ 
    gift_id: string;
    claim_url: string;
    tiplink_public_key: string;
    signature: string;
  }> => {
    const response = await apiClient.post('/gifts/create', giftData);
    invalidateCache(getGiftHistoryCacheKey());
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
    invalidateCache(getGiftHistoryCacheKey());
    return response.data;
  },

  claimGiftSecure: async (claimToken: string): Promise<{ 
    success: boolean;
    signature: string;
    amount: number;
    token_symbol: string;
  }> => {
    const response = await apiClient.post('/gifts/claim', { claim_token: claimToken });
    invalidateCache(getGiftHistoryCacheKey());
    return response.data;
  },

  getGiftHistory: async (): Promise<Gift[]> => {
    const cacheKey = getGiftHistoryCacheKey();
    const cached = getCachedResponse<Gift[]>(cacheKey, CACHE_TTLS.history);

    const fetchHistory = async () => {
      const response = await apiClient.get('/gifts/history');
      setCachedResponse(cacheKey, response.data);
      return response.data;
    };

    if (cached) {
      fetchHistory().catch((error) => console.error('Error refreshing gift history:', error));
      return cached;
    }

    try {
      return await fetchHistory();
    } catch (error) {
      console.error('Error fetching gift history:', error);
      return [];
    }
  },
};

export const withdrawalService = {
  recordWithdrawal: async (withdrawalData: {
    token_mint: string;
    amount: number;
    fee: number;
    recipient_address: string;
    transaction_signature: string;
    token_symbol?: string;
    token_decimals?: number;
  }): Promise<{ success: boolean; withdrawal_id: string }> => {
    const response = await apiClient.post('/withdrawals/create', withdrawalData);
    return response.data;
  },
};
