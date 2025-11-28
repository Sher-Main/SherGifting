/**
 * Script to add onramp transaction for a specific user by their privy_did
 * Usage: npx ts-node scripts/add-transaction-for-user.ts <privy_did> <amount_usd> [date]
 * 
 * Example: npx ts-node scripts/add-transaction-for-user.ts did:privy:cmbz5x3nr00yxky0l173v4mty 20 "2024-11-27T00:00:00Z"
 */

import 'dotenv/config';
import {
  upsertOnrampTransaction,
  createOnrampCredit,
  pool,
  getUserByPrivyDid,
} from '../database';

async function addTransactionForUser() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Usage: npx ts-node scripts/add-transaction-for-user.ts <privy_did> <amount_usd> [date]');
    console.error('');
    console.error('   Example:');
    console.error('     npx ts-node scripts/add-transaction-for-user.ts did:privy:cmbz5x3nr00yxky0l173v4mty 20 "2024-11-27T00:00:00Z"');
    process.exit(1);
  }

  const [privyDid, amountUsdStr, dateStr] = args;
  const amountUSD = parseFloat(amountUsdStr);

  if (isNaN(amountUSD) || amountUSD <= 0) {
    console.error('❌ Invalid amount. Must be a positive number.');
    process.exit(1);
  }

  if (!pool) {
    console.error('❌ Database not available. Check DATABASE_URL.');
    process.exit(1);
  }

  try {
    // Verify user exists
    console.log(`🔍 Looking up user: ${privyDid}...`);
    const user = await getUserByPrivyDid(privyDid);

    if (!user) {
      console.error(`❌ User not found with privy_did: ${privyDid}`);
      console.error('   Please check the privy_did or create the user first.');
      process.exit(1);
    }

    console.log(`✅ User found:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Wallet: ${user.wallet_address}`);

    // Parse date
    const completedDate = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(completedDate.getTime())) {
      console.error(`❌ Invalid date format: ${dateStr}. Use ISO format (e.g., "2024-11-27T10:30:00Z")`);
      process.exit(1);
    }

    // Convert USD to SOL (estimated price)
    const SOL_PRICE_ESTIMATE = 150;
    const amountSOL = amountUSD / SOL_PRICE_ESTIMATE;

    console.log(`💰 Amount: $${amountUSD.toFixed(2)} USD ≈ ${amountSOL.toFixed(4)} SOL (at $${SOL_PRICE_ESTIMATE}/SOL)`);
    console.log(`📅 Date: ${completedDate.toISOString()}`);

    // Create transaction
    const transactionId = `onramp_tx_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const onrampTx = await upsertOnrampTransaction({
      id: transactionId,
      user_id: privyDid,
      wallet_address: user.wallet_address,
      moonpay_id: null,
      moonpay_status: 'completed',
      amount_fiat: amountUSD,
      amount_crypto: amountSOL,
      credit_issued: false,
      completed_at: completedDate,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      idempotency_key: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transaction_hash: null,
    });

    console.log(`✅ OnrampTransaction created: ${onrampTx.id}`);

    // Check if user already has active credit
    const existingCredit = await pool.query(
      `SELECT * FROM onramp_credits 
       WHERE user_id = $1 
         AND is_active = TRUE 
         AND expires_at > NOW()`,
      [privyDid]
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
        user_id: privyDid,
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

    console.log(`✅ $5 credit issued to user ${privyDid}`);
    console.log(`\n🎉 Success! Transaction and credit have been added.`);
    console.log(`   Transaction ID: ${onrampTx.id}`);
    console.log(`   User can now send 5 free cards.`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addTransactionForUser();

