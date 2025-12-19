import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function runMigration() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Running bundle onramp migration (005_add_bundle_onramp.sql)...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const migrationPath = path.join(__dirname, '../migrations/005_add_bundle_onramp.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executing migration SQL...');
    await pool.query(migrationSQL);
    console.log('✅ Bundle onramp migration completed!');

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('moonpay_transactions', 'jupiter_swaps')
      ORDER BY table_name;
    `);

    console.log(`\n✅ Found ${tablesResult.rows.length} new tables:`);
    tablesResult.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Verify columns were added to gifts table
    console.log('\n🔍 Verifying gifts table columns...');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'gifts'
        AND column_name IN ('total_onramp_amount', 'swap_status', 'onramp_status')
      ORDER BY column_name;
    `);

    console.log(`\n✅ Found ${columnsResult.rows.length} new columns:`);
    columnsResult.rows.forEach((row) => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    console.log('\n🎉 Bundle onramp migration complete! All tables and columns created successfully.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

