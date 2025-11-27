import cron from 'node-cron';
import { cleanupExpiredCredits } from '../lib/onramp';

/**
 * Credit Cleanup Job
 * 
 * Runs daily at midnight UTC to mark expired credits as inactive
 * This helps keep the database clean and ensures expired credits
 * are not used for free card sends
 */
export function startCreditCleanupJob() {
  console.log('🕐 Starting credit cleanup cron job...');
  
  // Run daily at midnight UTC (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🧹 Running scheduled credit cleanup...');
      const expiredCount = await cleanupExpiredCredits();
      console.log(`✅ Credit cleanup complete. Expired credits: ${expiredCount}`);
    } catch (error) {
      console.error('❌ Error in credit cleanup job:', error);
    }
  });

  console.log('✅ Credit cleanup job scheduled (daily at midnight UTC)');
}

