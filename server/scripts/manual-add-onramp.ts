/**
 * Script to manually add an onramp transaction and issue credit
 * 
 * SIMPLE MODE (Recommended):
 * Usage: npx ts-node scripts/manual-add-onramp.ts <email> <date> <amount_usd>
 * 
 * Examples:
 * npx ts-node scripts/manual-add-onramp.ts user@example.com "2024-11-27T10:30:00Z" 25.50
 * npx ts-node scripts/manual-add-onramp.ts user@example.com "2024-11-27T10:30:00Z" 25.50
 * 
 * ADVANCED MODE:
 * Usage: npx ts-node scripts/manual-add-onramp.ts --advanced <user_id> <wallet_address> <amount_sol> [completed_date] [transaction_hash]
 */

import 'dotenv/config';
import {
  upsertOnrampTransaction,
  createOnrampCredit,
  getUserByEmail,
  pool,
} from '../database';

async function manualAddOnramp() {
  const args = process.argv.slice(2);

  // Check if using simple mode (email, date, USD) or advanced mode
  const isAdvanced = args[0] === '--advanced';

  if (isAdvanced) {
    // Advanced mode: user_id, wallet_address, amount_sol, [date], [hash]
    if (args.length < 4) {
      console.error('❌ Advanced mode usage: npx ts-node scripts/manual-add-onramp.ts --advanced <user_id> <wallet_address> <amount_sol> [completed_date] [transaction_hash]');
      process.exit(1);
    }
    const [, userId, walletAddress, amountSolStr, completedDateStr, transactionHash] = args;
    const amountSOL = parseFloat(amountSolStr);
    
    if (isNaN(amountSOL) || amountSOL <= 0) {
      console.error('❌ Invalid amount. Must be a positive number.');
      process.exit(1);
    }

    await processTransaction({
      userId,
      walletAddress,
      amountSOL,
      amountUSD: amountSOL * 150, // Estimate
      completedDate: completedDateStr ? new Date(completedDateStr) : new Date(),
      transactionHash: transactionHash || null,
    });
  } else {
    // Simple mode: email, date, amount_usd
    if (args.length < 3) {
      console.error('❌ Simple mode usage: npx ts-node scripts/manual-add-onramp.ts <email> <date> <amount_usd>');
      console.error('');
      console.error('   Arguments:');
      console.error('     email: User email address');
      console.error('     date: ISO date string (e.g., "2024-11-27T10:30:00Z")');
      console.error('     amount_usd: Amount in USD (e.g., 25.50)');
      console.error('');
      console.error('   Example:');
      console.error('     npx ts-node scripts/manual-add-onramp.ts user@example.com "2024-11-27T10:30:00Z" 25.50');
      console.error('');
      console.error('   Advanced mode:');
      console.error('     npx ts-node scripts/manual-add-onramp.ts --advanced <user_id> <wallet_address> <amount_sol> [date] [hash]');
      process.exit(1);
    }

    const [email, dateStr, amountUsdStr] = args;
    const amountUSD = parseFloat(amountUsdStr);

    if (isNaN(amountUSD) || amountUSD <= 0) {
      console.error('❌ Invalid amount. Must be a positive number.');
      process.exit(1);
    }

    if (!pool) {
      console.error('❌ Database not available. Check DATABASE_URL.');
      process.exit(1);
    }

    // Look up user by email
    console.log(`🔍 Looking up user by email: ${email}...`);
    const user = await getUserByEmail(email);

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      console.error('   Please check the email address or use advanced mode with user_id and wallet_address.');
      process.exit(1);
    }

    console.log(`✅ User found:`);
    console.log(`   User ID: ${user.privy_did}`);
    console.log(`   Wallet: ${user.wallet_address}`);

    // Parse date
    const completedDate = new Date(dateStr);
    if (isNaN(completedDate.getTime())) {
      console.error(`❌ Invalid date format: ${dateStr}. Use ISO format (e.g., "2024-11-27T10:30:00Z")`);
      process.exit(1);
    }

    // Convert USD to SOL (using estimated price of $150 per SOL)
    const SOL_PRICE_ESTIMATE = 150;
    const amountSOL = amountUSD / SOL_PRICE_ESTIMATE;

    console.log(`💰 Amount: $${amountUSD.toFixed(2)} USD ≈ ${amountSOL.toFixed(4)} SOL (at $${SOL_PRICE_ESTIMATE}/SOL)`);

    await processTransaction({
      userId: user.privy_did,
      walletAddress: user.wallet_address,
      amountSOL,
      amountUSD,
      completedDate,
      transactionHash: null,
    });
  }
}

async function processTransaction(data: {
  userId: string;
  walletAddress: string;
  amountSOL: number;
  amountUSD: number;
  completedDate: Date;
  transactionHash: string | null;
}) {
  const { userId, walletAddress, amountSOL, amountUSD, completedDate, transactionHash } = data;

  if (!pool) {
    console.error('❌ Database not available. Check DATABASE_URL.');
    process.exit(1);
  }

  try {
    console.log('\n📝 Creating onramp transaction...');
    console.log(`   User ID: ${userId}`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Amount: $${amountUSD.toFixed(2)} USD (${amountSOL.toFixed(4)} SOL)`);
    console.log(`   Completed Date: ${completedDate.toISOString()}`);

    if (transactionHash) {
      console.log(`   Transaction Hash: ${transactionHash}`);
    }

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
      console.log(`   Credits remaining: ${existingCredit.rows[0].credits_remaining}`);
      console.log(`   Free cards remaining: ${existingCredit.rows[0].card_adds_allowed - existingCredit.rows[0].card_adds_free_used}`);
      
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
    console.log(`\n🎉 Success! Transaction and credit have been added.`);
    console.log(`   Transaction ID: ${onrampTx.id}`);
    console.log(`   User can now send 5 free cards.`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

manualAddOnramp();

