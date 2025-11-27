import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Qn3ToB1FKiuO@ep-icy-bonus-a48u20cb.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function runMigration() {
  console.log('🔄 Running onramp system migration...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/002_add_onramp_system.sql');
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
        AND table_name IN ('onramp_transactions', 'onramp_credits', 'card_transactions')
      ORDER BY table_name;
    `);

    console.log(`\n✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // Check indexes
    console.log('\n🔍 Verifying indexes...');
    const indexesResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('onramp_transactions', 'onramp_credits', 'card_transactions')
      ORDER BY tablename, indexname;
    `);

    console.log(`\n✅ Found ${indexesResult.rows.length} indexes:`);
    indexesResult.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
    });

    console.log('\n🎉 Migration complete! All tables and indexes created successfully.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

