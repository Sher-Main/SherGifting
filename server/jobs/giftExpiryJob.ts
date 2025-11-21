import cron from 'node-cron';
import { GiftRefundService } from '../services/giftRefundService';

export function startGiftExpiryJob() {
  const refundService = new GiftRefundService();

  // Run every 12 hours (at midnight and noon)
  const schedule = '0 */12 * * *'; // 0 minutes, every 12 hours

  console.log('🕐 Starting gift expiry cron job');
  console.log('   Schedule: Every 12 hours (12:00 AM and 12:00 PM)');
  console.log('   Expiry time: 24 hours after gift creation');

  cron.schedule(schedule, async () => {
    const timestamp = new Date().toISOString();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🕐 [${timestamp}] Running gift expiry check (12-hour schedule)`);
    console.log('='.repeat(70));

    try {
      const result = await refundService.processAllExpiredGifts();

      console.log('\n📊 Summary:');
      console.log(`   ✅ Successful refunds: ${result.success}`);
      console.log(`   ❌ Failed refunds: ${result.failed}`);
      console.log(`   📦 Total processed: ${result.total}`);

    } catch (error) {
      console.error('❌ Error in gift expiry cron job:', error);
    }

    console.log('='.repeat(70));
    console.log(`✅ Gift expiry check complete at ${new Date().toISOString()}\n`);
  });

  console.log('✅ Gift expiry cron job started successfully');

  // Run initial check 30 seconds after startup
  setTimeout(async () => {
    console.log('\n🚀 Running initial gift expiry check on startup...\n');
    try {
      const result = await refundService.processAllExpiredGifts();
      console.log(`\n📊 Initial check: ${result.success} refunded, ${result.failed} failed, ${result.total} total\n`);
    } catch (error) {
      console.error('❌ Error in initial gift expiry check:', error);
    }
  }, 30000); // 30 seconds delay
}



