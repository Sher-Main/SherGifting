import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

async function updateStarterPackBadgeColor() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Updating Starter Pack badge color from green to amber...');
  console.log(`📊 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Check current badge color
    console.log('\n🔍 Checking current Starter Pack badge color...');
    const beforeResult = await pool.query(`
      SELECT name, badge_text, badge_color 
      FROM gift_bundles 
      WHERE name = 'Starter Pack';
    `);

    if (beforeResult.rows.length > 0) {
      console.log(`   Current: ${beforeResult.rows[0].badge_text} - ${beforeResult.rows[0].badge_color}`);
    }

    // Update badge color from green (#22C55E) to amber (#F59E0B)
    console.log('\n🔄 Updating badge color...');
    const updateResult = await pool.query(`
      UPDATE gift_bundles 
      SET badge_color = '#F59E0B' 
      WHERE name = 'Starter Pack' AND badge_color = '#22C55E';
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} bundle(s)`);

    // Verify final state
    console.log('\n🔍 Verifying update...');
    const afterResult = await pool.query(`
      SELECT name, badge_text, badge_color 
      FROM gift_bundles 
      WHERE name = 'Starter Pack';
    `);

    if (afterResult.rows.length > 0) {
      console.log(`   Final: ${afterResult.rows[0].badge_text} - ${afterResult.rows[0].badge_color}`);
      if (afterResult.rows[0].badge_color === '#F59E0B') {
        console.log('\n🎉 Success! Starter Pack badge color updated to amber.');
      } else {
        console.log('\n⚠️  Warning: Badge color may not have been updated.');
      }
    }

  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateStarterPackBadgeColor();

