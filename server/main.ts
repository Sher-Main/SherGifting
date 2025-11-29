import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import 'dotenv/config';
import { authenticateToken, AuthRequest } from './authMiddleware';
import { sendGiftNotification } from './emailService';
import { generateSecureToken, encryptTipLink, decryptTipLink } from './utils/encryption';
import { generatePersonalizedCardUrl } from './utils/cloudinary';
import { sharedCache } from './utils/cache';
import { startKeepAlivePing } from './utils/keepAlive';
import {
  insertGift,
  getGiftsBySender,
  getGiftById,
  updateGiftClaim,
  upsertUser,
  getUserByPrivyDid,
  pool,
  DbUser,
} from './database';
import { handleCardAdd } from './lib/onramp';
import userRoutes from './routes/user';
import onrampRoutes from './routes/onramp';
import cronRoutes from './routes/cron';
import { startGiftExpiryJob } from './jobs/giftExpiryJob';
import { startCreditCleanupJob } from './jobs/creditCleanupJob';


// --- Types (duplicated from frontend for simplicity) ---
enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
  EXPIRED_EMPTY = 'EXPIRED_EMPTY',
  EXPIRED_LOW_BALANCE = 'EXPIRED_LOW_BALANCE'
}

interface Gift {
  id: string;
  sender_did: string;
  sender_email: string;
  recipient_email: string;
  token_mint: string; // Mint address for SPL tokens, or 'SOL' for native SOL
  token_symbol: string;
  token_decimals: number;
  amount: number;
  usd_value?: number | null;  // USD value at time of gift creation
  message: string;
  status: GiftStatus;
  tiplink_url: string;
  tiplink_public_key: string;
  transaction_signature: string;
  created_at: string;
  claimed_at?: string | null;
  claimed_by?: string | null;
  claim_signature?: string | null;
  expires_at?: string;  // 24 hours from creation
  refunded_at?: string | null;  // when refund was processed
  refund_transaction_signature?: string | null;  // Solana transaction signature
}

const app = express();
app.use(express.json());

const PERF_LOG_ENDPOINTS = [
  '/api/wallet/balances',
  '/api/gifts/create',
  '/api/gifts/history',
  '/api/gifts/info',
  '/api/gifts/claim',
  '/api/withdrawals/create',
];

app.use((req, res, next) => {
  const shouldTrack = PERF_LOG_ENDPOINTS.some((endpoint) =>
    req.originalUrl.startsWith(endpoint)
  );

  if (!shouldTrack) {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    console.log(
      `⏱️ [perf] ${req.method} ${req.originalUrl} → ${res.statusCode} in ${durationMs.toFixed(2)}ms`
    );
  });

  next();
});

// Rate limiting middleware
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 claim attempts per IP (increased to handle auto-claim retries)
  message: 'Too many claim attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated users (they're already verified)
    // This helps prevent false positives from auto-claim retries
    return !!req.headers.authorization;
  },
});

const giftInfoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 gift info lookups per IP per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ CORS configuration - uses environment variables only
// CORS_ORIGIN: Comma-separated list of allowed origins (e.g., "https://cryptogifting.app,https://www.cryptogifting.app")
// FRONTEND_URL: Single frontend URL (fallback if CORS_ORIGIN not set)
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Build allowed origins from environment variables
const allowedOrigins: string[] = [];

// Add localhost for development (always allowed)
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
}

// Parse CORS_ORIGIN if provided (comma-separated list)
if (CORS_ORIGIN) {
  const origins = CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);
  allowedOrigins.push(...origins);
  console.log(`✅ CORS origins from CORS_ORIGIN: ${origins.join(', ')}`);
}

// Add FRONTEND_URL as fallback if CORS_ORIGIN not provided
if (FRONTEND_URL && !CORS_ORIGIN) {
  allowedOrigins.push(FRONTEND_URL);
  console.log(`✅ CORS origin from FRONTEND_URL: ${FRONTEND_URL}`);
}

// Log final allowed origins
if (allowedOrigins.length > 0) {
  console.log(`✅ CORS allowed origins: ${allowedOrigins.join(', ')}`);
} else {
  console.warn('⚠️ No CORS origins configured. Set CORS_ORIGIN or FRONTEND_URL environment variable.');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // For development, allow all origins if no CORS_ORIGIN is set
      if (process.env.NODE_ENV !== 'production' && !CORS_ORIGIN && !FRONTEND_URL) {
        console.warn(`⚠️ Allowing origin in development: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`❌ CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use('/api/user', userRoutes);
app.use('/api', onrampRoutes);
app.use('/api/cron', cronRoutes);

// --- ENV VARS & MOCKS ---
const PORT = process.env.PORT || 3001;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const FEE_WALLET_ADDRESS = process.env.FEE_WALLET_ADDRESS;
const FEE_PERCENTAGE = 0.001; // 0.1% fee
let FAKE_AUTHENTICATED_USER_DID = '';
// Keep in-memory array as fallback if database is not available
const gifts: Gift[] = [];

// Validate required environment variables
if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error('❌ Missing required environment variables: PRIVY_APP_ID and PRIVY_APP_SECRET');
  console.error('📝 Please add them to server/.env file');
  process.exit(1);
}

if (!HELIUS_API_KEY) {
  console.warn("⚠️ Warning: Missing HELIUS_API_KEY. Using public mainnet RPC (rate limited).");
}

// ✅ FIXED: Always create connection (don't make it null)
// Use Helius mainnet if API key exists, otherwise use public mainnet RPC
// Helius format: https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
const RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet.solana.com';

console.log('🌐 Connecting to Solana Mainnet RPC:', RPC_URL.replace(HELIUS_API_KEY || '', '***'));

const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60_000,
  disableRetryOnRateLimit: false,
  httpHeaders: {
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
  },
});

// Test connection
(async () => {
  try {
    const version = await connection.getVersion();
    console.log('✅ Successfully connected to Solana Mainnet. Version:', version['solana-core']);
  } catch (error: any) {
    console.error('❌ Failed to connect to Solana RPC:', error?.message || error);
    console.error('🔧 Please check your HELIUS_API_KEY in server/.env file');
  }
})();

// ✅ FIX: Remove TipLink initialization - we'll use the static create() method instead
// TipLink doesn't need to be initialized with a client, we use it directly

// ========================================
// JUPITER API INTEGRATION
// ========================================

interface JupiterTokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
  price: number;
  verified: boolean;
  tags: string[];
}

/**
 * Fetches token metadata AND prices from Jupiter Tokens API V2
 * V2 API includes price in the same response - no separate price API needed!
 * Uses parallel processing for better performance
 * @param mintAddresses - Array of token mint addresses
 * @returns Map of mint address to token info
 */
async function fetchJupiterTokenInfo(
  mintAddresses: string[]
): Promise<Map<string, JupiterTokenInfo>> {
  const tokenMap = new Map<string, JupiterTokenInfo>();
  
  if (mintAddresses.length === 0) return tokenMap;

  try {
    console.log(`🔍 Fetching token info from Jupiter Tokens API V2 for ${mintAddresses.length} tokens...`);
    
    // 🚀 Fetch all tokens in parallel for better performance
    const fetchPromises = mintAddresses.map(async (mint) => {
      try {
        // 🔥 CORRECT V2 API: lite-api.jup.ag/tokens/v2/search
        const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`;
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          console.warn(`⚠️ Jupiter API returned ${response.status} for ${mint.substring(0, 8)}...`);
          return null;
        }
        
        const result = await response.json();
        
        // V2 returns an array of matching tokens
        if (Array.isArray(result) && result.length > 0) {
          // Find exact match by mint address
          const token = result.find(t => 
            (t.id === mint || t.address === mint)
          ) || result[0]; // Fallback to first result if no exact match
          
          // Extract all data from V2 response
          const symbol = token.symbol || 'UNKNOWN';
          const name = token.name || 'Unknown Token';
          const decimals = token.decimals || 0;
          const logoURI = token.icon || '';
          const verified = token.isVerified || false;
          const tags = token.tags || [];
          
          // 🔥 V2 INCLUDES PRICE IN THE RESPONSE as usdPrice!
          const cachedPrice = getCachedPrice(mint);
          let price: number;
          
          if (cachedPrice !== null) {
            price = cachedPrice;
          } else {
            const priceValue = token.usdPrice;
            price = (typeof priceValue === 'number') ? priceValue : 0;
            if (price > 0) {
              setCachedPrice(mint, price);
            }
          }
          
          console.log(`✅ ${symbol}: $${price.toFixed(6)} ${verified ? '✓ verified' : ''}`);
          
          return {
            mint,
            symbol,
            name,
            decimals,
            logoURI,
            price,  // Guaranteed to be a number
            verified,
            tags,
          };
        }
        
        console.warn(`⚠️ No results for ${mint.substring(0, 8)}...`);
        return null;
      } catch (error) {
        console.error(`❌ Error fetching ${mint.substring(0, 8)}...:`, error);
        return null;
      }
    });
    
    // Wait for all requests to complete
    const results = await Promise.all(fetchPromises);
    
    // Build the map from results
    results.forEach(tokenInfo => {
      if (tokenInfo) {
        tokenMap.set(tokenInfo.mint, tokenInfo);
      }
    });
    
    console.log(`✅ Successfully fetched ${tokenMap.size}/${mintAddresses.length} tokens from Jupiter V2`);
    
    return tokenMap;
  } catch (error) {
    console.error('❌ Error in fetchJupiterTokenInfo:', error);
    return tokenMap;
  }
}

// --- KNOWN TOKEN METADATA (minimal fallback for API failures) ---
// Minimal fallback for tokens without metadata. Token discovery is now dynamic via Helius API.
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; logoURI?: string }> = {
  // Mainnet USDC (fallback only)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC',
    name: 'USD Coin',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
};

// --- SUPPORTED TOKENS ---
// Token filtering now happens dynamically via wallet balances. This list is kept for legacy compatibility only.
const SUPPORTED_TOKENS = [
  {
    mint: 'So11111111111111111111111111111111111111112', // Native SOL (wrapped)
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    isNative: true
  },
];

// ========================================
// PRICE CACHING (OPTIONAL - 5 MIN TTL)
// ========================================

interface CachedPrice {
  price: number;
  timestamp: number;
}

const priceCache = new Map<string, CachedPrice>();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedPrice(mint: string): number | null {
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  return null;
}

function setCachedPrice(mint: string, price: number): void {
  priceCache.set(mint, {
    price,
    timestamp: Date.now(),
  });
}

// ✅ Add Solana address validation helper
const isSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58, 32-44 characters, don't start with 0x
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         address.length >= 32 && 
         address.length <= 44;
};

// --- ROUTES ---

app.post('/api/user/sync', authenticateToken, async (req: AuthRequest, res) => {
  const { privy_did, wallet_address, email } = req.body;
  const authenticatedUserId = req.userId || req.user?.id;
  
  console.log('✅ Received user sync request:', { privy_did, wallet_address, email });
  
  if (!pool) {
    return res.status(503).json({ error: 'Database is not configured. Please try again later.' });
  }
  
  // Verify the authenticated user matches the request
  if (authenticatedUserId && authenticatedUserId !== privy_did) {
    return res.status(403).json({ error: 'Unauthorized: User ID mismatch' });
  }
  
  if (!privy_did || !wallet_address || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 🔥 Validate it's a Solana address
  if (!isSolanaAddress(wallet_address)) {
    console.error('❌ Invalid Solana wallet address:', wallet_address);
    return res.status(400).json({ 
      error: 'Invalid Solana wallet address',
      message: 'Only Solana wallets are supported. Address must be base58 format (32-44 characters, not starting with 0x).',
      receivedAddress: wallet_address
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const syncedUser = await upsertUser({
      privy_did,
      wallet_address,
      email: normalizedEmail,
    });

    console.log('✅ User synced with database:', syncedUser.privy_did);
    res.status(200).json(syncedUser);
  } catch (error) {
    console.error('❌ Error syncing user:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});


app.get('/api/wallet/balances/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const cacheKey = `wallet_balances:${address}`;
    const cachedBalances = sharedCache.get<any[]>(cacheKey);
    if (cachedBalances) {
      console.log(`💾 Cache hit for wallet balances (${address})`);
      return res.json(cachedBalances);
    }

    console.log(`📊 Fetching balances for wallet: ${address}`);
    const ownerPublicKey = new PublicKey(address);

    const solMint = 'So11111111111111111111111111111111111111112';
    const solSearchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${solMint}`;
    const solMetaCacheKey = 'token_meta:sol';
    let solTokenMeta = sharedCache.get<any>(solMetaCacheKey) || null;
    let cachedSolPrice = getCachedPrice(solMint);
    const shouldFetchSolMeta = !solTokenMeta || cachedSolPrice === null;

    const [solBalanceLamports, tokenAccounts, fetchedSolMeta] = await Promise.all([
      connection.getBalance(ownerPublicKey),
      connection.getParsedTokenAccountsByOwner(ownerPublicKey, { programId: TOKEN_PROGRAM_ID }),
      shouldFetchSolMeta
        ? fetch(solSearchUrl)
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`Jupiter SOL search failed (${response.status})`);
              }
              const solData = await response.json();
              return Array.isArray(solData) && solData.length > 0 ? solData[0] : null;
            })
            .catch((err) => {
              console.warn('⚠️ Failed to fetch SOL metadata:', err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    if (fetchedSolMeta) {
      solTokenMeta = fetchedSolMeta;
      sharedCache.set(solMetaCacheKey, fetchedSolMeta, 5 * 60 * 1000);
      const fetchedPrice = typeof fetchedSolMeta.usdPrice === 'number' ? fetchedSolMeta.usdPrice : 0;
      if (fetchedPrice > 0) {
        cachedSolPrice = fetchedPrice;
        setCachedPrice(solMint, fetchedPrice);
      }
    }

    const solPrice = typeof cachedSolPrice === 'number' ? cachedSolPrice : 0;
    const solInLamports = solBalanceLamports / LAMPORTS_PER_SOL;

    console.log(`💰 SOL Balance: ${solInLamports.toFixed(4)} SOL ($${(solInLamports * solPrice).toFixed(2)})`);
    console.log(`🪙 Found ${tokenAccounts.value.length} token accounts`);

    const tokenData = tokenAccounts.value
      .map((account) => {
        const parsed = account.account.data.parsed.info;
        const amount = parsed.tokenAmount.uiAmount;
        if (amount > 0) {
          return {
            mint: parsed.mint,
            balance: amount,
            decimals: parsed.tokenAmount.decimals,
          };
        }
        return null;
      })
      .filter((token): token is NonNullable<typeof token> => token !== null);

    console.log(`✅ Found ${tokenData.length} tokens with balance > 0`);

    const mintAddresses = tokenData.map((t) => t.mint);
    const jupiterTokenMap = await fetchJupiterTokenInfo(mintAddresses);

    const balances = [
      {
        address: solMint,
        symbol: 'SOL',
        name: solTokenMeta?.name || 'Wrapped SOL',
        logoURI:
          solTokenMeta?.icon ||
          'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        decimals: 9,
        balance: solInLamports,
        usdValue: solInLamports * solPrice,
        verified: true,
        tags: ['verified'],
      },
    ];

    for (const token of tokenData) {
      const jupiterInfo = jupiterTokenMap.get(token.mint);
      if (jupiterInfo) {
        const usdValue: number = token.balance * jupiterInfo.price;
        balances.push({
          address: token.mint,
          symbol: jupiterInfo.symbol,
          name: jupiterInfo.name,
          logoURI: jupiterInfo.logoURI,
          decimals: token.decimals,
          balance: token.balance,
          usdValue,
          verified: jupiterInfo.verified,
          tags: jupiterInfo.tags,
        });
        console.log(`📦 ${jupiterInfo.symbol}: ${token.balance.toFixed(4)} ($${usdValue.toFixed(2)}) ${jupiterInfo.verified ? '✓' : ''}`);
      } else {
        const shortMint = `${token.mint.substring(0, 4)}...${token.mint.substring(token.mint.length - 4)}`;
        balances.push({
          address: token.mint,
          symbol: shortMint,
          name: `Unknown ${shortMint}`,
          logoURI: '',
          decimals: token.decimals,
          balance: token.balance,
          usdValue: 0,
          verified: false,
          tags: ['unknown'],
        });
        console.warn(`⚠️ No data found for: ${token.mint}`);
      }
    }

    balances.sort((a, b) => b.usdValue - a.usdValue);
    const totalUsdValue: number = balances.reduce((sum, t) => sum + t.usdValue, 0);
    console.log(`✅ Returning ${balances.length} balances (total: $${totalUsdValue.toFixed(2)})`);

    sharedCache.set(cacheKey, balances, 30 * 1000);
    res.json(balances);
  } catch (error) {
    console.error('❌ Error fetching wallet balances:', error);
    res.status(500).json({
      error: 'Failed to fetch wallet balances',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});


// Get supported tokens
app.get('/api/tokens', (req, res) => {
  res.json({ tokens: SUPPORTED_TOKENS });
});

// Get fee configuration
app.get('/api/fee-config', (req, res) => {
  res.json({
    fee_wallet_address: FEE_WALLET_ADDRESS || null,
    fee_percentage: FEE_PERCENTAGE, // 0.1% = 0.001
  });
});

// Get token price endpoint - Uses Jupiter Tokens API V2 (includes price in response)
app.get('/api/tokens/:mint/price', async (req, res) => {
  const { mint } = req.params;
  
  try {
    // Check cache first
    const cachedPrice = getCachedPrice(mint);
    if (cachedPrice !== null) {
      return res.json({
        price: cachedPrice,
        source: 'cache',
        timestamp: Date.now()
      });
    }
    
    // Use Jupiter Tokens API V2 (same API we use for token metadata - includes price!)
    const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new Error(`Jupiter API returned ${response.status}`);
    }
    
    const result = await response.json();
    
    // V2 returns an array of matching tokens
    if (Array.isArray(result) && result.length > 0) {
      // Find exact match by mint address
      const token = result.find(t => 
        (t.id === mint || t.address === mint)
      ) || result[0]; // Fallback to first result if no exact match
      
      // V2 includes price as usdPrice in the response
      const priceValue = token.usdPrice;
      const price: number = (typeof priceValue === 'number') ? priceValue : 0;
      
      if (price > 0) {
        // Cache the price
        setCachedPrice(mint, price);
        
        return res.json({
          price: price,
          symbol: token.symbol || 'UNKNOWN',
          source: 'jupiter-v2',
          timestamp: Date.now()
        });
      }
    }
    
    // Fallback to Helius DAS API if Jupiter doesn't have price
    if (HELIUS_API_KEY) {
      const heliusResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'price-fetch',
          method: 'getAsset',
          params: { id: mint }
        })
      });
      
      const heliusData = await heliusResponse.json();
      const priceInfo = heliusData.result?.token_info?.price_info;
      
      if (priceInfo?.price_per_token) {
        const heliusPrice: number = (typeof priceInfo.price_per_token === 'number') 
          ? priceInfo.price_per_token 
          : 0;
        
        if (heliusPrice > 0) {
          setCachedPrice(mint, heliusPrice);
        }
        
        return res.json({
          price: heliusPrice,
          symbol: heliusData.result.token_info.symbol,
          source: 'helius',
          timestamp: Date.now()
        });
      }
    }
    
    throw new Error('Price not available');
    
  } catch (error: any) {
    console.error('❌ Error fetching token price:', error);
    res.status(503).json({ 
      error: 'Price service unavailable',
      message: error.message 
    });
  }
});

// Create TipLink (Step 1 of gift creation)
app.post('/api/tiplink/create', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const newTipLink = await TipLink.create();
    const tiplinkUrl = newTipLink.url.toString();
    const tiplinkPublicKey = newTipLink.keypair.publicKey.toBase58();
    
    console.log('✅ TipLink created:', tiplinkPublicKey, 'for user:', req.userId || req.user?.id);
    
    res.json({
      tiplink_url: tiplinkUrl,
      tiplink_public_key: tiplinkPublicKey
    });
  } catch (error: any) {
    console.error('❌ Error creating TipLink:', error);
    res.status(500).json({ error: 'Failed to create TipLink', details: error?.message });
  }
});


// Create gift - Frontend has already funded the TipLink, backend creates the gift record
app.post('/api/gifts/create', authenticateToken, async (req: AuthRequest, res) => {
  const { sender_did, recipient_email, token_mint, amount, message, tiplink_url, tiplink_public_key, funding_signature, token_symbol, token_decimals, card_type, card_recipient_name, card_price_usd } = req.body;

  console.log('🎁 Creating gift record:', { sender_did, recipient_email, token_mint, amount, token_symbol, token_decimals });

  // Verify the authenticated user matches the sender
  if ((req.userId || req.user?.id) !== sender_did) {
    return res.status(403).json({ error: 'Unauthorized: Sender ID mismatch' });
  }

  if (!recipient_email || !token_mint || !amount || !sender_did || !tiplink_url || !tiplink_public_key || !funding_signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find sender
  let sender: DbUser | null = null;
  try {
    sender = await getUserByPrivyDid(sender_did);
  } catch (error) {
    console.error('❌ Error fetching sender from database:', error);
  }
  if (!sender) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get token info - use provided info or fetch from SUPPORTED_TOKENS or fetch dynamically
  let tokenInfo: { symbol: string; decimals: number; isNative?: boolean } | null = null;
  
  // First, try to use provided token info from frontend
  if (token_symbol && token_decimals) {
    tokenInfo = {
      symbol: token_symbol,
      decimals: token_decimals,
      isNative: token_mint === 'So11111111111111111111111111111111111111112'
    };
    console.log(`✅ Using provided token info: ${token_symbol} (${token_decimals} decimals)`);
  } else {
    // Fallback to SUPPORTED_TOKENS
    const supportedToken = SUPPORTED_TOKENS.find(t => t.mint === token_mint);
    if (supportedToken) {
      tokenInfo = {
        symbol: supportedToken.symbol,
        decimals: supportedToken.decimals,
        isNative: supportedToken.isNative
      };
      console.log(`✅ Using supported token info: ${tokenInfo.symbol}`);
    } else {
      // Try to fetch token info dynamically from token account
      try {
        const mintPubkey = new PublicKey(token_mint);
        // For native SOL
        if (token_mint === 'So11111111111111111111111111111111111111112') {
          tokenInfo = {
            symbol: 'SOL',
            decimals: 9,
            isNative: true
          };
        } else {
          // For SPL tokens, try to get decimals from mint account
          const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
          if (mintInfo.value && 'parsed' in mintInfo.value.data) {
            const parsedData = mintInfo.value.data.parsed.info;
            const decimals = parsedData.decimals || 9;
            const knownToken = KNOWN_TOKENS[token_mint];
            tokenInfo = {
              symbol: knownToken?.symbol || 'UNKNOWN',
              decimals: decimals,
              isNative: false
            };
            console.log(`✅ Fetched token info dynamically: ${tokenInfo.symbol} (${decimals} decimals)`);
          } else {
            return res.status(400).json({ error: 'Could not fetch token info. Please provide token_symbol and token_decimals.' });
          }
        }
      } catch (fetchError) {
        console.error('❌ Error fetching token info:', fetchError);
        return res.status(400).json({ error: 'Could not fetch token info. Please provide token_symbol and token_decimals.' });
      }
    }
  }
  
  if (!tokenInfo) {
    return res.status(400).json({ error: 'Could not determine token info' });
  }

  try {
    // Verify the funding transaction
    console.log('🔍 Verifying funding transaction:', funding_signature);
    
    const tx = await connection.getTransaction(funding_signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    if (!tx || !tx.meta) {
      return res.status(400).json({ error: 'Funding transaction not found or not confirmed. Please wait a moment and try again.' });
    }

    if (tx.meta.err) {
      return res.status(400).json({ error: 'Funding transaction failed on-chain' });
    }

    // Verify the transaction sent funds to the TipLink address
    const tiplinkPubkey = new PublicKey(tiplink_public_key);
    const accountIndex = tx.transaction.message.staticAccountKeys.findIndex(
      key => key.toBase58() === tiplinkPubkey.toBase58()
    );

    if (accountIndex === -1) {
      return res.status(400).json({ error: 'Transaction does not involve the TipLink address' });
    }

    // For SPL tokens, verify the TipLink ATA received tokens
    const isNative = token_mint === 'So11111111111111111111111111111111111111112';
    if (!isNative && tokenInfo) {
      console.log('🔍 Verifying SPL token transfer to TipLink...');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const mintPubkey = new PublicKey(token_mint);
      const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tiplinkPubkey);
      
      try {
        // Wait a moment for the transaction to fully settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const tiplinkTokenAccount = await getAccount(connection, tiplinkATA);
        const tokenBalance = Number(tiplinkTokenAccount.amount) / (10 ** tokenInfo.decimals);
        console.log(`💰 TipLink ${tokenInfo.symbol} balance after funding: ${tokenBalance} ${tokenInfo.symbol}`);
        
        if (tokenBalance < amount * 0.99) { // Allow 1% tolerance for rounding
          console.warn(`⚠️ TipLink token balance (${tokenBalance}) is less than expected (${amount}). Transaction may have partially failed.`);
        } else {
          console.log(`✅ TipLink has sufficient ${tokenInfo.symbol} balance`);
        }
      } catch (error: any) {
        if (error.name === 'TokenAccountNotFoundError' || error.message?.includes('could not find account')) {
          console.error(`❌ TipLink ${tokenInfo.symbol} token account not found after funding transaction!`);
          return res.status(400).json({ 
            error: `TipLink ${tokenInfo.symbol} token account was not created or funded. The funding transaction may have failed.` 
          });
        }
        console.error('⚠️ Error verifying TipLink token balance:', error);
        // Don't fail the gift creation, but log the warning
      }
    }

    console.log('✅ Funding transaction verified!');

    // Check if this card is FREE (using onramp credit)
    let cardResult = null;
    try {
      cardResult = await handleCardAdd(sender_did);
      console.log(`📤 Card credit check:`, {
        isFree: cardResult.isFree,
        freeRemaining: cardResult.cardAddsFreeRemaining,
        creditsRemaining: cardResult.creditsRemaining,
      });
    } catch (creditError) {
      console.error('⚠️ Error checking credit (continuing with normal flow):', creditError);
      // Don't fail gift creation if credit check fails
    }

    // Fetch token price and calculate USD value for storage (before creating gift record)
    let usdValue: number | null = null;
    try {
      console.log('💰 Fetching token price for gift record...');
      const jupiterTokenMap = await fetchJupiterTokenInfo([token_mint]);
      const jupiterInfo = jupiterTokenMap.get(token_mint);
      
      if (jupiterInfo && jupiterInfo.price && jupiterInfo.price > 0) {
        usdValue = amount * jupiterInfo.price;
        console.log(`✅ Gift USD value calculated: $${usdValue.toFixed(3)}`);
      } else {
        console.log('⚠️ Token price not available, storing gift without USD value');
      }
    } catch (priceError) {
      console.error('⚠️ Error fetching token price for gift record:', priceError);
      // Continue without USD value
    }

    // Generate secure claim token and encrypt TipLink URL
    const claimToken = generateSecureToken(32); // 32 bytes = 64 hex characters
    const ENCRYPTION_KEY = process.env.TIPLINK_ENCRYPTION_KEY;
    
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
      console.error('❌ TIPLINK_ENCRYPTION_KEY not set or too short (must be at least 32 characters)');
      return res.status(500).json({ error: 'Server configuration error: encryption key not set' });
    }

    let encryptedTipLink: string;
    try {
      encryptedTipLink = encryptTipLink(tiplink_url, ENCRYPTION_KEY);
      console.log('✅ TipLink URL encrypted successfully');
    } catch (encryptError) {
      console.error('❌ Error encrypting TipLink URL:', encryptError);
      return res.status(500).json({ error: 'Failed to encrypt TipLink URL' });
    }

    // Generate personalized card URL if card is selected
    let cardCloudinaryUrl: string | null = null;
    const hasCard = !!card_type && !!card_recipient_name;
    
    if (hasCard) {
      try {
        console.log('🎴 Generating personalized card URL...');
        cardCloudinaryUrl = generatePersonalizedCardUrl(card_type, card_recipient_name);
        console.log('✅ Card URL generated:', cardCloudinaryUrl);
      } catch (cardError: any) {
        console.error('❌ Error generating card URL:', cardError);
        // Don't fail gift creation if card generation fails, just log the error
        console.warn('⚠️ Continuing without card URL');
      }
    }

    // Create gift record
    const giftId = `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    const newGift: Gift = {
      id: giftId,
      sender_did,
      sender_email: sender.email,
      recipient_email,
      token_mint,
      token_symbol: tokenInfo.symbol,
      token_decimals: tokenInfo.decimals,
      amount,
      usd_value: usdValue,
      message: message || '',
      status: GiftStatus.SENT,
      tiplink_url, // Keep for backward compatibility
      tiplink_public_key,
      transaction_signature: funding_signature,
      created_at: new Date().toISOString(),
      expires_at: expiresAt
    };

    // Save to database (persistent storage) with security fields and card info
    try {
      await insertGift({
        ...newGift,
        claim_token: claimToken,
        tiplink_url_encrypted: encryptedTipLink,
        expires_at: expiresAt,
        has_greeting_card: hasCard,
        card_type: card_type || null,
        card_cloudinary_url: cardCloudinaryUrl,
        card_recipient_name: card_recipient_name || null,
        card_price_usd: card_price_usd || (hasCard ? 0.00 : null), // Free for testing
      });
      sharedCache.delete(`gift_history:${sender_did}`);
      console.log('✅ Gift saved to database with security fields and card info:', newGift.id);
    } catch (dbError: any) {
      console.error('⚠️ Failed to save gift to database, using in-memory storage:', dbError?.message);
      // Fallback to in-memory storage if database fails (without security fields)
      gifts.push(newGift);
    }
    
    console.log('✅ Gift created successfully:', newGift.id);
    
    // Fetch token name for email display (USD value already calculated and stored in gift)
    let tokenName: string | undefined = undefined;
    
    try {
      console.log('💰 Fetching token name for email...');
      const jupiterTokenMap = await fetchJupiterTokenInfo([token_mint]);
      const jupiterInfo = jupiterTokenMap.get(token_mint);
      
      if (jupiterInfo && jupiterInfo.name) {
        tokenName = jupiterInfo.name;
      }
    } catch (priceError) {
      console.error('⚠️ Error fetching token name for email:', priceError);
      // Continue without token name
    }
    
    // Send email notification to recipient with secure claim token
    const claimUrl = `/claim?token=${claimToken}`;
    const fullClaimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${claimUrl}`;
    
    console.log('📧 Sending email notification to recipient with secure claim token...');
    const emailResult = await sendGiftNotification({
      recipientEmail: recipient_email,
      senderEmail: sender.email,
      amount,
      tokenSymbol: tokenInfo.symbol,
      tokenName: tokenName,
      usdValue: usdValue, // Use the USD value we calculated and stored in gift
      claimUrl: fullClaimUrl,
      message: message || undefined,
      cardImageUrl: cardCloudinaryUrl || undefined,
    });

    if (emailResult.success) {
      console.log('✅ Email sent successfully to:', recipient_email);
    } else {
      console.error('⚠️ Failed to send email:', emailResult.error);
      // Don't fail the gift creation if email fails
    }
    
    // Return success
    res.status(201).json({ 
      gift_id: newGift.id,
      claim_url: claimUrl,
      tiplink_public_key,
      signature: funding_signature,
      cardWasFree: cardResult?.isFree || false,
      creditsRemaining: cardResult?.creditsRemaining || 0,
      freeAddsRemaining: cardResult?.cardAddsFreeRemaining || 0,
    });
  } catch (error: any) {
    console.error('❌ Error creating gift:', error);
    res.status(500).json({ error: 'Failed to create gift', details: error?.message });
  }
});



app.get('/api/gifts/history', authenticateToken, async (req: AuthRequest, res) => {
  const sender_did = req.userId || req.user?.id;
  if (!sender_did) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const cacheKey = `gift_history:${sender_did}`;
    const cachedHistory = sharedCache.get<any[]>(cacheKey);
    if (cachedHistory) {
      console.log(`💾 Cache hit for gift history (${sender_did})`);
      return res.json(cachedHistory);
    }

    // Try to get from database first
    const userGifts = await getGiftsBySender(sender_did);
    
    // Ensure all required fields are present and format the response
    const formattedGifts = userGifts.map((gift: any) => ({
      id: gift.id,
      sender_did: gift.sender_did,
      sender_email: gift.sender_email,
      recipient_email: gift.recipient_email,
      token_mint: gift.token_mint,
      token_symbol: gift.token_symbol,
      token_decimals: gift.token_decimals,
      amount: parseFloat(gift.amount),
      usd_value: gift.usd_value ? parseFloat(gift.usd_value) : null,
      message: gift.message || '',
      status: gift.status,
      tiplink_url: gift.tiplink_url,
      tiplink_public_key: gift.tiplink_public_key,
      transaction_signature: gift.transaction_signature,
      created_at: gift.created_at,
      claimed_at: gift.claimed_at || null,
      claimed_by: gift.claimed_by || null,
      claim_signature: gift.claim_signature || null,
      expires_at: gift.expires_at || null,
      refunded_at: gift.refunded_at || null,
      refund_transaction_signature: gift.refund_transaction_signature || null,
    }));
    
    sharedCache.set(cacheKey, formattedGifts, 30 * 1000);
    res.json(formattedGifts);
  } catch (dbError: any) {
    console.error('⚠️ Failed to fetch gifts from database, using in-memory storage:', dbError?.message);
    console.error('Database error details:', dbError);
    // Fallback to in-memory storage if database fails
    const userGifts = gifts.filter(g => g.sender_did === sender_did);
    res.json(userGifts);
  }
});

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

// Get gift info by claim token (public - for claim page)
app.get('/api/gifts/info', giftInfoLimiter, async (req, res) => {
  const { token } = req.query;
  
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid claim token' });
  }
  
  try {
    // Look up gift by claim_token from database
    if (pool) {
      const result = await pool.query(
        `SELECT id, sender_email, recipient_email, token_symbol, amount, message, status, created_at, claim_attempts, locked_until
         FROM gifts 
         WHERE claim_token = $1`,
        [token]
      );
      
      if (result.rows.length > 0) {
        const gift = result.rows[0];
        
        // Check if lock has expired
        let isLocked = false;
        let minutesRemaining = 0;
        if (gift.locked_until) {
          const lockedUntil = new Date(gift.locked_until);
          const now = new Date();
          if (lockedUntil > now) {
            isLocked = true;
            minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
          } else {
            // Lock expired - unlock it
            await pool.query(
              `UPDATE gifts SET locked_until = NULL, claim_attempts = 0 WHERE id = $1`,
              [gift.id]
            );
          }
        }
        
        // Return public info only (hide sensitive data like TipLink URL)
        // Include recipient_email so frontend can verify email match before attempting claim
        return res.json({
          amount: gift.amount,
          token_symbol: gift.token_symbol,
          sender_email: gift.sender_email,
          recipient_email: gift.recipient_email, // Added for email verification
          message: gift.message,
          status: isLocked ? 'LOCKED' : gift.status, // Return LOCKED if temporarily locked
          created_at: gift.created_at,
          locked_until: gift.locked_until || null,
          minutes_remaining: isLocked ? minutesRemaining : null
        });
      }
    }
    
    // Fallback to in-memory storage (for backward compatibility with old gifts)
    const gift = gifts.find(g => g.id === token) || null;
    if (!gift) {
      return res.status(404).json({ error: 'Gift not found' });
    }
    
    // Return public info only (hide sensitive data)
    res.json({
      amount: gift.amount,
      token_symbol: gift.token_symbol,
      sender_email: gift.sender_email,
      message: gift.message,
      status: gift.status,
      created_at: gift.created_at
    });
  } catch (error: any) {
    console.error('❌ Error fetching gift:', error);
    res.status(500).json({ error: 'Failed to fetch gift' });
  }
});

// Legacy endpoint for backward compatibility (deprecated - use /api/gifts/info?token=...)
app.get('/api/gifts/:giftId', async (req, res) => {
  const { giftId } = req.params;
  
  try {
    // Try to get from database first
    let gift = await getGiftById(giftId);
    
    // Fallback to in-memory storage if not found in database
    if (!gift) {
      gift = gifts.find(g => g.id === giftId) || null;
    }
    
    if (!gift) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    // Return public info only (hide sensitive data)
    res.json({
      amount: gift.amount,
      token_symbol: gift.token_symbol,
      sender_email: gift.sender_email,
      message: gift.message,
      status: gift.status,
      created_at: gift.created_at
    });
  } catch (error: any) {
    console.error('❌ Error fetching gift:', error);
    res.status(500).json({ error: 'Failed to fetch gift' });
  }
});

// Secure claim endpoint (requires authentication and email verification)
app.post('/api/gifts/claim', claimLimiter, authenticateToken, async (req: AuthRequest, res) => {
  const { claim_token } = req.body;
  const user_email = req.user?.email?.address || req.user?.google?.email;
  const user_wallet = req.user?.wallet?.address;
  // Handle IP address (can be string or string[])
  const ipHeader = req.headers['x-forwarded-for'];
  const ip_address = typeof ipHeader === 'string' 
    ? ipHeader 
    : Array.isArray(ipHeader) 
      ? ipHeader[0] 
      : (req.ip || 'unknown');

  console.log('🎁 Secure claim attempt:', { 
    claim_token: claim_token?.substring(0, 8) + '...', 
    user_email,
    ip_address 
  });

  if (!claim_token) {
    return res.status(400).json({ error: 'Missing claim token' });
  }

  if (!user_email) {
    return res.status(400).json({ error: 'User email not found. Please ensure you are signed in.' });
  }

  // Find the gift by claim_token
  if (!pool) {
    return res.status(500).json({ error: 'Database not available' });
  }

  let gift: any = null;
  try {
    const result = await pool.query(
      `SELECT * FROM gifts WHERE claim_token = $1`,
      [claim_token]
    );
    
    if (result.rows.length === 0) {
      console.warn(`⚠️ Invalid claim token from ${ip_address}`);
      return res.status(404).json({ error: 'Gift not found' });
    }
    
    gift = result.rows[0];
  } catch (dbError: any) {
    console.error('❌ Error fetching gift from database:', dbError);
    return res.status(500).json({ error: 'Failed to fetch gift' });
  }

  // Check if already claimed
  if (gift.status !== 'SENT' && gift.status !== GiftStatus.SENT) {
    return res.status(400).json({ error: 'Gift has already been claimed or is expired' });
  }

  // Check if gift is temporarily locked due to too many failed attempts
  if (gift.locked_until) {
    const lockedUntil = new Date(gift.locked_until);
    const now = new Date();
    
    if (lockedUntil > now) {
      // Still locked - calculate remaining time
      const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
      return res.status(403).json({ 
        error: 'This gift has been temporarily locked due to multiple failed claim attempts',
        locked_until: gift.locked_until,
        minutes_remaining: minutesRemaining
      });
    } else {
      // Lock has expired - unlock it
      console.log(`🔓 Gift ${gift.id} lock expired, unlocking...`);
      if (pool) {
        try {
          await pool.query(
            `UPDATE gifts SET locked_until = NULL, claim_attempts = 0 WHERE id = $1`,
            [gift.id]
          );
        } catch (unlockError) {
          console.error('⚠️ Failed to unlock gift:', unlockError);
        }
      }
      // Continue with claim attempt
    }
  }

  // CRITICAL: Verify email matches recipient
  const recipientEmailNormalized = gift.recipient_email.toLowerCase().trim();
  const userEmailNormalized = user_email.toLowerCase().trim();
  
  if (recipientEmailNormalized !== userEmailNormalized) {
    console.error(`❌ Email mismatch: Expected ${gift.recipient_email}, got ${user_email} from IP ${ip_address}`);
    
    // Increment claim attempts
    if (pool) {
      try {
        await pool.query(
          `UPDATE gifts 
           SET claim_attempts = claim_attempts + 1, 
               last_claim_attempt = NOW(),
               ip_address = $1
           WHERE id = $2`,
          [ip_address, gift.id]
        );
        
        // Get updated attempt count
        const updatedResult = await pool.query(
          `SELECT claim_attempts FROM gifts WHERE id = $1`,
          [gift.id]
        );
        const attemptCount = updatedResult.rows[0]?.claim_attempts || gift.claim_attempts + 1;
        
        // Lock gift for 1 hour after 3 failed attempts
        if (attemptCount >= 3) {
          const lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
          await pool.query(
            `UPDATE gifts SET locked_until = $1 WHERE id = $2`,
            [lockedUntil.toISOString(), gift.id]
          );
          console.error(`🔒 Gift ${gift.id} locked until ${lockedUntil.toISOString()} due to ${attemptCount} failed attempts`);
        }
      } catch (updateError) {
        console.error('⚠️ Failed to update claim attempts:', updateError);
      }
    }
    
    return res.status(403).json({ 
      error: 'This gift is not for you',
      hint: 'Please check your email and ensure you are signed in with the correct account'
    });
  }

  console.log(`✅ Email verified: ${user_email} matches recipient`);

  // Get recipient wallet from user data (from Privy)
  if (!user_wallet) {
    // Try to get wallet from user's database record
    if (pool) {
      try {
        const userResult = await pool.query(
          `SELECT wallet_address FROM users WHERE email = $1`,
          [user_email]
        );
        if (userResult.rows.length > 0 && userResult.rows[0].wallet_address) {
          const recipient_wallet = userResult.rows[0].wallet_address;
          console.log('✅ Found wallet from database:', recipient_wallet);
          
          // Continue with claim using this wallet
          return await processGiftClaim(gift, recipient_wallet, req.userId || '', ip_address, res);
        }
      } catch (userError) {
        console.error('⚠️ Error fetching user wallet:', userError);
      }
    }
    
    return res.status(400).json({ error: 'Wallet address not found. Please ensure your wallet is connected.' });
  }

  // Process the claim
  return await processGiftClaim(gift, user_wallet, req.userId || '', ip_address, res);
});

// Helper function to process gift claim (extracted for reuse)
async function processGiftClaim(
  gift: any,
  recipient_wallet: string,
  recipient_did: string,
  ip_address: string,
  res: express.Response
) {
  try {
    // Decrypt TipLink URL
    const ENCRYPTION_KEY = process.env.TIPLINK_ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
      throw new Error('Encryption key not configured');
    }

    let tiplinkUrl: string;
    if (gift.tiplink_url_encrypted) {
      try {
        tiplinkUrl = decryptTipLink(gift.tiplink_url_encrypted, ENCRYPTION_KEY);
        console.log('✅ TipLink URL decrypted successfully');
      } catch (decryptError) {
        console.error('❌ Error decrypting TipLink URL:', decryptError);
        // Fallback to plain text URL for backward compatibility
        if (gift.tiplink_url) {
          tiplinkUrl = gift.tiplink_url;
          console.log('⚠️ Using plain text TipLink URL (backward compatibility)');
        } else {
          throw new Error('TipLink URL not available');
        }
      }
    } else if (gift.tiplink_url) {
      // Backward compatibility: use plain text URL if encrypted version doesn't exist
      tiplinkUrl = gift.tiplink_url;
      console.log('⚠️ Using plain text TipLink URL (legacy gift)');
    } else {
      throw new Error('TipLink URL not found');
    }

    // Load the TipLink
    console.log('📦 Loading TipLink from URL');
    const tipLink = await TipLink.fromUrl(new URL(tiplinkUrl));
    console.log('✅ TipLink loaded:', tipLink.keypair.publicKey.toBase58());
    
    // Check TipLink balance (will check SOL or SPL token balance based on token type)
    const tiplinkBalanceLamports = await connection.getBalance(tipLink.keypair.publicKey);
    console.log('💰 TipLink SOL balance:', tiplinkBalanceLamports / LAMPORTS_PER_SOL, 'SOL');

    const recipientPubkey = new PublicKey(recipient_wallet);
    console.log('👤 Recipient wallet:', recipientPubkey.toBase58());
    
    // Get token info - use gift's stored info
    let tokenInfo: { symbol: string; decimals: number; isNative?: boolean } | null = null;
    
    if (gift.token_symbol && gift.token_decimals) {
      tokenInfo = {
        symbol: gift.token_symbol,
        decimals: gift.token_decimals,
        isNative: gift.token_mint === 'So11111111111111111111111111111111111111112'
      };
      console.log(`✅ Using stored token info: ${tokenInfo.symbol} (${tokenInfo.decimals} decimals)`);
    } else {
      // Fallback to SUPPORTED_TOKENS
      const supportedToken = SUPPORTED_TOKENS.find(t => t.mint === gift.token_mint);
      if (supportedToken) {
        tokenInfo = {
          symbol: supportedToken.symbol,
          decimals: supportedToken.decimals,
          isNative: supportedToken.isNative
        };
        console.log(`✅ Using supported token info: ${tokenInfo.symbol}`);
      } else {
        // Try to fetch dynamically or use defaults
        if (gift.token_mint === 'So11111111111111111111111111111111111111112') {
          tokenInfo = { symbol: 'SOL', decimals: 9, isNative: true };
        } else {
          const knownToken = KNOWN_TOKENS[gift.token_mint];
          tokenInfo = {
            symbol: knownToken?.symbol || gift.token_symbol || 'UNKNOWN',
            decimals: gift.token_decimals || 9,
            isNative: false
          };
          console.log(`✅ Using fallback token info: ${tokenInfo.symbol} (${tokenInfo.decimals} decimals)`);
        }
      }
    }
    
    if (!tokenInfo) {
      // Use defaults if we can't determine token info
      tokenInfo = {
        symbol: gift.token_symbol || 'UNKNOWN',
        decimals: gift.token_decimals || 9,
        isNative: gift.token_mint === 'So11111111111111111111111111111111111111112'
      };
      console.warn(`⚠️ Using default token info: ${tokenInfo.symbol} (${tokenInfo.decimals} decimals)`);
    }

    let signature: string;
    let claimedAmount = gift.amount;

    // Transfer from TipLink → Recipient
    if (tokenInfo.isNative) {
      // Native SOL transfer
      console.log(`💸 Preparing SOL transfer for gift ${gift.id}...`);
      
      // Reserve some SOL for transaction fee (5000 lamports = 0.000005 SOL)
      const FEE_RESERVE = 5000;
      let transferLamports = tiplinkBalanceLamports - FEE_RESERVE;
      
      if (transferLamports <= 0) {
        throw new Error('Insufficient TipLink balance after reserving transaction fee');
      }
      
      // Ensure lamports is a whole number (safety against floating point ops)
      transferLamports = Math.floor(transferLamports);
      
      console.log('📊 Transfer details:', {
        totalBalanceLamports: tiplinkBalanceLamports,
        totalBalanceSOL: (tiplinkBalanceLamports / LAMPORTS_PER_SOL).toFixed(9),
        feeReserveLamports: FEE_RESERVE,
        feeReserveSOL: (FEE_RESERVE / LAMPORTS_PER_SOL).toFixed(9),
        transferLamports,
        transferSOL: (transferLamports / LAMPORTS_PER_SOL).toFixed(9),
        isInteger: Number.isInteger(transferLamports),
      });
      
      claimedAmount = transferLamports / LAMPORTS_PER_SOL;

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: tipLink.keypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: transferLamports,
        })
      );

      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [tipLink.keypair],
        { commitment: 'confirmed' }
      );
    } else {
      // SPL Token transfer
      console.log(`💸 Preparing SPL token transfer: ${gift.amount} ${gift.token_symbol} to recipient...`);
      
      const mintPubkey = new PublicKey(gift.token_mint);
      const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tipLink.keypair.publicKey);
      const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      // ✅ CRITICAL: Check if TipLink has the SPL tokens before attempting transfer
      console.log(`🔍 Checking TipLink token account: ${tiplinkATA.toBase58()}`);
      let tiplinkTokenAccount;
      try {
        tiplinkTokenAccount = await getAccount(connection, tiplinkATA);
        const tokenBalanceRaw = Number(tiplinkTokenAccount.amount);
        const tokenBalance = tokenBalanceRaw / (10 ** gift.token_decimals);
        console.log(`💰 TipLink ${gift.token_symbol} balance: ${tokenBalance} ${gift.token_symbol}`);
        
        // Calculate required amount in raw units (smallest unit) to avoid floating-point precision issues
        const requiredAmountRaw = Math.floor(gift.amount * (10 ** gift.token_decimals));
        
        // Check if TipLink has enough tokens (compare raw amounts to avoid floating-point issues)
        if (tokenBalanceRaw < requiredAmountRaw) {
          // If insufficient due to precision, use what's available (but log a warning)
          const difference = (requiredAmountRaw - tokenBalanceRaw) / (10 ** gift.token_decimals);
          if (difference < 0.000001) {
            // Very small difference (likely precision issue) - allow it and transfer what's available
            console.warn(`⚠️ TipLink has slightly less than requested (precision issue). Available: ${tokenBalance}, Requested: ${gift.amount}, Difference: ${difference}`);
          } else {
            // Significant difference - throw error
            throw new Error(`Insufficient ${gift.token_symbol} balance in TipLink. Required: ${gift.amount}, Available: ${tokenBalance}`);
          }
        }
        
        console.log(`✅ TipLink has sufficient ${gift.token_symbol} balance`);
      } catch (error: any) {
        if (error.name === 'TokenAccountNotFoundError' || error.message?.includes('could not find account')) {
          throw new Error(`TipLink does not have a ${gift.token_symbol} token account. The gift may not have been funded correctly.`);
        }
        throw error;
      }

      const instructions = [];
      
      // Create recipient's associated token account if it doesn't exist
      const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
      if (!recipientAccountInfo) {
        console.log(`📝 Creating recipient token account: ${recipientATA.toBase58()}`);
        instructions.push(
          createAssociatedTokenAccountInstruction(
            tipLink.keypair.publicKey,
            recipientATA,
            recipientPubkey,
            mintPubkey
          )
        );
      } else {
        console.log(`✅ Recipient token account exists: ${recipientATA.toBase58()}`);
      }

      // Calculate transfer amount in token's smallest unit
      // Use the minimum of requested amount and available balance to handle precision issues
      const requestedAmountRaw = Math.floor(gift.amount * (10 ** gift.token_decimals));
      const availableAmountRaw = Number(tiplinkTokenAccount.amount);
      const transferAmount = BigInt(Math.min(requestedAmountRaw, availableAmountRaw));
      
      console.log(`📊 Transfer details:`, {
        tokenSymbol: gift.token_symbol,
        tokenAmount: gift.amount,
        requestedAmountRaw: requestedAmountRaw.toString(),
        availableAmountRaw: availableAmountRaw.toString(),
        transferAmountRaw: transferAmount.toString(),
        actualTransferAmount: Number(transferAmount) / (10 ** gift.token_decimals),
        recipientATA: recipientATA.toBase58()
      });

      // Transfer SPL tokens
      instructions.push(
        createTransferInstruction(
          tiplinkATA,
          recipientATA,
          tipLink.keypair.publicKey,
          transferAmount
        )
      );

      const transaction = new Transaction().add(...instructions);
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [tipLink.keypair],
        { commitment: 'confirmed' }
      );
      
      // Update claimedAmount to reflect actual amount transferred (may be less due to precision)
      claimedAmount = Number(transferAmount) / (10 ** gift.token_decimals);
    }

    console.log('✅ Gift claimed! Transaction:', signature);

    // Update gift status in database with security fields
    if (pool) {
      try {
        await pool.query(
          `UPDATE gifts 
           SET status = $1,
               claimed_at = NOW(),
               claimed_by = $2,
               claim_signature = $3,
               email_verified = TRUE,
               ip_address = $4
           WHERE id = $5`,
          ['CLAIMED', recipient_did, signature, ip_address, gift.id]
        );
        console.log('✅ Gift claim status updated in database with security fields');
      } catch (dbError: any) {
        console.error('⚠️ Failed to update gift claim status in database:', dbError?.message);
        // Try legacy update function as fallback
        try {
          await updateGiftClaim(gift.id, recipient_did, signature);
        } catch (legacyError) {
          console.error('⚠️ Legacy update also failed:', legacyError);
        }
      }
    } else {
      // Fallback to legacy update if pool is not available
      try {
        await updateGiftClaim(gift.id, recipient_did, signature);
      } catch (legacyError) {
        console.error('⚠️ Legacy update failed:', legacyError);
      }
    }

    if (gift.sender_did) {
      sharedCache.delete(`gift_history:${gift.sender_did}`);
    }

    return res.json({
      success: true,
      signature,
      amount: claimedAmount,
      token_symbol: gift.token_symbol
    });
  } catch (error: any) {
    console.error('❌ Error processing gift claim:', error);
    return res.status(500).json({ error: 'Failed to claim gift', details: error?.message });
  }
}

// Legacy claim endpoint for backward compatibility (deprecated - use /api/gifts/claim with claim_token)
app.post('/api/gifts/:giftId/claim', async (req, res) => {
  const { giftId } = req.params;
  const { recipient_did, recipient_wallet } = req.body;

  console.log('🎁 Legacy claim attempt:', { giftId, recipient_did, recipient_wallet });

  if (!recipient_did || !recipient_wallet) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find the gift
  let gift = null;
  try {
    gift = await getGiftById(giftId);
    // Fallback to in-memory storage if not found in database
    if (!gift) {
      gift = gifts.find(g => g.id === giftId) || null;
    }
  } catch (dbError: any) {
    console.error('⚠️ Failed to fetch gift from database, using in-memory storage:', dbError?.message);
    gift = gifts.find(g => g.id === giftId) || null;
  }
  
  if (!gift) {
    return res.status(404).json({ error: 'Gift not found' });
  }

  // Check if already claimed
  if (gift.status !== GiftStatus.SENT) {
    return res.status(400).json({ error: 'Gift has already been claimed or is expired' });
  }

  // For legacy gifts, use plain text TipLink URL
  try {
    const tiplinkUrl = gift.tiplink_url;
    if (!tiplinkUrl) {
      return res.status(400).json({ error: 'TipLink URL not found' });
    }

    const tipLink = await TipLink.fromUrl(new URL(tiplinkUrl));
    const recipientPubkey = new PublicKey(recipient_wallet);
    
    // Continue with transfer logic (same as before but without email verification)
    // ... (rest of legacy claim logic)
    return res.status(400).json({ error: 'Legacy claim endpoint is deprecated. Please use the secure claim endpoint.' });
  } catch (error: any) {
    console.error('❌ Error claiming gift:', error);
    return res.status(500).json({ error: 'Failed to claim gift', details: error?.message });
  }
});

// ============================================
// WITHDRAWAL ENDPOINTS
// ============================================

// Record withdrawal
app.post('/api/withdrawals/create', authenticateToken, async (req: AuthRequest, res) => {
  const {
    token_mint,
    amount,
    fee,
    recipient_address,
    transaction_signature,
    token_symbol,
    token_decimals,
  } = req.body;

  const sender_did = req.userId || req.user?.id;

  if (!sender_did || !token_mint || !amount || !recipient_address || !transaction_signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Validate Solana address
    try {
      new PublicKey(recipient_address);
    } catch {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    // Record withdrawal in database
    const withdrawalId = `withdrawal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (pool) {
      await pool.query(
        `INSERT INTO withdrawals (
          id, sender_did, token_mint, token_symbol, token_decimals,
          amount, fee, recipient_address, transaction_signature, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        [
          withdrawalId,
          sender_did,
          token_mint,
          token_symbol || null,
          token_decimals || null,
          amount,
          fee,
          recipient_address,
          transaction_signature,
        ]
      );
      console.log('✅ Withdrawal recorded:', withdrawalId);
    } else {
      console.warn('⚠️ Database not available, withdrawal not recorded');
    }

    res.json({
      success: true,
      withdrawal_id: withdrawalId,
    });
  } catch (error: any) {
    console.error('❌ Error recording withdrawal:', error);
    res.status(500).json({ error: 'Failed to record withdrawal', details: error?.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const KEEP_ALIVE_URL =
  process.env.KEEP_ALIVE_URL ||
  (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/health` : undefined);

if (KEEP_ALIVE_URL && process.env.NODE_ENV === 'production') {
  startKeepAlivePing(KEEP_ALIVE_URL, 5 * 60 * 1000);
}

// Initialize background jobs
console.log('🚀 Initializing background jobs...');
startGiftExpiryJob();
startCreditCleanupJob();

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
