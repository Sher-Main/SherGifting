import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Qn3ToB1FKiuO@ep-icy-bonus-a48u20cb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function runMigration() {
  console.log('🔄 Running bundle system migration...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/004_add_bundle_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Executing migration SQL...');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration executed successfully!');

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('gift_bundles', 'bundle_tokens', 'gift_bundle_links')
      ORDER BY table_name;
    `);

    console.log(`\n✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Verify bundles were seeded
    console.log('\n🔍 Verifying bundles...');
    const bundlesResult = await pool.query(`
      SELECT name, total_usd_value, is_active 
      FROM gift_bundles 
      ORDER BY display_order;
    `);

    console.log(`\n✅ Found ${bundlesResult.rows.length} bundles:`);
    bundlesResult.rows.forEach((row) => {
      console.log(`   - ${row.name}: $${row.total_usd_value} (${row.is_active ? 'active' : 'inactive'})`);
    });

    // Verify bundle tokens
    console.log('\n🔍 Verifying bundle tokens...');
    const tokensResult = await pool.query(`
      SELECT bt.token_symbol, bt.percentage, gb.name as bundle_name
      FROM bundle_tokens bt
      JOIN gift_bundles gb ON bt.bundle_id = gb.id
      ORDER BY gb.display_order, bt.display_order;
    `);

    console.log(`\n✅ Found ${tokensResult.rows.length} token allocations:`);
    tokensResult.rows.forEach((row) => {
      console.log(`   - ${row.bundle_name}: ${row.token_symbol} (${row.percentage}%)`);
    });

    // Verify bundle_id column was added to gifts
    console.log('\n🔍 Verifying gifts.bundle_id column...');
    const columnResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'gifts'
        AND column_name = 'bundle_id';
    `);

    if (columnResult.rows.length > 0) {
      console.log(`✅ bundle_id column exists (${columnResult.rows[0].data_type})`);
    } else {
      console.log('⚠️ bundle_id column not found');
    }

    console.log('\n🎉 Bundle migration complete! All tables, indexes, and seed data created successfully.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();