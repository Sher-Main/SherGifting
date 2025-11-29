import {
  getOnrampCreditByUserId,
  updateOnrampCredit,
  createCardTransaction,
  OnrampCredit,
} from '../database';

export interface HandleCardAddResult {
  isFree: boolean;
  cardAddsFreeRemaining: number;
  creditsRemaining: number;
  transactionId: string;
}

export interface HandleServiceFeeResult {
  isFree: boolean;
  serviceFeeFreeRemaining: number;
  creditsRemaining: number;
}

/**
 * handleCardAdd
 * 
 * Called when user sends a card (gift)
 * 
 * Logic:
 * 1. Check if user has active onramp credit
 * 2. If yes AND hasn't used all 5 free adds:
 *    - Mark card as FREE
 *    - Charge $0
 *    - Decrement credit counter
 * 3. If no OR used all 5 free adds:
 *    - Mark card as PAID
 *    - Charge $1
 * 4. Log transaction
 * 5. Return result to caller
 */
export async function handleCardAdd(
  userId: string,
  cardAddress?: string,
  amountToCharge: number = 1.0
): Promise<HandleCardAddResult> {
  console.log(`📋 handleCardAdd called for user ${userId}`);

  try {
    // Step 1: Get user's active credit (if exists)
    const activeCredit = await getOnrampCreditByUserId(userId);

    console.log(`   Active Credit: ${activeCredit ? 'YES' : 'NO'}`);

    // Step 2: Determine if this card is FREE or PAID
    let isFree = false;
    let creditsRemaining = 0;
    let cardAddsFreeRemaining = 0;

    // Check conditions for free card
    if (
      activeCredit &&
      activeCredit.card_adds_free_used < activeCredit.card_adds_allowed
    ) {
      // YES: This card is FREE!
      isFree = true;

      console.log(`   ✨ FREE CARD (${activeCredit.card_adds_free_used} of ${activeCredit.card_adds_allowed} used)`);

      // Step 3: Update credit tracking
      const updated = await updateOnrampCredit(activeCredit.id, {
        card_adds_free_used: activeCredit.card_adds_free_used + 1,
        credits_remaining: activeCredit.credits_remaining - amountToCharge,
      });

      if (updated) {
        creditsRemaining = updated.credits_remaining;
        cardAddsFreeRemaining = updated.card_adds_allowed - updated.card_adds_free_used;

        console.log(`   Updated Credit: ${cardAddsFreeRemaining} remaining`);
      } else {
        // Fallback if update failed
        creditsRemaining = activeCredit.credits_remaining - amountToCharge;
        cardAddsFreeRemaining = activeCredit.card_adds_allowed - (activeCredit.card_adds_free_used + 1);
      }

    } else {
      // NO: This card costs $1
      isFree = false;
      cardAddsFreeRemaining = activeCredit
        ? activeCredit.card_adds_allowed - activeCredit.card_adds_free_used
        : 0;

      console.log(`   💳 PAID CARD ($${amountToCharge})`);
    }

    // Step 4: Log transaction
    const cardTxId = `card_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const cardTx = await createCardTransaction({
      id: cardTxId,
      user_id: userId,
      card_address_added: cardAddress,
      amount_charged: isFree ? 0 : amountToCharge,
      is_free: isFree,
      onramp_credit_id: activeCredit?.id || null,
    });

    console.log(`   📝 CardTransaction created: ${cardTx.id}`);

    // Step 5: Return result
    const result: HandleCardAddResult = {
      isFree,
      cardAddsFreeRemaining,
      creditsRemaining,
      transactionId: cardTx.id,
    };

    console.log(`   ✅ Result:`, result);

    return result;

  } catch (error) {
    console.error('❌ Error in handleCardAdd:', error);
    throw error;
  }
}

/**
 * handleServiceFee
 * 
 * Called when user sends a gift (to check if service fee is free)
 * 
 * Logic:
 * 1. Check if user has active onramp credit
 * 2. If yes AND hasn't used all 5 free service fee discounts:
 *    - Mark service fee as FREE
 *    - Charge $0
 *    - Decrement service fee counter
 * 3. If no OR used all 5 free discounts:
 *    - Mark service fee as PAID
 *    - Charge $1
 * 4. Return result to caller
 */
export async function handleServiceFee(
  userId: string
): Promise<HandleServiceFeeResult> {
  console.log(`💰 handleServiceFee called for user ${userId}`);

  try {
    // Step 1: Get user's active credit (if exists)
    const activeCredit = await getOnrampCreditByUserId(userId);

    console.log(`   Active Credit: ${activeCredit ? 'YES' : 'NO'}`);

    // Step 2: Determine if this service fee is FREE or PAID
    let isFree = false;
    let creditsRemaining = 0;
    let serviceFeeFreeRemaining = 0;

    // Check conditions for free service fee
    if (
      activeCredit &&
      activeCredit.service_fee_free_used < activeCredit.service_fee_free_allowed
    ) {
      // YES: This service fee is FREE!
      isFree = true;

      console.log(`   ✨ FREE SERVICE FEE (${activeCredit.service_fee_free_used} of ${activeCredit.service_fee_free_allowed} used)`);

      // Step 3: Update credit tracking
      const updated = await updateOnrampCredit(activeCredit.id, {
        service_fee_free_used: activeCredit.service_fee_free_used + 1,
      });

      if (updated) {
        creditsRemaining = updated.credits_remaining;
        serviceFeeFreeRemaining = updated.service_fee_free_allowed - updated.service_fee_free_used;

        console.log(`   Updated Credit: ${serviceFeeFreeRemaining} service fee discounts remaining`);
      } else {
        // Fallback if update failed
        creditsRemaining = activeCredit.credits_remaining;
        serviceFeeFreeRemaining = activeCredit.service_fee_free_allowed - (activeCredit.service_fee_free_used + 1);
      }

    } else {
      // NO: This service fee costs $1
      isFree = false;
      serviceFeeFreeRemaining = activeCredit
        ? activeCredit.service_fee_free_allowed - activeCredit.service_fee_free_used
        : 0;

      console.log(`   💳 PAID SERVICE FEE ($1.00)`);
    }

    // Step 4: Return result
    const result: HandleServiceFeeResult = {
      isFree,
      serviceFeeFreeRemaining,
      creditsRemaining,
    };

    console.log(`   ✅ Result:`, result);

    return result;

  } catch (error) {
    console.error('❌ Error in handleServiceFee:', error);
    throw error;
  }
}

/**
 * cleanupExpiredCredits
 * 
 * Run daily via cron job
 * Marks credits as inactive when they expire
 */
export async function cleanupExpiredCredits(): Promise<number> {
  try {
    console.log(`🧹 Running credit cleanup...`);

    if (!require('../database').pool) {
      console.warn('⚠️ Database pool not available');
      return 0;
    }

    const result = await require('../database').pool.query(
      `
      UPDATE onramp_credits
      SET is_active = FALSE
      WHERE is_active = TRUE
        AND expires_at <= NOW()
      `,
      []
    );

    console.log(`✅ Marked ${result.rowCount} credits as expired`);
    return result.rowCount || 0;

  } catch (error) {
    console.error('❌ Error cleaning up credits:', error);
    throw error;
  }
}

/**
 * validateAndIssueCredit (Manual)
 * 
 * For emergency situations:
 * - Webhook failed to fire
 * - Manual user request
 * - Admin override
 */
export async function validateAndIssueCredit(
  userId: string,
  moonpayTransactionId: string
): Promise<{ success: boolean; creditId?: string; error?: string }> {
  try {
    console.log(`🔍 Validating & issuing credit for ${userId}...`);

    const { pool, query } = require('../database');

    if (!pool) {
      return { success: false, error: 'Database not available' };
    }

    // Step 1: Check if transaction exists
    const transactions = await query(
      `SELECT * FROM onramp_transactions WHERE moonpay_id = $1`,
      [moonpayTransactionId]
    );

    if (transactions.length === 0) {
      return { success: false, error: 'Transaction not found' };
    }

    const transaction = transactions[0];

    // Step 2: Check if already issued
    if (transaction.credit_issued) {
      return { success: false, error: 'Credit already issued for this transaction' };
    }

    // Step 3: Issue credit
    const creditId = `credit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const { createOnrampCredit } = require('../database');
    const credit = await createOnrampCredit({
      id: creditId,
      user_id: userId,
      total_credits_issued: 5.0,
      credits_remaining: 5.0,
      card_adds_free_used: 0,
      card_adds_allowed: 5,
      expires_at: expiresAt,
      onramp_transaction_id: transaction.id,
    });

    // Step 4: Mark transaction
    await pool.query(
      `UPDATE onramp_transactions SET credit_issued = TRUE WHERE id = $1`,
      [transaction.id]
    );

    console.log(`✅ Credit issued: ${credit.id}`);

    return { success: true, creditId: credit.id };

  } catch (error) {
    console.error('❌ Error issuing credit:', error);
    return { success: false, error: String(error) };
  }
}

