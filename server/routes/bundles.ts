import express from 'express';
import { BundleService } from '../services/bundleService';

const router = express.Router();
const bundleService = new BundleService();

router.get('/', async (_req, res) => {
  try {
    const bundles = await bundleService.getActiveBundles();
    res.json({ success: true, bundles });
  } catch (e: any) {
    console.error('Error fetching bundles', e);
    res.status(500).json({ success: false, error: 'Failed to fetch bundles' });
  }
});

router.get('/:id/calculate', async (req, res) => {
  try {
    const calc = await bundleService.calculateBundleTokenAmounts(req.params.id);
    res.json({ success: true, ...calc });
  } catch (e: any) {
    console.error('Error calculating bundle', e);
    res.status(500).json({ success: false, error: 'Failed to calculate bundle' });
  }
});

export default router;

