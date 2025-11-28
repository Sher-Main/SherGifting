import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Qn3ToB1FKiuO@ep-icy-bonus-a48u20cb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function runMigration() {
  console.log('🔄 Running webhook tracking migration...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/003_add_webhook_tracking.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration SQL...');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration executed successfully!');

    // Verify columns were added
    console.log('\n🔍 Verifying columns...');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'onramp_transactions'
        AND column_name IN ('idempotency_key', 'transaction_hash')
      ORDER BY column_name;
    `);

    console.log(`\n✅ Found ${columnsResult.rows.length} new columns:`);
    columnsResult.rows.forEach((row) => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    // Verify pending_onramps table
    console.log('\n🔍 Verifying pending_onramps table...');
    const tableResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'pending_onramps';
    `);

    if (tableResult.rows.length > 0) {
      console.log('✅ pending_onramps table created');
    } else {
      console.log('⚠️ pending_onramps table not found');
    }

    console.log('\n🎉 Migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

