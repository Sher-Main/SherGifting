import express from 'express';
import cors from 'cors';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import 'dotenv/config';
import { authenticateToken, AuthRequest } from './authMiddleware';


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
  recipient_email: string;
  token_address: string;
  token_symbol: string;
  amount: number;
  message: string;
  status: GiftStatus;
  tiplink_url: string;
  tiplink_id: string;
  created_at: string;
  claimed_at?: string | null;
}

const app = express();
app.use(express.json());
app.use(cors());

// --- ENV VARS & MOCKS ---
const PORT = process.env.PORT || 3001;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
let FAKE_AUTHENTICATED_USER_DID = '';
const users: User[] = [];
const gifts: Gift[] = [];

if (!HELIUS_API_KEY) {
  console.warn("Warning: Missing HELIUS_API_KEY. Wallet balances will be mocked.");
}

// ✅ FIXED: Always create connection (don't make it null)
// Use Helius devnet if API key exists, otherwise use public devnet RPC
const connection = HELIUS_API_KEY
  ? new Connection(`https://rpc-devnet.helius.xyz/?api-key=${HELIUS_API_KEY}`, 'confirmed')
  : new Connection('https://api.devnet.solana.com', 'confirmed');


console.log('🌐 Connected to Solana Devnet');

// ✅ FIX: Remove TipLink initialization - we'll use the static create() method instead
// TipLink doesn't need to be initialized with a client, we use it directly

// --- ROUTES ---

// --- ROUTES ---

app.post('/api/user/sync', (req, res) => {  // ✅ NO authenticateToken here
  const { privy_did, wallet_address, email } = req.body;
  
  console.log('✅ Received user sync request:', { privy_did, wallet_address, email });
  
  if (!privy_did || !wallet_address || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let user = users.find(u => u.privy_did === privy_did);
  if (!user) {
    user = { privy_did, wallet_address, email };
    users.push(user);
    console.log('✅ Created new user:', user);
  } else {
    console.log('✅ Found existing user:', user);
  }

  res.status(200).json(user);
});


app.get('/api/wallet/balances/:address', async (req, res) => {
  const { address } = req.params;

  console.log('🔍 Fetching balance for:', address);

  try {
    // ✅ Now connection is always defined
    const solBalance = await connection.getBalance(new PublicKey(address));
    const solAmount = solBalance / LAMPORTS_PER_SOL;
    
    console.log('💰 Balance:', solAmount, 'SOL');

    res.json([{
      address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      decimals: 9,
      balance: solAmount,
      usdValue: solAmount * 150 // Mock USD price
    }]);
  } catch (error) {
    console.error('❌ Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});


app.post('/api/gifts/create', async (req, res) => {
  const { sender_did, recipient_email, token_address, amount, message } = req.body;

  console.log('🎁 Creating gift:', { sender_did, recipient_email, token_address, amount });

  if (!recipient_email || !token_address || !amount || !sender_did) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Step 1: Create TipLink
    const newTipLink = await TipLink.create();
    const tiplinkUrl = newTipLink.url.toString();
    const tiplinkPublicKey = newTipLink.keypair.publicKey;
    
    console.log('✅ TipLink created:', tiplinkPublicKey.toBase58());

    // Step 2: Create gift record
    const newGift: Gift = {
      id: String(gifts.length + 1),
      sender_did,
      recipient_email,
      token_address,
      amount,
      message: message || '',
      token_symbol: 'SOL',
      status: GiftStatus.SENT,
      tiplink_url: tiplinkUrl,
      tiplink_id: tiplinkPublicKey.toBase58(),
      created_at: new Date().toISOString()
    };

    gifts.push(newGift);
    
    console.log('✅ Gift created successfully:', newGift.id);
    
    // ✅ Return all three fields
    res.status(201).json({ 
      tiplink_url: tiplinkUrl,
      gift_id: newGift.id,
      tiplink_public_key: tiplinkPublicKey.toBase58()
    });
  } catch (error) {
    console.error('❌ Error creating gift:', error);
    res.status(500).json({ error: 'Failed to create gift' });
  }
});



app.get('/api/gifts/history', /* authenticateToken, */ (req: AuthRequest, res) => {
  const sender_did = req.userId!;
  const userGifts = gifts.filter(g => g.sender_did === sender_did);
  res.json(userGifts);
});

app.post('/api/gifts/claim', /* authenticateToken, */ (req: AuthRequest, res) => {
  const claimer_did = req.userId!;
  const { tipLinkId, claimer_wallet_address } = req.body;

  if (!tipLinkId || !claimer_wallet_address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const gift = gifts.find(g => g.tiplink_id === tipLinkId);

  if (!gift) {
    return res.status(404).json({ error: 'Gift not found' });
  }

  if (gift.status !== GiftStatus.SENT) {
    return res.status(400).json({ error: 'Gift has already been claimed or is expired.' });
  }

  gift.status = GiftStatus.CLAIMED;
  gift.claimed_at = new Date().toISOString();
  
  res.json({ success: true });
});

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

app.get('/api/gifts/info/:tipLinkId', (req, res) => {
  const gift = gifts.find(g => g.tiplink_id === req.params.tipLinkId);
  
  if (gift) {
    res.json(gift);
  } else {
    res.status(404).json({ error: 'Gift not found' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
