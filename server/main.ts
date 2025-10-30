import express from 'express';
import cors from 'cors';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import 'dotenv/config';
import { authenticateToken, AuthRequest } from './authMiddleware';
import bs58 from 'bs58';


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
  balance: number; // SOL balance in treasury (not their wallet balance)
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
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY; // Treasury wallet private key
let FAKE_AUTHENTICATED_USER_DID = '';
const users: User[] = [];
const gifts: Gift[] = [];

// Initialize treasury wallet
let treasuryKeypair: Keypair;
if (TREASURY_PRIVATE_KEY) {
  try {
    treasuryKeypair = Keypair.fromSecretKey(bs58.decode(TREASURY_PRIVATE_KEY));
    console.log('✅ Treasury wallet loaded:', treasuryKeypair.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Invalid TREASURY_PRIVATE_KEY format');
    process.exit(1);
  }
} else {
  // Generate a new treasury wallet for development
  treasuryKeypair = Keypair.generate();
  console.log('⚠️ No TREASURY_PRIVATE_KEY found. Generated new treasury wallet:');
  console.log('Public Key:', treasuryKeypair.publicKey.toBase58());
  console.log('Private Key (base58):', bs58.encode(treasuryKeypair.secretKey));
  console.log('💡 Add this to server/.env as TREASURY_PRIVATE_KEY for production');
  console.log('🚰 Fund this wallet with devnet SOL: https://faucet.solana.com');
}

if (!HELIUS_API_KEY) {
  console.warn("⚠️ Warning: Missing HELIUS_API_KEY. Using public devnet RPC (rate limited).");
}

// ✅ FIXED: Always create connection (don't make it null)
// Use Helius devnet if API key exists, otherwise use public devnet RPC
// Helius format: https://mainnet.helius-rpc.com/?api-key=YOUR_KEY (change mainnet to devnet)
const RPC_URL = HELIUS_API_KEY
  ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.devnet.solana.com';

console.log('🌐 Connecting to Solana Devnet RPC:', RPC_URL.replace(HELIUS_API_KEY || '', '***'));

const connection = new Connection(RPC_URL, 'confirmed');

// Test connection
(async () => {
  try {
    const version = await connection.getVersion();
    console.log('✅ Successfully connected to Solana Devnet. Version:', version['solana-core']);
  } catch (error: any) {
    console.error('❌ Failed to connect to Solana RPC:', error?.message || error);
    console.error('🔧 Please check your HELIUS_API_KEY in server/.env file');
  }
})();

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
    user = { privy_did, wallet_address, email, balance: 0 }; // Initialize with 0 balance
    users.push(user);
    console.log('✅ Created new user:', user);
  } else {
    // Update wallet address if changed
    user.wallet_address = wallet_address;
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


// Get treasury wallet info (public key for deposits)
app.get('/api/treasury/info', (req, res) => {
  res.json({
    public_key: treasuryKeypair.publicKey.toBase58(),
    message: 'Send SOL to this address to add funds to your gifting balance'
  });
});

// 🚧 DEVELOPMENT ONLY: Add test balance
app.post('/api/treasury/add-test-balance', (req, res) => {
  const { privy_did, amount } = req.body;
  
  if (!privy_did || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = users.find(u => u.privy_did === privy_did);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.balance += amount;
  console.log(`💰 Test: Added ${amount} SOL to ${user.email}. New balance: ${user.balance}`);
  
  res.json({
    success: true,
    balance: user.balance
  });
});

// Get user's treasury balance
app.get('/api/treasury/balance', authenticateToken, (req: AuthRequest, res) => {
  const sender_did = req.user?.privy_did;
  if (!sender_did) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = users.find(u => u.privy_did === sender_did);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ balance: user.balance });
});

// Deposit funds (user sends SOL to treasury, we credit their balance)
app.post('/api/treasury/deposit', authenticateToken, async (req: AuthRequest, res) => {
  const sender_did = req.user?.privy_did;
  const { amount, signature } = req.body; // Transaction signature as proof

  if (!sender_did || !amount || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = users.find(u => u.privy_did === sender_did);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    // Verify the transaction on-chain
    console.log('🔍 Verifying deposit transaction:', signature);
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta) {
      return res.status(400).json({ error: 'Transaction not found or not confirmed' });
    }

    // Check if transaction was successful
    if (tx.meta.err) {
      return res.status(400).json({ error: 'Transaction failed on-chain' });
    }

    // Verify the transaction sent SOL to treasury wallet
    const treasuryPubkey = treasuryKeypair.publicKey.toBase58();
    const accountIndex = tx.transaction.message.staticAccountKeys.findIndex(
      key => key.toBase58() === treasuryPubkey
    );

    if (accountIndex === -1) {
      return res.status(400).json({ error: 'Transaction does not involve treasury wallet' });
    }

    // Get the amount received (postBalance - preBalance)
    const preBalance = tx.meta.preBalances[accountIndex];
    const postBalance = tx.meta.postBalances[accountIndex];
    const receivedLamports = postBalance - preBalance;
    const receivedSOL = receivedLamports / LAMPORTS_PER_SOL;

    console.log(`✅ Deposit verified: ${receivedSOL} SOL from ${user.email}`);

    // Credit user's balance
    user.balance += receivedSOL;

    res.json({
      success: true,
      balance: user.balance,
      deposited: receivedSOL
    });
  } catch (error: any) {
    console.error('❌ Error processing deposit:', error);
    res.status(500).json({ error: 'Failed to process deposit', details: error?.message });
  }
});

app.post('/api/gifts/create', async (req, res) => {
  const { sender_did, recipient_email, token_address, amount, message } = req.body;

  console.log('🎁 Creating gift:', { sender_did, recipient_email, token_address, amount });

  if (!recipient_email || !token_address || !amount || !sender_did) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find sender
  const sender = users.find(u => u.privy_did === sender_did);
  if (!sender) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if sender has sufficient balance
  if (sender.balance < amount) {
    return res.status(400).json({ 
      error: 'Insufficient balance',
      required: amount,
      available: sender.balance
    });
  }

  try {
    // Step 1: Create TipLink
    const newTipLink = await TipLink.create();
    const tiplinkUrl = newTipLink.url.toString();
    const tiplinkPublicKey = newTipLink.keypair.publicKey;
    
    console.log('✅ TipLink created:', tiplinkPublicKey.toBase58());

    // Step 2: Fund TipLink from treasury wallet
    console.log(`💸 Funding TipLink with ${amount} SOL from treasury...`);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasuryKeypair.publicKey,
        toPubkey: tiplinkPublicKey,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasuryKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log('✅ TipLink funded! Transaction:', signature);

    // Step 3: Deduct from sender's balance
    sender.balance -= amount;
    console.log(`💰 Deducted ${amount} SOL from ${sender.email}. New balance: ${sender.balance}`);

    // Step 4: Create gift record
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
    
    // ✅ Return all fields including transaction signature
    res.status(201).json({ 
      tiplink_url: tiplinkUrl,
      gift_id: newGift.id,
      tiplink_public_key: tiplinkPublicKey.toBase58(),
      signature: signature,
      new_balance: sender.balance
    });
  } catch (error: any) {
    console.error('❌ Error creating gift:', error);
    res.status(500).json({ error: 'Failed to create gift', details: error?.message });
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
