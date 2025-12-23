import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function renameCuriosityToValuePack() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Renaming Curiosity Pack to Value Pack...');
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

    // Update Curiosity Pack to Value Pack
    console.log('\n🔄 Renaming Curiosity Pack to Value Pack...');
    const updateResult = await pool.query(`
      UPDATE gift_bundles 
      SET name = 'Value Pack' 
      WHERE name = 'Curiosity Pack';
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

    const valuePackExists = afterResult.rows.some((row) => row.name === 'Value Pack');
    if (valuePackExists) {
      console.log('\n🎉 Success! Curiosity Pack has been renamed to Value Pack.');
    } else {
      console.log('\n⚠️  Warning: Value Pack not found after update.');
    }

  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

renameCuriosityToValuePack();


