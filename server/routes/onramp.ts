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

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    console.log(`📝 Manually adding onramp transaction:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Amount: ${amountSOL} SOL`);

    // Estimate fiat amount (rough calculation)
    const estimatedFiatAmount = amountSOL * 150; // Rough SOL price estimate

    const transactionId = `onramp_tx_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const completedDate = completedAt ? new Date(completedAt) : new Date();
    
    const onrampTx = await upsertOnrampTransaction({
      id: transactionId,
      user_id: userId,
      wallet_address: walletAddress,
      moonpay_id: null,
      moonpay_status: 'completed',
      amount_fiat: estimatedFiatAmount,
      amount_crypto: amountSOL,
      credit_issued: false,
      completed_at: completedDate,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      idempotency_key: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transaction_hash: transactionHash || null,
    });

    console.log(`✅ OnrampTransaction created: ${onrampTx.id}`);

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
      
      // Update existing credit instead of creating new one
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
    console.error('❌ Error manually adding onramp:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error),
    });
  }
});

/**
 * GET /api/users/:userId/onramp-credit
 * 
 * Returns user's active onramp credit status
 * Called by frontend when opening Send Gift
 */
router.get('/users/:userId/onramp-credit', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID required' });
    }

    console.log(`📋 Getting credit status for ${userId}`);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Query: Get active, non-expired credit
    const credit = await getOnrampCreditByUserId(userId);

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
    const userId = req.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📜 Fetching transaction history for ${userId}`);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Query 1: Get all onramp transactions
    const onrampTxs = await getOnrampTransactionsByUserId(userId);

    console.log(`   Onramp transactions: ${onrampTxs.length}`);

    // Query 2: Get all card transactions
    const cardTxs = await getCardTransactionsByUserId(userId);

    console.log(`   Card transactions: ${cardTxs.length}`);

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

    console.log(`   Total transactions: ${sorted.length}`);

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
