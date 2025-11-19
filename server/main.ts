import express from 'express';
import cors from 'cors';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import 'dotenv/config';
import { authenticateToken, AuthRequest } from './authMiddleware';
import { sendGiftNotification } from './emailService';
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
import userRoutes from './routes/user';


// --- Types (duplicated from frontend for simplicity) ---
enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED'
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
}

const app = express();
app.use(express.json());

// ✅ CORS configuration - allow Vercel frontend and localhost
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://sher-gifting.vercel.app',
  'https://sher-gifting-4behyaor6-aniketde9s-projects.vercel.app', // Vercel preview URLs
  FRONTEND_URL,
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // For development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use('/api/user', userRoutes);

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

const connection = new Connection(RPC_URL, 'confirmed');

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

    console.log(`📊 Fetching balances for wallet: ${address}`);

    // Get SOL balance
    const solBalance = await connection.getBalance(new PublicKey(address));
    const solInLamports = solBalance / LAMPORTS_PER_SOL;

    // Get SOL price from Jupiter Tokens API V2 (same API, includes price!)
    const solMint = 'So11111111111111111111111111111111111111112';
    const solSearchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${solMint}`;
    const solResponse = await fetch(solSearchUrl);
    const solData = await solResponse.json();
    const solToken = Array.isArray(solData) && solData.length > 0 ? solData[0] : null;
    
    // 🔥 V2 includes price as usdPrice in the response
    const solPriceValue = solToken?.usdPrice;
    const solPrice: number = (solToken && typeof solPriceValue === 'number') 
      ? solPriceValue 
      : 0;

    console.log(`💰 SOL Balance: ${solInLamports.toFixed(4)} SOL ($${(solInLamports * solPrice).toFixed(2)})`);

    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(address),
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`🪙 Found ${tokenAccounts.value.length} token accounts`);

    // Extract tokens with balance > 0
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

    // Fetch ALL token info from Jupiter (metadata + prices)
    const mintAddresses = tokenData.map(t => t.mint);
    const jupiterTokenMap = await fetchJupiterTokenInfo(mintAddresses);

    // Build response with SOL first
    const balances = [
      {
        address: solMint,
        symbol: 'SOL',
        name: solToken?.name || 'Wrapped SOL',
        logoURI: solToken?.icon || 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        decimals: 9,
        balance: solInLamports,
        usdValue: solInLamports * solPrice,
        verified: true,
        tags: ['verified'],
      },
    ];

    // Add SPL tokens with Jupiter data
    for (const token of tokenData) {
      const jupiterInfo = jupiterTokenMap.get(token.mint);
      
      if (jupiterInfo) {
        // Found in Jupiter - use their data
        // jupiterInfo.price is guaranteed to be a number from the interface
        const usdValue: number = token.balance * jupiterInfo.price;
        
        balances.push({
          address: token.mint,
          symbol: jupiterInfo.symbol,
          name: jupiterInfo.name,
          logoURI: jupiterInfo.logoURI,
          decimals: token.decimals,
          balance: token.balance,
          usdValue: usdValue,
          verified: jupiterInfo.verified,
          tags: jupiterInfo.tags,
        });
        
        console.log(`📦 ${jupiterInfo.symbol}: ${token.balance.toFixed(4)} ($${usdValue.toFixed(2)}) ${jupiterInfo.verified ? '✓' : ''}`);
      } else {
        // Not found in Jupiter - use fallback with truncated mint
        const shortMint = `${token.mint.substring(0, 4)}...${token.mint.substring(token.mint.length - 4)}`;
        
        balances.push({
          address: token.mint,
          symbol: shortMint,
          name: `Unknown ${shortMint}`,
          logoURI: '',
          decimals: token.decimals,
          balance: token.balance,
          usdValue: 0,  // Explicitly 0 as a number
          verified: false,
          tags: ['unknown'],
        });
        
        console.warn(`⚠️ No data found for: ${token.mint}`);
      }
    }

    // Sort by USD value (highest first)
    balances.sort((a, b) => b.usdValue - a.usdValue);

    const totalUsdValue: number = balances.reduce((sum, t) => sum + t.usdValue, 0);
    console.log(`✅ Returning ${balances.length} balances (total: $${totalUsdValue.toFixed(2)})`);
    
    res.json(balances);
  } catch (error) {
    console.error('❌ Error fetching wallet balances:', error);
    res.status(500).json({ 
      error: 'Failed to fetch wallet balances',
      details: error instanceof Error ? error.message : 'Unknown error'
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
  const { sender_did, recipient_email, token_mint, amount, message, tiplink_url, tiplink_public_key, funding_signature, token_symbol, token_decimals } = req.body;

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

    // Create gift record
    const giftId = `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      tiplink_url,
      tiplink_public_key,
      transaction_signature: funding_signature,
      created_at: new Date().toISOString()
    };

    // Save to database (persistent storage)
    try {
      await insertGift(newGift);
      console.log('✅ Gift saved to database:', newGift.id);
    } catch (dbError: any) {
      console.error('⚠️ Failed to save gift to database, using in-memory storage:', dbError?.message);
      // Fallback to in-memory storage if database fails
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
    
    // Send email notification to recipient
    const claimUrl = `/claim/${giftId}`;
    const fullClaimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${claimUrl}`;
    
    console.log('📧 Sending email notification to recipient...');
    const emailResult = await sendGiftNotification({
      recipientEmail: recipient_email,
      senderEmail: sender.email,
      amount,
      tokenSymbol: tokenInfo.symbol,
      tokenName: tokenName,
      usdValue: usdValue, // Use the USD value we calculated and stored in gift
      claimUrl: fullClaimUrl,
      message: message || undefined,
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
      signature: funding_signature
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
    // Try to get from database first
    const userGifts = await getGiftsBySender(sender_did);
    res.json(userGifts);
  } catch (dbError: any) {
    console.error('⚠️ Failed to fetch gifts from database, using in-memory storage:', dbError?.message);
    // Fallback to in-memory storage if database fails
    const userGifts = gifts.filter(g => g.sender_did === sender_did);
    res.json(userGifts);
  }
});

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

// Get gift info by ID (public - for claim page)
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

// Claim a gift (requires Privy authentication via recipient)
app.post('/api/gifts/:giftId/claim', async (req, res) => {
  const { giftId } = req.params;
  const { recipient_did, recipient_wallet } = req.body;

  console.log('🎁 Claiming gift:', { giftId, recipient_did, recipient_wallet });

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

  try {
    // Load the TipLink
    console.log('📦 Loading TipLink from URL:', gift.tiplink_url);
    const tipLink = await TipLink.fromUrl(new URL(gift.tiplink_url));
    console.log('✅ TipLink loaded:', tipLink.keypair.publicKey.toBase58());
    
    // Check TipLink balance (will check SOL or SPL token balance based on token type)
    const tiplinkBalanceLamports = await connection.getBalance(tipLink.keypair.publicKey);
    console.log('💰 TipLink SOL balance:', tiplinkBalanceLamports / LAMPORTS_PER_SOL, 'SOL');

    const recipientPubkey = new PublicKey(recipient_wallet);
    console.log('👤 Recipient wallet:', recipientPubkey.toBase58());
    
    // Get token info - use gift's stored info or fetch from SUPPORTED_TOKENS
    let tokenInfo: { symbol: string; decimals: number; isNative?: boolean } | null = null;
    
    // Use stored token info from gift (most reliable)
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
        const tokenBalance = Number(tiplinkTokenAccount.amount) / (10 ** gift.token_decimals);
        console.log(`💰 TipLink ${gift.token_symbol} balance: ${tokenBalance} ${gift.token_symbol}`);
        
        // Check if TipLink has enough tokens
        if (tokenBalance < gift.amount) {
          throw new Error(`Insufficient ${gift.token_symbol} balance in TipLink. Required: ${gift.amount}, Available: ${tokenBalance}`);
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
      const transferAmount = BigInt(Math.floor(gift.amount * (10 ** gift.token_decimals)));
      console.log(`📊 Transfer details:`, {
        tokenSymbol: gift.token_symbol,
        tokenAmount: gift.amount,
        transferAmountRaw: transferAmount.toString(),
        tiplinkBalance: Number(tiplinkTokenAccount.amount).toString(),
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
    }

    console.log('✅ Gift claimed! Transaction:', signature);

    // Update gift status in database
    try {
      await updateGiftClaim(giftId, recipient_did, signature);
      console.log('✅ Gift claim status updated in database');
    } catch (dbError: any) {
      console.error('⚠️ Failed to update gift claim status in database, using in-memory storage:', dbError?.message);
      // Fallback to in-memory storage if database fails
      gift.status = GiftStatus.CLAIMED;
      gift.claimed_at = new Date().toISOString();
      gift.claimed_by = recipient_did;
      gift.claim_signature = signature;
    }

    res.json({
      success: true,
      signature,
      amount: claimedAmount,
      token_symbol: gift.token_symbol
    });
  } catch (error: any) {
    console.error('❌ Error claiming gift:', error);
    res.status(500).json({ error: 'Failed to claim gift', details: error?.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
