/**
 * Script to add service fee credits to specific users
 * 
 * This updates existing onramp_credits records to give users 5 free service fee discounts
 * 
 * Run with: npx tsx server/scripts/add-service-fee-credits.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

// List of emails to add service fee credits to
const EMAILS_TO_UPDATE = [
  'ayush@opika.co',
  'kanth.miriyala@gmail.com',
  'aniket@opika.co'
];

async function addServiceFeeCredits() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 1,
  });

  try {
    console.log('🔌 Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    console.log(`\n📋 Processing ${EMAILS_TO_UPDATE.length} users...\n`);

    for (const email of EMAILS_TO_UPDATE) {
      console.log(`\n👤 Processing: ${email}`);
      
      // Step 1: Find user by email
      const userResult = await pool.query(
        `SELECT id, privy_did, email FROM users WHERE email = $1`,
        [email]
      );

      if (userResult.rows.length === 0) {
        console.log(`   ⚠️  User not found with email: ${email}`);
        continue;
      }

      const user = userResult.rows[0];
      console.log(`   ✅ Found user: ${user.email} (ID: ${user.id}, DID: ${user.privy_did})`);

      // Step 2: Find active onramp credit for this user
      // Try with privy_did first, then fallback to user_id if needed
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
        console.log(`   ⚠️  No active onramp credit found for user`);
        continue;
      }

      const credit = creditResult.rows[0];
      console.log(`   ✅ Found active credit: ${credit.id}`);
      console.log(`   📊 Current status:`);
      console.log(`      - Service fee free used: ${credit.service_fee_free_used || 0}`);
      console.log(`      - Service fee free allowed: ${credit.service_fee_free_allowed || 0}`);
      console.log(`      - Card adds free used: ${credit.card_adds_free_used || 0}`);
      console.log(`      - Card adds allowed: ${credit.card_adds_allowed || 0}`);

      // Step 3: Update service fee credits
      const newServiceFeeAllowed = 5; // Give them 5 free service fee discounts
      
      await pool.query(
        `UPDATE onramp_credits 
         SET service_fee_free_allowed = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newServiceFeeAllowed, credit.id]
      );

      console.log(`   ✅ Updated service fee credits:`);
      console.log(`      - Service fee free allowed: ${newServiceFeeAllowed}`);
      console.log(`      - Service fee free remaining: ${newServiceFeeAllowed - (credit.service_fee_free_used || 0)}`);

      // Step 4: Verify the update
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

    console.log('\n✅ All users processed successfully!');

    // Final summary
    console.log('\n📊 Summary:');
    const summaryResult = await pool.query(
      `SELECT 
        u.email,
        oc.service_fee_free_used,
        oc.service_fee_free_allowed,
        oc.service_fee_free_allowed - COALESCE(oc.service_fee_free_used, 0) as service_fee_free_remaining
      FROM onramp_credits oc
      JOIN users u ON oc.user_id = u.privy_did OR oc.user_id = REPLACE(u.privy_did, 'did:privy:', '')
      WHERE u.email = ANY($1)
        AND oc.is_active = TRUE
        AND oc.expires_at > NOW()
      ORDER BY u.email`,
      [EMAILS_TO_UPDATE]
    );

    console.log('\n   Email | Used | Allowed | Remaining');
    console.log('   ' + '-'.repeat(50));
    summaryResult.rows.forEach(row => {
      console.log(`   ${row.email} | ${row.service_fee_free_used || 0} | ${row.service_fee_free_allowed || 0} | ${row.service_fee_free_remaining || 0}`);
    });

  } catch (error) {
    console.error('❌ Script failed:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run script
addServiceFeeCredits()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });




















