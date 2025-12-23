import { Pool } from 'pg';
import { JupiterService } from './jupiterService';
import { Connection } from '@solana/web3.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const ATA_COST_SOL = 0.00203928; // Cost per ATA creation
const MOONPAY_FEE_PERCENT = 0.055; // 5.5% MoonPay/Privy fee
const BASE_TX_FEE_SOL = 0.000005;
const PRIORITY_FEE_SOL = 0.0001;
const DEX_FEE_PERCENT = 0.003; // 0.3% Jupiter swap fee
const SLIPPAGE_BUFFER_PERCENT = 0.03; // 3% slippage buffer

export interface FeeBreakdown {
  baseValue: number;
  networkFee: number;
  paymentProcessingFee: number;
  totalCost: number;
  overheadPercent: number;
  details: {
    ataCount: number;
    ataCostSOL: number;
    ataCostUSD: number;
    swapFeeUSD: number;
    priorityFeeUSD: number;
    tiplinkCreationFeeUSD: number;
  };
}

export class FeeCalculator {
  private pool: Pool;
  private jupiterService: JupiterService;

  constructor(pool: Pool, connection: Connection) {
    this.pool = pool;
    this.jupiterService = new JupiterService(connection);
  }

  /**
   * Calculate detailed fee breakdown for a bundle gift
   */
  async calculateBundleFees(
    bundleId: string,
    includeCard: boolean = false,
    paymentMethod: 'wallet' | 'moonpay' = 'moonpay'
  ): Promise<FeeBreakdown> {
    const client = await this.pool.connect();
    try {
      // Fetch bundle data
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const baseValue = Number(bundleRes.rows[0].total_usd_value);
      const cardFee = includeCard ? 1.0 : 0;
      const baseValueWithCard = baseValue + cardFee;

      // Get token count
      const tokensRes = await client.query(
        `SELECT COUNT(*) as token_count FROM bundle_tokens WHERE bundle_id = $1`,
        [bundleId]
      );
      const tokenCount = Number(tokensRes.rows[0].token_count);

      // Get SOL price for USD conversions
      const solPrice = await this.jupiterService.getTokenPrice(SOL_MINT);
      if (solPrice === 0) {
        throw new Error('Failed to fetch SOL price');
      }

      // Calculate ATA costs
      // Sender ATAs: tokenCount - 1 (assuming sender has SOL)
      // TipLink ATAs: tokenCount (one per token)
      // Recipient ATAs: tokenCount (one per token for claiming)
      const senderATAs = Math.max(0, tokenCount - 1);
      const tiplinkATAs = tokenCount;
      const recipientATAs = tokenCount;
      const totalATAs = senderATAs + tiplinkATAs + recipientATAs;

      const ataCostSOL = totalATAs * ATA_COST_SOL;
      const ataCostUSD = ataCostSOL * solPrice;

      // Calculate swap fees (for non-SOL tokens)
      const nonSolTokensRes = await client.query(
        `SELECT COUNT(*) as count FROM bundle_tokens 
         WHERE bundle_id = $1 AND token_mint != $2`,
        [bundleId, SOL_MINT]
      );
      const nonSolTokenCount = Number(nonSolTokensRes.rows[0].count);

      // Swap fee: 0.3% of non-SOL portion
      const nonSolPortion = baseValueWithCard * (nonSolTokenCount / tokenCount);
      const swapFeeUSD = nonSolPortion * DEX_FEE_PERCENT;

      // Priority fees: estimated transaction count
      // Swaps + TipLink funding + claim transaction
      const estimatedTxCount = nonSolTokenCount + 2; // swaps + funding + claim
      const priorityFeeSOL = PRIORITY_FEE_SOL * estimatedTxCount;
      const priorityFeeUSD = priorityFeeSOL * solPrice;

      // TipLink creation fee (minimal, mostly covered by ATA costs)
      const tiplinkCreationFeeUSD = tokenCount * 0.001; // Small fee per TipLink

      // Total network fee
      const networkFee = ataCostUSD + swapFeeUSD + priorityFeeUSD + tiplinkCreationFeeUSD;

      // Payment processing fee (only for onramp)
      const paymentProcessingFee =
        paymentMethod === 'moonpay' ? baseValueWithCard * MOONPAY_FEE_PERCENT : 0;

      // Total cost
      const totalCost = baseValueWithCard + networkFee + paymentProcessingFee;

      // Overhead percentage
      const overheadPercent = ((networkFee + paymentProcessingFee) / baseValueWithCard) * 100;

      return {
        baseValue: parseFloat(baseValueWithCard.toFixed(2)),
        networkFee: parseFloat(networkFee.toFixed(2)),
        paymentProcessingFee: parseFloat(paymentProcessingFee.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        overheadPercent: parseFloat(overheadPercent.toFixed(1)),
        details: {
          ataCount: totalATAs,
          ataCostSOL: parseFloat(ataCostSOL.toFixed(6)),
          ataCostUSD: parseFloat(ataCostUSD.toFixed(2)),
          swapFeeUSD: parseFloat(swapFeeUSD.toFixed(2)),
          priorityFeeUSD: parseFloat(priorityFeeUSD.toFixed(2)),
          tiplinkCreationFeeUSD: parseFloat(tiplinkCreationFeeUSD.toFixed(2)),
        },
      };
    } finally {
      client.release();
    }
  }
}

