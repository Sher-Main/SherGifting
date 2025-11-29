import express, { Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../authMiddleware';
import {
  getOnrampCreditByUserId,
  getCardTransactionsByUserId,
  getOnrampTransactionsByUserId,
  upsertOnrampTransaction,
  createOnrampCredit,
  pool,
} from '../database';

const router = express.Router();

/**
 * POST /api/onramp/detect-transaction
 * 
 * Called by frontend after user exits Privy funding flow
 * Detects if a new onramp transaction occurred by checking wallet balance
 * Issues $5 credit if transaction is detected
 */
router.post('/onramp/detect-transaction', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || req.user?.id;
    const { walletAddress, previousBalance, currentBalance } = req.body;

    if (!userId || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`🔍 Detecting onramp transaction for user ${userId}`);
    console.log(`   Previous balance: ${previousBalance}`);
    console.log(`   Current balance: ${currentBalance}`);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Check if balance increased (indicating successful onramp)
    const balanceIncrease = currentBalance - (previousBalance || 0);
    
    if (balanceIncrease <= 0) {
      console.log('   No balance increase detected');
      return res.status(200).json({
        transactionDetected: false,
        message: 'No balance increase detected',
      });
    }

    console.log(`   ✅ Balance increased by: ${balanceIncrease} SOL`);

    // Check if we've already recorded this transaction
    // (to prevent duplicate credit issuance)
    const recentTransactions = await pool.query(
      `SELECT * FROM onramp_transactions 
       WHERE user_id = $1 
         AND wallet_address = $2
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, walletAddress]
    );

    if (recentTransactions.rows.length > 0) {
      const existingTx = recentTransactions.rows[0];
      console.log(`   ⚠️ Recent transaction already recorded: ${existingTx.id}`);
      
      return res.status(200).json({
        transactionDetected: true,
        alreadyRecorded: true,
        transactionId: existingTx.id,
        creditIssued: existingTx.credit_issued,
      });
    }

    // Create new onramp transaction record
    const transactionId = `onramp_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Estimate fiat amount (rough calculation - you may want to fetch actual price)
    // For now, we'll use a default estimate or you can pass it from frontend
    const estimatedFiatAmount = balanceIncrease * 150; // Rough SOL price estimate

    const onrampTx = await upsertOnrampTransaction({
      id: transactionId,
      user_id: userId,
      wallet_address: walletAddress,
      moonpay_id: null, // Privy doesn't provide MoonPay transaction ID
      moonpay_status: 'completed',
      amount_fiat: estimatedFiatAmount,
      amount_crypto: balanceIncrease,
      credit_issued: false,
      completed_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    console.log(`📝 OnrampTransaction created: ${onrampTx.id}`);

    // Check if this is the user's first onramp transaction
    const previousTransactions = await pool.query(
      `SELECT COUNT(*) as count FROM onramp_transactions 
       WHERE user_id = $1 AND id != $2`,
      [userId, onrampTx.id]
    );
    const isFirstOnramp = parseInt(previousTransactions.rows[0]?.count || '0') === 0;
    
    console.log(`   ${isFirstOnramp ? '🎉 FIRST-TIME ONRAMPER' : '🔄 RETURNING USER'}`);
    console.log(`   Service fee discounts: ${isFirstOnramp ? '5 (first-time bonus)' : '0'}`);

    // Issue $5 credit
    try {
      const creditId = `credit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const credit = await createOnrampCredit({
        id: creditId,
        user_id: userId,
        total_credits_issued: 5.0,
        credits_remaining: 5.0,
        card_adds_free_used: 0,
        card_adds_allowed: 5,
        service_fee_free_used: 0,
        service_fee_free_allowed: isFirstOnramp ? 5 : 0, // 5 free service fees only for first-time onrampers
        expires_at: expiresAt,
        onramp_transaction_id: onrampTx.id,
      });

      console.log(`💚 OnrampCredit created: ${credit.id}`);

      // Mark transaction as credit issued
      await pool.query(
        `UPDATE onramp_transactions SET credit_issued = TRUE WHERE id = $1`,
        [onrampTx.id]
      );

      console.log(`✅ $5 credit issued to user ${userId}`);

      return res.status(200).json({
        transactionDetected: true,
        transactionId: onrampTx.id,
        creditIssued: true,
        creditId: credit.id,
        creditsRemaining: 5.0,
        cardAddsFreeRemaining: 5,
      });

    } catch (creditError) {
      console.error('❌ Error issuing credit:', creditError);
      return res.status(200).json({
        transactionDetected: true,
        transactionId: onrampTx.id,
        creditIssued: false,
        error: String(creditError),
      });
    }

  } catch (error) {
    console.error('❌ Error detecting transaction:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: String(error),
    });
  }
});

/**
 * POST /api/onramp/manual-add
 * 
 * Manually add an onramp transaction and issue credit
 * Used for retroactively adding transactions that weren't detected automatically
 * 
 * SIMPLE MODE (Recommended):
 * Body: {
 *   email: string,
 *   completedAt: string (ISO date string),
 *   amountUSD: number
 * }
 * 
 * ADVANCED MODE:
 * Body: {
 *   userId: string (Privy DID),
 *   walletAddress: string,
 *   amountSOL: number,
 *   completedAt?: string (ISO date string, defaults to now),
 *   transactionHash?: string (optional)
 * }
 */
router.post('/onramp/manual-add', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { email, userId, walletAddress, amountSOL, amountUSD, completedAt, transactionHash } = req.body;

    // Simple mode: email, date, USD amount
    if (email && amountUSD) {
      if (!completedAt) {
        return res.status(400).json({ error: 'Missing required field: completedAt' });
      }

      if (isNaN(amountUSD) || amountUSD <= 0) {
        return res.status(400).json({ error: 'amountUSD must be a positive number' });
      }

      // Look up user by email
      const { getUserByEmail } = await import('../database');
      const user = await getUserByEmail(email);

      if (!user) {
        return res.status(404).json({ error: `User not found with email: ${email}` });
      }

      // Convert USD to SOL (estimated price)
      const SOL_PRICE_ESTIMATE = 150;
      const calculatedAmountSOL = amountUSD / SOL_PRICE_ESTIMATE;
      const completedDate = new Date(completedAt);

      if (isNaN(completedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use ISO format (e.g., "2024-11-27T10:30:00Z")' });
      }

      return await processManualAdd({
        userId: user.privy_did,
        walletAddress: user.wallet_address,
        amountSOL: calculatedAmountSOL,
        amountUSD,
        completedDate,
        transactionHash: null,
        res,
      });
    }

    // Advanced mode: userId, walletAddress, amountSOL
    if (!userId || !walletAddress || !amountSOL) {
      return res.status(400).json({ 
        error: 'Missing required fields. Use simple mode: {email, completedAt, amountUSD} or advanced mode: {userId, walletAddress, amountSOL}' 
      });
    }

    if (isNaN(amountSOL) || amountSOL <= 0) {
      return res.status(400).json({ error: 'amountSOL must be a positive number' });
    }

    const completedDate = completedAt ? new Date(completedAt) : new Date();
    if (isNaN(completedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO format (e.g., "2024-11-27T10:30:00Z")' });
    }

    const estimatedAmountUSD = amountSOL * 150; // Estimate

    return await processManualAdd({
      userId,
      walletAddress,
      amountSOL,
      amountUSD: estimatedAmountUSD,
      completedDate,
      transactionHash: transactionHash || null,
      res,
    });
  } catch (error) {
    console.error('❌ Error manually adding onramp:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error),
    });
  }
});

async function processManualAdd(data: {
  userId: string;
  walletAddress: string;
  amountSOL: number;
  amountUSD: number;
  completedDate: Date;
  transactionHash: string | null;
  res: Response;
}) {
  const { userId, walletAddress, amountSOL, amountUSD, completedDate, transactionHash, res } = data;

  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    console.log(`📝 Manually adding onramp transaction:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Amount: $${amountUSD.toFixed(2)} USD (${amountSOL.toFixed(4)} SOL)`);
    console.log(`   Date: ${completedDate.toISOString()}`);

    const transactionId = `onramp_tx_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const onrampTx = await upsertOnrampTransaction({
      id: transactionId,
      user_id: userId,
      wallet_address: walletAddress,
      moonpay_id: null,
      moonpay_status: 'completed',
      amount_fiat: amountUSD,
      amount_crypto: amountSOL,
      credit_issued: false,
      completed_at: completedDate,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      idempotency_key: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transaction_hash: transactionHash || null,
    });

    console.log(`✅ OnrampTransaction created: ${onrampTx.id}`);

    // Check if this is the user's first onramp transaction
    const previousTransactions = await pool.query(
      `SELECT COUNT(*) as count FROM onramp_transactions 
       WHERE user_id = $1 AND id != $2`,
      [userId, onrampTx.id]
    );
    const isFirstOnramp = parseInt(previousTransactions.rows[0]?.count || '0') === 0;
    
    console.log(`   ${isFirstOnramp ? '🎉 FIRST-TIME ONRAMPER' : '🔄 RETURNING USER'}`);
    console.log(`   Service fee discounts: ${isFirstOnramp ? '5 (first-time bonus)' : '0'}`);

    // Check if user already has active credit
    const existingCredit = await pool.query(
      `SELECT * FROM onramp_credits 
       WHERE user_id = $1 
         AND is_active = TRUE 
         AND expires_at > NOW()`,
      [userId]
    );

    if (existingCredit.rows.length > 0) {
      console.log(`⚠️ User already has active credit: ${existingCredit.rows[0].id}`);
      console.log(`   Updating existing credit...`);
      
      await pool.query(
        `UPDATE onramp_credits 
         SET credits_remaining = credits_remaining + 5.0,
             card_adds_allowed = card_adds_allowed + 5,
             updated_at = NOW()
         WHERE id = $1`,
        [existingCredit.rows[0].id]
      );
      
      console.log(`✅ Updated existing credit with additional $5`);
    } else {
      // Issue new $5 credit
      const creditId = `credit_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const credit = await createOnrampCredit({
        id: creditId,
        user_id: userId,
        total_credits_issued: 5.0,
        credits_remaining: 5.0,
        card_adds_free_used: 0,
        card_adds_allowed: 5,
        service_fee_free_used: 0,
        service_fee_free_allowed: isFirstOnramp ? 5 : 0, // 5 free service fees only for first-time onrampers
        expires_at: expiresAt,
        onramp_transaction_id: onrampTx.id,
      });

      console.log(`💚 OnrampCredit created: ${credit.id}`);
    }

    // Mark transaction as credit issued
    await pool.query(
      `UPDATE onramp_transactions SET credit_issued = TRUE WHERE id = $1`,
      [onrampTx.id]
    );

    console.log(`✅ $5 credit issued to user ${userId}`);

    return res.status(200).json({
      success: true,
      transactionId: onrampTx.id,
      creditIssued: true,
      message: 'Transaction and credit added successfully',
    });
  } catch (error) {
    console.error('❌ Error in processManualAdd:', error);
    throw error;
  }
}

/**
 * GET /api/users/:userId/onramp-credit
 * 
 * Returns user's active onramp credit status
 * Called by frontend when opening Send Gift
 */
router.get('/users/:userId/onramp-credit', async (req: Request, res: Response) => {
  try {
    let userId = req.params.userId;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID required' });
    }

    console.log(`📋 Getting credit status for ${userId}`);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Ensure userId is in privy_did format (did:privy:...)
    if (!userId.startsWith('did:privy:')) {
      userId = `did:privy:${userId}`;
      console.log(`   Normalized to privy_did: ${userId}`);
    }

    // Query: Get active, non-expired credit
    let credit = await getOnrampCreditByUserId(userId);
    
    // If not found, try without did:privy: prefix
    if (!credit && userId.startsWith('did:privy:')) {
      const altUserId = userId.replace('did:privy:', '');
      credit = await getOnrampCreditByUserId(altUserId);
      if (credit) {
        console.log(`   Found credit with alternative format`);
      }
    }

    // If no active credit, return inactive response
    if (!credit) {
      console.log(`   No active credit found`);
      return res.status(200).json({
        isActive: false,
        message: 'No active onramp credit',
      });
    }

    // Calculate days remaining
    const now = Date.now();
    const expiryTime = new Date(credit.expires_at).getTime();
    const daysRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));

    console.log(`   ✨ Credit found: $${credit.credits_remaining}`);
    console.log(`   Days remaining: ${daysRemaining}`);

    // Return active credit details
    return res.status(200).json({
      isActive: true,
      id: credit.id,
      creditsRemaining: parseFloat(credit.credits_remaining.toString()),
      cardAddsFreeUsed: credit.card_adds_free_used,
      cardAddsAllowed: credit.card_adds_allowed,
      cardAddsFreeRemaining: credit.card_adds_allowed - credit.card_adds_free_used,
      serviceFeeFreeUsed: credit.service_fee_free_used || 0,
      serviceFeeFreeAllowed: credit.service_fee_free_allowed || 0,
      serviceFeeFreeRemaining: (credit.service_fee_free_allowed || 0) - (credit.service_fee_free_used || 0),
      daysRemaining,
      expiresAt: credit.expires_at.toISOString(),
      issuedAt: credit.issued_at.toISOString(),
    });

  } catch (error) {
    console.error('❌ Error fetching credit status:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: String(error),
    });
  }
});

interface FormattedTransaction {
  id: string;
  type: 'onramp' | 'card';
  
  // Onramp fields
  amountFiat?: number;
  creditIssued?: boolean;
  completedAt?: string;
  status?: string;
  
  // Card fields
  isFree?: boolean;
  amountCharged?: number;
  createdAt?: string;
}

/**
 * GET /api/users/me/transaction-history
 * 
 * Returns all transactions for authenticated user:
 * - Onramp transactions (when they added funds)
 * - Card transactions (when they sent gifts)
 * 
 * Used by TransactionHistory component
 */
router.get('/users/me/transaction-history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const privyUserId = req.userId || req.user?.id;

    if (!privyUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📜 Fetching transaction history for Privy user ${privyUserId}`);
    console.log(`   req.userId: ${req.userId}`);
    console.log(`   req.user?.id: ${req.user?.id}`);
    console.log(`   req.user?.email: ${req.user?.email?.address || 'N/A'}`);
    console.log(`   req.user object keys: ${req.user ? Object.keys(req.user).join(', ') : 'null'}`);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // 🔥 CRITICAL FIX: First, try to find the user in the database by Privy userId
    // Privy's userId might be in format "clxxxxx" or "did:privy:clxxxxx"
    let userId: string | null = null;
    
    // Method 1: Check if req.user.id matches a privy_did in database (try multiple formats)
    const possibleUserIds = [
      privyUserId,
      `did:privy:${privyUserId}`,
      privyUserId.replace('did:privy:', ''),
    ];
    
    const userLookup1 = await pool.query(
      `SELECT privy_did FROM users WHERE privy_did = ANY($1::text[]) LIMIT 1`,
      [possibleUserIds]
    );
    
    if (userLookup1.rows.length > 0) {
      userId = userLookup1.rows[0].privy_did;
      console.log(`   ✅ Found user in DB (Method 1): ${userId}`);
    } else {
      // Method 2: Try to find by email if available
      if (req.user?.email?.address) {
        const userLookup2 = await pool.query(
          `SELECT privy_did FROM users WHERE email = $1 LIMIT 1`,
          [req.user.email.address.toLowerCase()]
        );
        
        if (userLookup2.rows.length > 0) {
          userId = userLookup2.rows[0].privy_did;
          console.log(`   ✅ Found user in DB (Method 2 - by email): ${userId}`);
        }
      }
    }
    
    // Method 3: If still not found, use the most likely format
    if (!userId) {
      if (req.user?.id && req.user.id.startsWith('did:privy:')) {
        userId = req.user.id;
        console.log(`   Method 3a: Using req.user.id: ${userId}`);
      } else if (req.user?.privy_did) {
        userId = req.user.privy_did;
        console.log(`   Method 3b: Using req.user.privy_did: ${userId}`);
      } else {
        // Privy userId might be "clxxxxx" format, need to check if it should be "did:privy:clxxxxx"
        if (privyUserId.startsWith('did:privy:')) {
          userId = privyUserId;
        } else {
          userId = `did:privy:${privyUserId}`;
        }
        console.log(`   ⚠️ User not found in DB, using constructed: ${userId}`);
      }
    }
    
    console.log(`   Final privy_did: ${userId}`);

    // Query 1: Get all onramp transactions - try exact match first, then flexible
    let onrampTxs: any[] = [];
    
    const exactMatch = await pool.query(
      `SELECT * FROM onramp_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    onrampTxs = exactMatch.rows;
    console.log(`   Onramp transactions (exact match with ${userId}): ${onrampTxs.length}`);
    
    // If no results, try all possible user ID formats
    if (onrampTxs.length === 0) {
      const allFormats = [
        userId,
        userId.replace('did:privy:', ''),
        `did:privy:${userId.replace('did:privy:', '')}`,
        privyUserId,
        `did:privy:${privyUserId}`,
        privyUserId.replace('did:privy:', ''),
      ];
      // Remove duplicates
      const uniqueFormats = [...new Set(allFormats)];
      
      const patternMatch = await pool.query(
        `SELECT * FROM onramp_transactions 
         WHERE user_id = ANY($1::text[])
         ORDER BY created_at DESC`,
        [uniqueFormats]
      );
      onrampTxs = patternMatch.rows;
      console.log(`   Onramp transactions (flexible match): ${onrampTxs.length}`);
    }

    // Query 2: Get all card transactions - try exact match first, then flexible
    let cardTxs: any[] = [];
    
    const cardExactMatch = await pool.query(
      `SELECT * FROM card_transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    cardTxs = cardExactMatch.rows;
    console.log(`   Card transactions (exact match with ${userId}): ${cardTxs.length}`);
    
    // If no results, try all possible user ID formats
    if (cardTxs.length === 0) {
      const allFormats = [
        userId,
        userId.replace('did:privy:', ''),
        `did:privy:${userId.replace('did:privy:', '')}`,
        privyUserId,
        `did:privy:${privyUserId}`,
        privyUserId.replace('did:privy:', ''),
      ];
      // Remove duplicates
      const uniqueFormats = [...new Set(allFormats)];
      
      const cardPatternMatch = await pool.query(
        `SELECT * FROM card_transactions 
         WHERE user_id = ANY($1::text[])
         ORDER BY created_at DESC`,
        [uniqueFormats]
      );
      cardTxs = cardPatternMatch.rows;
      console.log(`   Card transactions (flexible match): ${cardTxs.length}`);
    }

    // Format and combine
    const formattedTxs: FormattedTransaction[] = [
      ...onrampTxs.map((tx) => ({
        id: tx.id,
        type: 'onramp' as const,
        amountFiat: parseFloat(tx.amount_fiat.toString()),
        creditIssued: tx.credit_issued,
        completedAt: tx.completed_at?.toISOString(),
        status: tx.moonpay_status,
      })),

      ...cardTxs.map((tx) => ({
        id: tx.id,
        type: 'card' as const,
        isFree: tx.is_free,
        amountCharged: parseFloat(tx.amount_charged.toString()),
        createdAt: tx.created_at.toISOString(),
      })),
    ];

    // Sort by newest first
    const sorted = formattedTxs.sort((a, b) => {
      const aTime = new Date(a.completedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.completedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    console.log(`   ✅ Total transactions found: ${sorted.length}`);
    console.log(`   Breakdown: ${onrampTxs.length} onramp, ${cardTxs.length} card`);

    return res.status(200).json(sorted);

  } catch (error) {
    console.error('❌ Error fetching history:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: String(error),
    });
  }
});

export default router;
