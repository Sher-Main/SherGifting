import express, { Request, Response } from 'express';
import { cleanupExpiredCredits } from '../lib/onramp';

const router = express.Router();

/**
 * POST /api/cron/cleanup-expired-credits
 * 
 * Runs daily at midnight UTC (from vercel.json)
 * 
 * Purpose: Mark expired credits as inactive
 * This helps keep the database clean
 */
router.post('/cleanup-expired-credits', async (req: Request, res: Response) => {
  try {
    // Verify cron secret (Vercel sends this)
    const token = req.headers.authorization?.split(' ')[1];
    const cronSecret = process.env.CRON_SECRET;

    if (!token || token !== cronSecret) {
      console.error('❌ Unauthorized cron call');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🧹 Starting cleanup cron job...');

    const expiredCount = await cleanupExpiredCredits();

    console.log(`✅ Cleanup complete. Expired: ${expiredCount}`);

    return res.status(200).json({
      success: true,
      expiredCreditsCount: expiredCount,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Cleanup cron error:', error);
    return res.status(500).json({
      error: String(error),
    });
  }
});

export default router;

