/**
 * Script to add service fee credits for aniketde9@gmail.com
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

async function addServiceFeeCredits() {
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

    const email = 'aniketde9@gmail.com';
    console.log(`👤 Processing: ${email}\n`);

    // Find user
    const userResult = await pool.query(
      `SELECT id, privy_did, email FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log(`❌ User not found with email: ${email}`);
      return;
    }

    const user = userResult.rows[0];
    console.log(`✅ Found user: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   DID: ${user.privy_did}\n`);

    // Find active onramp credit
    let creditResult = await pool.query(
      `SELECT * FROM onramp_credits 
       WHERE user_id = $1 
         AND is_active = TRUE 
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.privy_did]
    );

    // If not found with privy_did, try without did:privy: prefix
    if (creditResult.rows.length === 0 && user.privy_did?.startsWith('did:privy:')) {
      const altUserId = user.privy_did.replace('did:privy:', '');
      creditResult = await pool.query(
        `SELECT * FROM onramp_credits 
         WHERE user_id = $1 
           AND is_active = TRUE 
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [altUserId]
      );
    }

    if (creditResult.rows.length === 0) {
      console.log(`⚠️  No active onramp credit found for user`);
      console.log(`   Creating new onramp credit with service fee discounts...\n`);

      // Create new credit with service fee discounts
      const creditId = `credit_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const createResult = await pool.query(
        `INSERT INTO onramp_credits (
          id, user_id, total_credits_issued, credits_remaining,
          card_adds_free_used, card_adds_allowed,
          service_fee_free_used, service_fee_free_allowed,
          expires_at, onramp_transaction_id, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          creditId,
          user.privy_did,
          5.0,
          5.0,
          0,
          5,
          0,
          5, // 5 free service fee discounts
          expiresAt,
          null,
          true,
        ]
      );

      const credit = createResult.rows[0];
      console.log('✅ Credit created successfully!');
      console.log(`   Credit ID: ${credit.id}`);
      console.log(`   Service fee free allowed: ${credit.service_fee_free_allowed || 0}`);
      console.log(`   Service fee free remaining: ${(credit.service_fee_free_allowed || 0) - (credit.service_fee_free_used || 0)}`);
      console.log(`   Card adds allowed: ${credit.card_adds_allowed || 0}`);
      console.log(`   Expires: ${credit.expires_at}`);
    } else {
      const credit = creditResult.rows[0];
      console.log(`✅ Found active credit: ${credit.id}`);
      console.log(`   📊 Current status:`);
      console.log(`      - Service fee free used: ${credit.service_fee_free_used || 0}`);
      console.log(`      - Service fee free allowed: ${credit.service_fee_free_allowed || 0}`);
      console.log(`      - Card adds free used: ${credit.card_adds_free_used || 0}`);
      console.log(`      - Card adds allowed: ${credit.card_adds_allowed || 0}\n`);

      // Update service fee credits
      const newServiceFeeAllowed = 5; // Give them 5 free service fee discounts

      await pool.query(
        `UPDATE onramp_credits 
         SET service_fee_free_allowed = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newServiceFeeAllowed, credit.id]
      );

      console.log(`✅ Updated service fee credits:`);
      console.log(`      - Service fee free allowed: ${newServiceFeeAllowed}`);
      console.log(`      - Service fee free remaining: ${newServiceFeeAllowed - (credit.service_fee_free_used || 0)}`);

      // Verify the update
      const verifyResult = await pool.query(
        `SELECT service_fee_free_used, service_fee_free_allowed 
         FROM onramp_credits 
         WHERE id = $1`,
        [credit.id]
      );

      if (verifyResult.rows.length > 0) {
        const updated = verifyResult.rows[0];
        console.log(`   ✅ Verified: service_fee_free_allowed = ${updated.service_fee_free_allowed}`);
      }
    }

    console.log('\n✅ Process completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

addServiceFeeCredits()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });


