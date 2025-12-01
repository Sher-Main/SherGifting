/**
 * Script to check what transactions exist in the database
 * and what user_id format they use
 */

import 'dotenv/config';
import { pool } from '../database';

async function checkTransactions() {
  if (!pool) {
    console.error('❌ Database not available');
    process.exit(1);
  }

  try {
    console.log('🔍 Checking onramp transactions...\n');

    // Get all onramp transactions
    const onrampResult = await pool.query(`
      SELECT id, user_id, amount_fiat, credit_issued, completed_at, created_at
      FROM onramp_transactions
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${onrampResult.rows.length} onramp transactions:\n`);
    onrampResult.rows.forEach((tx, i) => {
      console.log(`${i + 1}. Transaction ID: ${tx.id}`);
      console.log(`   User ID: ${tx.user_id}`);
      console.log(`   Amount: $${tx.amount_fiat}`);
      console.log(`   Credit Issued: ${tx.credit_issued}`);
      console.log(`   Completed: ${tx.completed_at || 'N/A'}`);
      console.log('');
    });

    // Get all users to see their privy_did format
    console.log('\n🔍 Checking users...\n');
    const usersResult = await pool.query(`
      SELECT privy_did, email, wallet_address
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${usersResult.rows.length} users:\n`);
    usersResult.rows.forEach((user, i) => {
      console.log(`${i + 1}. Email: ${user.email}`);
      console.log(`   Privy DID: ${user.privy_did}`);
      console.log(`   Wallet: ${user.wallet_address}`);
      console.log('');
    });

    // Check credits
    console.log('\n🔍 Checking onramp credits...\n');
    const creditsResult = await pool.query(`
      SELECT id, user_id, credits_remaining, card_adds_free_used, card_adds_allowed, is_active, expires_at
      FROM onramp_credits
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${creditsResult.rows.length} credits:\n`);
    creditsResult.rows.forEach((credit, i) => {
      console.log(`${i + 1}. Credit ID: ${credit.id}`);
      console.log(`   User ID: ${credit.user_id}`);
      console.log(`   Credits Remaining: $${credit.credits_remaining}`);
      console.log(`   Free Cards: ${credit.card_adds_free_used}/${credit.card_adds_allowed}`);
      console.log(`   Active: ${credit.is_active}`);
      console.log(`   Expires: ${credit.expires_at}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkTransactions();

