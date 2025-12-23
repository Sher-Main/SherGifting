import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateBundlePrices() {
  const client = await pool.connect();
  try {
    console.log('🔄 Updating bundle prices...');

    // Update Starter Pack: $10 → $20
    const starterResult = await client.query(
      `UPDATE gift_bundles 
       SET total_usd_value = 20.00, updated_at = NOW()
       WHERE name = 'Starter Pack'`
    );
    console.log(`✅ Updated Starter Pack: ${starterResult.rowCount} row(s)`);

    // Update Value Pack: $25 → $50
    const valueResult = await client.query(
      `UPDATE gift_bundles 
       SET total_usd_value = 50.00, updated_at = NOW()
       WHERE name = 'Value Pack'`
    );
    console.log(`✅ Updated Value Pack: ${valueResult.rowCount} row(s)`);

    // Verify Whale Pack is still $100
    const whaleResult = await client.query(
      `SELECT name, total_usd_value FROM gift_bundles WHERE name = 'Whale Pack'`
    );
    if (whaleResult.rows.length > 0) {
      console.log(`✅ Whale Pack verified: $${whaleResult.rows[0].total_usd_value}`);
    }

    // Display all bundles
    const allBundles = await client.query(
      `SELECT name, total_usd_value FROM gift_bundles ORDER BY display_order`
    );
    console.log('\n📦 Current bundle prices:');
    allBundles.rows.forEach((bundle) => {
      console.log(`   ${bundle.name}: $${bundle.total_usd_value}`);
    });

    console.log('\n✅ Bundle prices updated successfully!');
  } catch (error) {
    console.error('❌ Error updating bundle prices:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateBundlePrices().catch(console.error);

