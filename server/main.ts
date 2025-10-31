import express from 'express';
import cors from 'cors';
import { TipLink } from '@tiplink/api';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import 'dotenv/config';
import { authenticateToken, AuthRequest } from './authMiddleware';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';


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
  // Generate a new treasury wallet and auto-save to .env
  treasuryKeypair = Keypair.generate();
  const privateKeyBase58 = bs58.encode(treasuryKeypair.secretKey);
  
  console.log('⚠️ No TREASURY_PRIVATE_KEY found. Generated new treasury wallet:');
  console.log('Public Key:', treasuryKeypair.publicKey.toBase58());
  console.log('💾 Auto-saving to server/.env...');
  
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    // Read existing .env if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Add or update TREASURY_PRIVATE_KEY
    if (envContent.includes('TREASURY_PRIVATE_KEY=')) {
      envContent = envContent.replace(/TREASURY_PRIVATE_KEY=.*/, `TREASURY_PRIVATE_KEY=${privateKeyBase58}`);
    } else {
      envContent += `\nTREASURY_PRIVATE_KEY=${privateKeyBase58}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Treasury private key saved to .env file');
    console.log('🔄 Please restart the server for changes to take effect');
    console.log('🚰 Fund this wallet with devnet SOL: https://faucet.solana.com');
    console.log('📍 Treasury address:', treasuryKeypair.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Failed to save to .env:', error);
    console.log('⚠️ Please manually add this to server/.env:');
    console.log(`TREASURY_PRIVATE_KEY=${privateKeyBase58}`);
  }
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

// --- SUPPORTED TOKENS ---
const SUPPORTED_TOKENS = [
  {
    mint: 'So11111111111111111111111111111111111111112', // Native SOL (wrapped)
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    isNative: true
  },
  {
    mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Devnet USDC
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    decimals: 6,
    isNative: false
  }
];

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


// Get supported tokens
app.get('/api/tokens', (req, res) => {
  res.json({ tokens: SUPPORTED_TOKENS });
});

// Get treasury wallet info (public key for deposits)
app.get('/api/treasury/info', async (req, res) => {
  const publicKey = treasuryKeypair.publicKey.toBase58();
  console.log('📍 Treasury wallet address requested:', publicKey);
  
  // Get actual on-chain balance
  let balance = 0;
  try {
    const lamports = await connection.getBalance(treasuryKeypair.publicKey);
    balance = lamports / LAMPORTS_PER_SOL;
    console.log(`💰 Treasury on-chain balance: ${balance} SOL`);
  } catch (error) {
    console.error('❌ Error fetching treasury balance:', error);
  }
  
  res.json({
    public_key: publicKey,
    balance: balance,
    message: 'Send devnet SOL to this address to fund the treasury'
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

// Add test balance (development only - remove in production!)
app.post('/api/treasury/add-test-balance', async (req, res) => {
  const { privy_did, amount } = req.body;
  
  if (!privy_did || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = users.find(u => u.privy_did === privy_did);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.balance += amount;
  console.log(`🧪 Test: Added ${amount} SOL to ${user.email}. New balance: ${user.balance}`);

  res.json({ success: true, new_balance: user.balance });
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

// Create and fund gift (treasury does everything)
app.post('/api/gifts/create', async (req, res) => {
  const { sender_did, recipient_email, token_mint, amount, message } = req.body;

  console.log('🎁 Creating gift:', { sender_did, recipient_email, token_mint, amount });

  if (!recipient_email || !token_mint || !amount || !sender_did) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find sender
  const sender = users.find(u => u.privy_did === sender_did);
  if (!sender) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Find token info
  const tokenInfo = SUPPORTED_TOKENS.find(t => t.mint === token_mint);
  if (!tokenInfo) {
    return res.status(400).json({ error: 'Unsupported token' });
  }

  // Check actual on-chain treasury balance (only for SOL)
  if (tokenInfo.isNative) {
    try {
      const treasuryLamports = await connection.getBalance(treasuryKeypair.publicKey);
      const treasuryBalance = treasuryLamports / LAMPORTS_PER_SOL;
      
      console.log(`💰 Treasury on-chain balance: ${treasuryBalance} SOL, required: ${amount} SOL`);
      
      if (treasuryBalance < amount) {
        return res.status(400).json({ 
          error: 'Insufficient treasury balance',
          required: amount,
          available: treasuryBalance,
          message: 'Please fund the treasury wallet with more devnet SOL'
        });
      }
    } catch (error: any) {
      console.error('❌ Error checking treasury balance:', error);
      return res.status(500).json({ error: 'Failed to check treasury balance' });
    }
  }

  try {
    // Step 1: Create TipLink
    const newTipLink = await TipLink.create();
    const tiplinkUrl = newTipLink.url.toString();
    const tiplinkPublicKey = newTipLink.keypair.publicKey;
    
    console.log('✅ TipLink created:', tiplinkPublicKey.toBase58());

    let signature: string;

    // Step 2: Fund TipLink from treasury wallet
    if (tokenInfo.isNative) {
      // Native SOL transfer
      console.log(`💸 Funding TipLink with ${amount} SOL from treasury...`);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey: tiplinkPublicKey,
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [treasuryKeypair],
        { commitment: 'confirmed' }
      );
    } else {
      // SPL Token transfer
      console.log(`💸 Funding TipLink with ${amount} ${tokenInfo.symbol} from treasury...`);
      
      const mintPubkey = new PublicKey(token_mint);
      const treasuryATA = await getAssociatedTokenAddress(mintPubkey, treasuryKeypair.publicKey);
      const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tiplinkPublicKey);

      const instructions = [];
      
      // Create TipLink's associated token account if it doesn't exist
      const tiplinkAccountInfo = await connection.getAccountInfo(tiplinkATA);
      if (!tiplinkAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            treasuryKeypair.publicKey,
            tiplinkATA,
            tiplinkPublicKey,
            mintPubkey
          )
        );
      }

      // Transfer SPL tokens
      instructions.push(
        createTransferInstruction(
          treasuryATA,
          tiplinkATA,
          treasuryKeypair.publicKey,
          amount * (10 ** tokenInfo.decimals)
        )
      );

      const transaction = new Transaction().add(...instructions);
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [treasuryKeypair],
        { commitment: 'confirmed' }
      );
    }
    
    console.log('✅ TipLink funded! Transaction:', signature);

    // Step 3: Create gift record
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
      tiplink_url: tiplinkUrl,
      tiplink_public_key: tiplinkPublicKey.toBase58(),
      transaction_signature: signature,
      created_at: new Date().toISOString()
    };

    gifts.push(newGift);
    
    console.log('✅ Gift created successfully:', newGift.id);
    
    // Get updated treasury balance
    const updatedLamports = await connection.getBalance(treasuryKeypair.publicKey);
    const updatedBalance = updatedLamports / LAMPORTS_PER_SOL;
    
    // TODO: Send email notification to recipient
    // For now, just log the email details
    const claimUrl = `/claim/${giftId}`;
    const fullClaimUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${claimUrl}`;
    
    console.log('\n📧 EMAIL NOTIFICATION (not sent - implement email service):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To: ${recipient_email}`);
    console.log(`Subject: 🎁 You received ${amount} ${tokenInfo.symbol} from ${sender.email}!`);
    console.log(`\nMessage:`);
    console.log(`You've received a crypto gift!`);
    console.log(`Amount: ${amount} ${tokenInfo.symbol}`);
    console.log(`From: ${sender.email}`);
    if (message) console.log(`Message: "${message}"`);
    console.log(`\nClaim your gift here: ${fullClaimUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Return claim URL
    res.status(201).json({ 
      gift_id: newGift.id,
      claim_url: claimUrl,
      tiplink_public_key: tiplinkPublicKey.toBase58(),
      signature: signature,
      treasury_balance: updatedBalance
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

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

// Get gift info by ID (public - for claim page)
app.get('/api/gifts/:giftId', (req, res) => {
  const { giftId } = req.params;
  const gift = gifts.find(g => g.id === giftId);
  
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
  const gift = gifts.find(g => g.id === giftId);
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
    
    const tokenInfo = SUPPORTED_TOKENS.find(t => t.mint === gift.token_mint);
    
    if (!tokenInfo) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    let signature: string;

    // Transfer from TipLink → Recipient
    if (tokenInfo.isNative) {
      // Native SOL transfer
      console.log(`💸 Transferring ${gift.amount} SOL to recipient...`);
      
      // Reserve some SOL for transaction fee (5000 lamports = 0.000005 SOL)
      const FEE_RESERVE = 5000;
      const transferAmount = (gift.amount * LAMPORTS_PER_SOL) - FEE_RESERVE;
      
      if (transferAmount <= 0) {
        throw new Error('Gift amount too small to cover transaction fee');
      }
      
      console.log(`📊 Transfer details: ${transferAmount / LAMPORTS_PER_SOL} SOL (${gift.amount} SOL - ${FEE_RESERVE / LAMPORTS_PER_SOL} SOL fee reserve)`);
      
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

    // Update gift status
    gift.status = GiftStatus.CLAIMED;
    gift.claimed_at = new Date().toISOString();
    gift.claimed_by = recipient_did;
    gift.claim_signature = signature;

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
