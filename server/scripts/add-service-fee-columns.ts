/**
 * Migration script to add service fee discount columns to onramp_credits table
 * 
 * This adds:
 * - service_fee_free_used: INTEGER DEFAULT 0
 * - service_fee_free_allowed: INTEGER DEFAULT 0
 * 
 * Run with: npx tsx server/scripts/add-service-fee-columns.ts
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

async function runMigration() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 10000, // 10 seconds
    idleTimeoutMillis: 30000, // 30 seconds
    max: 1, // Use only 1 connection for migration
  });

  try {
    console.log('🔌 Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Check if columns already exist
    console.log('🔍 Checking if columns already exist...');
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'onramp_credits' 
        AND column_name IN ('service_fee_free_used', 'service_fee_free_allowed')
    `);

    const existingColumns = checkResult.rows.map(row => row.column_name);
    console.log(`   Found existing columns: ${existingColumns.join(', ') || 'none'}`);

    // Add columns if they don't exist
    if (!existingColumns.includes('service_fee_free_used')) {
      console.log('📝 Adding service_fee_free_used column...');
      await pool.query(`
        ALTER TABLE onramp_credits
        ADD COLUMN service_fee_free_used INTEGER DEFAULT 0
      `);
      console.log('✅ Added service_fee_free_used column');
    } else {
      console.log('⏭️  service_fee_free_used column already exists');
    }

    if (!existingColumns.includes('service_fee_free_allowed')) {
      console.log('📝 Adding service_fee_free_allowed column...');
      await pool.query(`
        ALTER TABLE onramp_credits
        ADD COLUMN service_fee_free_allowed INTEGER DEFAULT 0
      `);
      console.log('✅ Added service_fee_free_allowed column');
    } else {
      console.log('⏭️  service_fee_free_allowed column already exists');
    }

    // Verify the columns exist
    console.log('🔍 Verifying columns...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'onramp_credits' 
        AND column_name IN ('service_fee_free_used', 'service_fee_free_allowed')
      ORDER BY column_name
    `);

    console.log('\n📊 Current columns:');
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });

    // Show current data summary
    console.log('\n📊 Current onramp_credits summary:');
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_credits,
        COUNT(CASE WHEN service_fee_free_allowed > 0 THEN 1 END) as credits_with_service_fee_discounts,
        SUM(service_fee_free_used) as total_service_fee_used,
        SUM(service_fee_free_allowed) as total_service_fee_allowed
      FROM onramp_credits
    `);
    
    const summary = summaryResult.rows[0];
    console.log(`   Total credits: ${summary.total_credits}`);
    console.log(`   Credits with service fee discounts: ${summary.credits_with_service_fee_discounts}`);
    console.log(`   Total service fee discounts used: ${summary.total_service_fee_used || 0}`);
    console.log(`   Total service fee discounts allowed: ${summary.total_service_fee_allowed || 0}`);

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });

