import express from 'express';
import cors from 'cors';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import 'dotenv/config';
import QRCode from 'qrcode';
import { authenticateToken, AuthRequest } from './authMiddleware';
import { sendGiftNotification } from './emailService';
import { insertGift, getGiftsBySender, getGiftById, updateGiftClaim } from './database';


// --- Types (duplicated from frontend for simplicity) ---
enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED'
}

interface User {
  privy_did: string;
  wallet_address: string;
  email: string;
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

// --- ENV VARS & MOCKS ---
const PORT = process.env.PORT || 3001;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const FEE_WALLET_ADDRESS = process.env.FEE_WALLET_ADDRESS;
const FEE_PERCENTAGE = 0.001; // 0.1% fee
let FAKE_AUTHENTICATED_USER_DID = '';
const users: User[] = [];
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

// --- TOKEN METADATA FETCHING ---
interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
}

// Function to fetch token metadata from Helius API (batch)
async function fetchTokenMetadata(
  mintAddresses: string[],
  heliusApiKey: string
): Promise<TokenMetadata[]> {
  if (!heliusApiKey || mintAddresses.length === 0) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: mintAddresses }),
      }
    );

    if (!response.ok) {
      console.error(`Helius API error: ${response.status}`);
      return [];
    }

    const metadata = await response.json();
    return metadata.map((token: any) => ({
      mint: token.mint,
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown Token',
      decimals: token.decimals || 0,
      logo: token.image || '',
    }));
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return [];
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

// --- ROUTES ---

// --- ROUTES ---

app.post('/api/user/sync', authenticateToken, (req: AuthRequest, res) => {
  const { privy_did, wallet_address, email } = req.body;
  
  console.log('✅ Received user sync request:', { privy_did, wallet_address, email });
  
  // Verify the authenticated user matches the request
  if (req.user?.id !== privy_did) {
    return res.status(403).json({ error: 'Unauthorized: User ID mismatch' });
  }
  
  if (!privy_did || !wallet_address || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let user = users.find(u => u.privy_did === privy_did);
  if (!user) {
    user = { privy_did, wallet_address, email };
    users.push(user);
    console.log('✅ Created new user:', user);
  } else {
    // Update wallet address and email if changed
    user.wallet_address = wallet_address;
    user.email = email;
    console.log('✅ Found existing user:', user);
  }

  res.status(200).json(user);
});


app.get('/api/wallet/balances/:address', async (req, res) => {
  const { address } = req.params;

  console.log('🔍 Fetching balance for:', address);

  try {
    const balances: any[] = [];
    
    // ✅ Fetch SOL balance
    const solBalance = await connection.getBalance(new PublicKey(address));
    const solAmount = solBalance / LAMPORTS_PER_SOL;
    
    if (solAmount > 0) {
      balances.push({
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        decimals: 9,
        balance: solAmount,
        usdValue: solAmount * 150 // Mock USD price
      });
    }
    
    // ✅ Fetch SPL token balances using Solana RPC
    try {
      const walletPubkey = new PublicKey(address);
      
      // Get all token accounts for this wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });
      
      console.log(`🔍 Found ${tokenAccounts.value.length} token account(s)`);
      
      // Collect all mint addresses with non-zero balances
      const tokenData: Array<{ mint: string; balance: number; decimals: number }> = [];
      const mintAddresses: string[] = [];
      
      for (const accountInfo of tokenAccounts.value) {
        const parsedInfo = accountInfo.account.data.parsed.info;
        const mintAddress = parsedInfo.mint;
        const tokenAmount = parsedInfo.tokenAmount;
        
        // Only include tokens with non-zero balance
        if (tokenAmount.uiAmount > 0) {
          mintAddresses.push(mintAddress);
          tokenData.push({
            mint: mintAddress,
            balance: tokenAmount.uiAmount,
            decimals: tokenAmount.decimals,
          });
        }
      }
      
      // Batch fetch metadata for all tokens
      let metadataMap = new Map<string, TokenMetadata>();
      if (mintAddresses.length > 0 && HELIUS_API_KEY) {
        console.log(`📊 Fetching metadata for ${mintAddresses.length} token(s)...`);
        const metadataList = await fetchTokenMetadata(mintAddresses, HELIUS_API_KEY);
        
        // Create a map for quick lookup
        metadataMap = new Map(metadataList.map((m) => [m.mint, m]));
        console.log(`✅ Fetched metadata for ${metadataList.length} token(s)`);
      }
      
      // Combine token data with metadata
      for (const token of tokenData) {
        const metadata = metadataMap.get(token.mint);
        const knownToken = KNOWN_TOKENS[token.mint];
        
        // Use metadata from Helius if available, otherwise fallback to known tokens, then defaults
        let tokenSymbol = metadata?.symbol || knownToken?.symbol || 'UNKNOWN';
        let tokenName = metadata?.name || knownToken?.name || 'Unknown Token';
        let tokenLogo = metadata?.logo || knownToken?.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
        
        balances.push({
          address: token.mint,
          symbol: tokenSymbol,
          name: tokenName,
          logoURI: tokenLogo,
          decimals: token.decimals,
          balance: token.balance,
          usdValue: token.balance * 0 // TODO: Add USD price lookup
        });
      }
    } catch (splError) {
      console.warn('⚠️ Error fetching SPL tokens:', splError);
      // Continue with SOL balance only
    }
    
    // Sort by symbol alphabetically
    balances.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    console.log(`💰 Returning ${balances.length} token(s) with non-zero balance`);
    
    res.json(balances);
  } catch (error) {
    console.error('❌ Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
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

// Create TipLink (Step 1 of gift creation)
app.post('/api/tiplink/create', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const newTipLink = await TipLink.create();
    const tiplinkUrl = newTipLink.url.toString();
    const tiplinkPublicKey = newTipLink.keypair.publicKey.toBase58();
    
    console.log('✅ TipLink created:', tiplinkPublicKey, 'for user:', req.user?.id);
    
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
  if (req.user?.id !== sender_did) {
    return res.status(403).json({ error: 'Unauthorized: Sender ID mismatch' });
  }

  if (!recipient_email || !token_mint || !amount || !sender_did || !tiplink_url || !tiplink_public_key || !funding_signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find sender
  const sender = users.find(u => u.privy_did === sender_did);
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

    console.log('✅ Funding transaction verified!');

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
    
    // Send email notification to recipient
    const claimUrl = `/claim/${giftId}`;
    const fullClaimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${claimUrl}`;
    
    // Generate QR code from claim URL
    console.log('📱 Generating QR code for claim URL...');
    let qrCodeDataUrl: string | undefined;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(fullClaimUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0c4a6e',
          light: '#ffffff'
        }
      });
      console.log('✅ QR code generated successfully');
    } catch (error) {
      console.error('⚠️ Failed to generate QR code:', error);
      // Continue without QR code - email will still be sent
    }
    
    console.log('📧 Sending email notification to recipient...');
    const emailResult = await sendGiftNotification({
      recipientEmail: recipient_email,
      senderEmail: sender.email,
      amount,
      tokenSymbol: tokenInfo.symbol,
      claimUrl: fullClaimUrl,
      qrCode: qrCodeDataUrl,
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
  const sender_did = req.user?.id;
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
    
    // Check TipLink balance
    const tiplinkBalance = await connection.getBalance(tipLink.keypair.publicKey);
    console.log('💰 TipLink balance:', tiplinkBalance / LAMPORTS_PER_SOL, 'SOL');

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

    // Transfer from TipLink → Recipient
    if (tokenInfo.isNative) {
      // Native SOL transfer
      console.log(`💸 Transferring ${gift.amount} ${gift.token_symbol} to recipient...`);
      
      // Reserve some SOL for transaction fee (5000 lamports = 0.000005 SOL)
      const FEE_RESERVE = 5000;
      const transferAmount = (gift.amount * LAMPORTS_PER_SOL) - FEE_RESERVE;
      
      if (transferAmount <= 0) {
        throw new Error('Gift amount too small to cover transaction fee');
      }
      
      console.log(`📊 Transfer details: ${transferAmount / LAMPORTS_PER_SOL} ${gift.token_symbol} (${gift.amount} ${gift.token_symbol} - ${FEE_RESERVE / LAMPORTS_PER_SOL} ${gift.token_symbol} fee reserve)`);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: tipLink.keypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: transferAmount,
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
      console.log(`💸 Transferring ${gift.amount} ${gift.token_symbol} to recipient...`);
      
      const mintPubkey = new PublicKey(gift.token_mint);
      const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tipLink.keypair.publicKey);
      const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      const instructions = [];
      
      // Create recipient's associated token account if it doesn't exist
      const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
      if (!recipientAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            tipLink.keypair.publicKey,
            recipientATA,
            recipientPubkey,
            mintPubkey
          )
        );
      }

      // Transfer SPL tokens
      instructions.push(
        createTransferInstruction(
          tiplinkATA,
          recipientATA,
          tipLink.keypair.publicKey,
          gift.amount * (10 ** gift.token_decimals)
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
      amount: gift.amount,
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
