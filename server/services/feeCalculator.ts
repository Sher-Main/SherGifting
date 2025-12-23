import { Pool } from 'pg';
import { DynamicFeeCalculator, DynamicFeeBreakdown } from './dynamicFeeCalculator';

// Compatibility type that includes both old and new field names
export interface FeeBreakdown {
  // New field names (from DynamicFeeBreakdown)
  baseValueUSD: number;
  moonpayFeeUSD: number;
  networkFeeUSD: number;
  totalCostUSD: number;
  overheadPercent: number;
  baseValueSOL: number;
  moonpayFeeSOL: number;
  networkFeeSOL: number;
  totalCostSOL: number;
  baseValueLamports: number;
  moonpayFeeLamports: number;
  networkFeeLamports: number;
  totalCostLamports: number;
  details: {
    solPriceUSD: number;
    ataCount: number;
    ataCostLamports: number;
    ataCostSOL: number;
    ataCostUSD: number;
    swapCount: number;
    swapFeesLamports: number;
    swapFeesSOL: number;
    swapFeesUSD: number;
    dexFeeUSD: number;
    dexFeeLamports: number;
    baseTxsLamports: number;
    // Old detail field names for backward compatibility
    swapFeeUSD: number;
    priorityFeeUSD: number;
    tiplinkCreationFeeUSD: number;
  };
  // Old field names for backward compatibility
  baseValue: number;
  networkFee: number;
  paymentProcessingFee: number;
  totalCost: number;
}

export class FeeCalculator {
  private pool: Pool;
  private dynamicCalculator: DynamicFeeCalculator;

  constructor(pool: Pool, _connection?: any) {
    this.pool = pool;
    this.dynamicCalculator = new DynamicFeeCalculator(pool);
  }

  /**
   * Calculate detailed fee breakdown for a bundle gift using dynamic pricing
   */
  async calculateBundleFees(
    bundleId: string,
    includeCard: boolean = false,
    paymentMethod: 'wallet' | 'moonpay' = 'moonpay'
  ): Promise<FeeBreakdown> {
    const client = await this.pool.connect();
    try {
      // Fetch bundle base value
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const baseValue = Number(bundleRes.rows[0].total_usd_value);

      // Use dynamic calculator
      const dynamicFees = await this.dynamicCalculator.calculateDynamicBundleFees(
        bundleId,
        baseValue,
        includeCard,
        paymentMethod
      );

      // Convert to FeeBreakdown format for backward compatibility
      const result: FeeBreakdown = {
        ...dynamicFees,
        // Map old field names for compatibility
        baseValue: dynamicFees.baseValueUSD,
        networkFee: dynamicFees.networkFeeUSD,
        paymentProcessingFee: dynamicFees.moonpayFeeUSD,
        totalCost: dynamicFees.totalCostUSD,
        overheadPercent: dynamicFees.overheadPercent,
        details: {
          ...dynamicFees.details,
          // Map old detail fields
          ataCount: dynamicFees.details.ataCount,
          ataCostSOL: dynamicFees.details.ataCostSOL,
          ataCostUSD: dynamicFees.details.ataCostUSD,
          swapFeeUSD: dynamicFees.details.swapFeesUSD + dynamicFees.details.dexFeeUSD,
          priorityFeeUSD: dynamicFees.details.swapFeesUSD,
          tiplinkCreationFeeUSD: (dynamicFees.details.baseTxsLamports / 1_000_000_000) * dynamicFees.details.solPriceUSD,
        },
      };
      return result;
    } finally {
      client.release();
    }
  }
}

