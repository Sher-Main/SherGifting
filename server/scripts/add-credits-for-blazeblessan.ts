/**
 * Script to create onramp credit for blazeblessan123@gmail.com with card and service fee discounts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

async function createCredit() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 1,
  });

  try {
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected\n');

    const email = 'blazeblessan123@gmail.com';
    console.log(`👤 Creating credit for: ${email}\n`);

    // Find user
    const userResult = await pool.query(
      `SELECT id, privy_did, email FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }

    const user = userResult.rows[0];
    console.log(`✅ User found: ${user.email}`);
    console.log(`   DID: ${user.privy_did}\n`);

    // Create onramp credit with both card and service fee discounts using direct SQL
    const creditId = `credit_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    console.log('📝 Creating onramp credit...');
    const creditResult = await pool.query(
      `INSERT INTO onramp_credits (
        id, user_id, total_credits_issued, credits_remaining,
        card_adds_free_used, card_adds_allowed,
        service_fee_free_used, service_fee_free_allowed,
        expires_at, onramp_transaction_id, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id)
      DO UPDATE SET
        is_active = TRUE,
        credits_remaining = EXCLUDED.credits_remaining,
        card_adds_free_used = EXCLUDED.card_adds_free_used,
        card_adds_allowed = EXCLUDED.card_adds_allowed,
        service_fee_free_used = EXCLUDED.service_fee_free_used,
        service_fee_free_allowed = EXCLUDED.service_fee_free_allowed,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      RETURNING *`,
      [
        creditId,
        user.privy_did,
        5.0, // Total credits issued
        5.0, // Credits remaining
        0,   // Card adds free used
        5,   // Card adds allowed (5 free card adds)
        0,   // Service fee free used
        5,   // Service fee free allowed (5 free service fee discounts)
        expiresAt,
        null,
        true,
      ]
    );

    const credit = creditResult.rows[0];
    console.log('✅ Credit created successfully!');
    console.log(`   Credit ID: ${credit.id}`);
    console.log(`   Total credits: ${credit.total_credits_issued}`);
    console.log(`   Credits remaining: ${credit.credits_remaining}`);
    console.log(`   Card adds allowed: ${credit.card_adds_allowed || 0}`);
    console.log(`   Card adds remaining: ${(credit.card_adds_allowed || 0) - (credit.card_adds_free_used || 0)}`);
    console.log(`   Service fee free allowed: ${credit.service_fee_free_allowed || 0}`);
    console.log(`   Service fee free remaining: ${(credit.service_fee_free_allowed || 0) - (credit.service_fee_free_used || 0)}`);
    console.log(`   Expires: ${credit.expires_at}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

createCredit()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });





















