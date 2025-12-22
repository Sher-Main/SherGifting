import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function removeBuilderPack() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Removing Builder Pack and updating bundle display orders...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Check current bundles
    console.log('\n🔍 Checking current bundles...');
    const beforeResult = await pool.query(`
      SELECT name, display_order, total_usd_value 
      FROM gift_bundles 
      ORDER BY display_order;
    `);

    console.log(`\n📦 Found ${beforeResult.rows.length} bundles:`);
    beforeResult.rows.forEach((row) => {
      console.log(`   - ${row.name}: $${row.total_usd_value} (order: ${row.display_order})`);
    });

    // Remove Builder Pack tokens first (due to foreign key constraint)
    console.log('\n🗑️  Removing Builder Pack tokens...');
    const deleteTokensResult = await pool.query(`
      DELETE FROM bundle_tokens 
      WHERE bundle_id IN (SELECT id FROM gift_bundles WHERE name = 'Builder Pack');
    `);
    console.log(`   ✅ Deleted ${deleteTokensResult.rowCount} token allocations`);

    // Remove Builder Pack
    console.log('\n🗑️  Removing Builder Pack...');
    const deleteBundleResult = await pool.query(`
      DELETE FROM gift_bundles WHERE name = 'Builder Pack';
    `);
    console.log(`   ✅ Deleted ${deleteBundleResult.rowCount} bundle(s)`);

    // Update Whale Pack display_order to 3
    console.log('\n🔄 Updating Whale Pack display_order to 3...');
    const updateResult = await pool.query(`
      UPDATE gift_bundles 
      SET display_order = 3 
      WHERE name = 'Whale Pack' AND display_order != 3;
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} bundle(s)`);

    // Verify final state
    console.log('\n🔍 Verifying final bundles...');
    const afterResult = await pool.query(`
      SELECT name, display_order, total_usd_value, is_active 
      FROM gift_bundles 
      WHERE is_active = TRUE
      ORDER BY display_order;
    `);

    console.log(`\n✅ Final bundles (${afterResult.rows.length}):`);
    afterResult.rows.forEach((row) => {
      console.log(`   - ${row.name}: $${row.total_usd_value} (order: ${row.display_order})`);
    });

    if (afterResult.rows.length === 3) {
      console.log('\n🎉 Success! Now showing 3 bundles: Starter Pack, Curiosity Pack, and Whale Pack.');
    } else {
      console.log(`\n⚠️  Warning: Expected 3 bundles, but found ${afterResult.rows.length}`);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

removeBuilderPack();

