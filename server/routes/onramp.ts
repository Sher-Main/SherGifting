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
         AND created_at > NOW() - INTERVAL '5 minutes'
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
