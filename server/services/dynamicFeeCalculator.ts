import { Pool } from 'pg';
import { fetchCurrentPrices, getSOLPrice } from './priceFetcher';

const LAMPORTS_PER_SOL = 1_000_000_000;

// Fixed lamport costs (these don't change with price)
const ATA_COST_LAMPORTS = 203_928;
const BASE_TX_FEE_LAMPORTS = 5_000;
const PRIORITY_FEE_SWAP_LAMPORTS = 80_000;
const PRIORITY_FEE_OTHER_LAMPORTS = 10_000;

// Percentage-based fees
const MOONPAY_FEE_PERCENT = 0.055; // 5.5%
const DEX_SWAP_FEE_PERCENT = 0.003; // 0.3%

interface BundleToken {
  mint: string;
  symbol: string;
  allocationPercent: number;
}

export interface DynamicFeeBreakdown {
  // USD values
  baseValueUSD: number;
  moonpayFeeUSD: number;
  networkFeeUSD: number;
  totalCostUSD: number;
  overheadPercent: number;
  
  // SOL values
  baseValueSOL: number;
  moonpayFeeSOL: number;
  networkFeeSOL: number;
  totalCostSOL: number;
  
  // Lamports values
  baseValueLamports: number;
  moonpayFeeLamports: number;
  networkFeeLamports: number;
  totalCostLamports: number;
  
  // Detailed breakdown
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
  };
}

export class DynamicFeeCalculator {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Calculate all fees dynamically based on current SOL price
   */
  async calculateDynamicBundleFees(
    bundleId: string,
    baseValueUSD: number,
    includeCard: boolean = false,
    paymentMethod: 'wallet' | 'moonpay' = 'moonpay'
  ): Promise<DynamicFeeBreakdown> {
    const client = await this.pool.connect();
    try {
      // Fetch bundle tokens
      const tokensRes = await client.query(
        `SELECT token_mint, token_symbol, percentage
         FROM bundle_tokens
         WHERE bundle_id = $1
         ORDER BY display_order`,
        [bundleId]
      );

      const tokens: BundleToken[] = tokensRes.rows.map(row => ({
        mint: row.token_mint,
        symbol: row.token_symbol,
        allocationPercent: Number(row.percentage)
      }));

      const tokenCount = tokens.length;
      const cardFee = includeCard ? 1.0 : 0;
      const baseValueWithCard = baseValueUSD + cardFee;
      const swapCount = tokenCount - 1; // Exclude SOL

      // Fetch current SOL price
      const solPriceUSD = await getSOLPrice();
      
      if (solPriceUSD === 0) {
        throw new Error('Failed to fetch SOL price');
      }

      // Calculate ATA costs (fixed in lamports)
      const senderATAs = Math.max(0, tokenCount - 1) * ATA_COST_LAMPORTS; // Sender already has SOL ATA
      const tiplinkATAs = tokenCount * ATA_COST_LAMPORTS;
      const recipientATAs = tokenCount * ATA_COST_LAMPORTS;
      const totalATALamports = senderATAs + tiplinkATAs + recipientATAs;
      
      // Calculate swap priority fees (fixed in lamports)
      const swapFeesLamports = swapCount * PRIORITY_FEE_SWAP_LAMPORTS;
      
      // Calculate DEX swap fees (percentage of swapped value)
      const valueToSwapUSD = (baseValueWithCard / tokenCount) * swapCount;
      const dexFeeUSD = valueToSwapUSD * DEX_SWAP_FEE_PERCENT;
      const dexFeeLamports = Math.floor((dexFeeUSD / solPriceUSD) * LAMPORTS_PER_SOL);
      
      // Base transaction costs (fixed in lamports)
      // Estimated: TipLink creation + claim transaction
      const baseTxsLamports = BASE_TX_FEE_LAMPORTS * 2; // Rough estimate
      
      // Total network fees in lamports
      const networkFeeLamports = totalATALamports + swapFeesLamports + dexFeeLamports + baseTxsLamports;
      const networkFeeSOL = networkFeeLamports / LAMPORTS_PER_SOL;
      const networkFeeUSD = networkFeeSOL * solPriceUSD;
      
      // MoonPay fee (percentage of base value + network fee)
      // Only apply if payment method is moonpay
      const moonpayFeeBase = baseValueWithCard + networkFeeUSD;
      const moonpayFeeUSD = paymentMethod === 'moonpay' ? moonpayFeeBase * MOONPAY_FEE_PERCENT : 0;
      const moonpayFeeSOL = moonpayFeeUSD / solPriceUSD;
      const moonpayFeeLamports = Math.floor(moonpayFeeSOL * LAMPORTS_PER_SOL);
      
      // Base value conversions
      const baseValueSOL = baseValueWithCard / solPriceUSD;
      const baseValueLamports = Math.floor(baseValueSOL * LAMPORTS_PER_SOL);
      
      // Total costs
      const totalCostUSD = baseValueWithCard + moonpayFeeUSD + networkFeeUSD;
      const totalCostSOL = totalCostUSD / solPriceUSD;
      const totalCostLamports = Math.floor(totalCostSOL * LAMPORTS_PER_SOL);
      
      // Overhead percentage
      const overheadPercent = ((moonpayFeeUSD + networkFeeUSD) / baseValueWithCard) * 100;
      
      return {
        // USD
        baseValueUSD: parseFloat(baseValueWithCard.toFixed(2)),
        moonpayFeeUSD: parseFloat(moonpayFeeUSD.toFixed(2)),
        networkFeeUSD: parseFloat(networkFeeUSD.toFixed(2)),
        totalCostUSD: parseFloat(totalCostUSD.toFixed(2)),
        overheadPercent: parseFloat(overheadPercent.toFixed(1)),
        
        // SOL
        baseValueSOL: parseFloat(baseValueSOL.toFixed(6)),
        moonpayFeeSOL: parseFloat(moonpayFeeSOL.toFixed(6)),
        networkFeeSOL: parseFloat(networkFeeSOL.toFixed(6)),
        totalCostSOL: parseFloat(totalCostSOL.toFixed(6)),
        
        // Lamports
        baseValueLamports,
        moonpayFeeLamports,
        networkFeeLamports,
        totalCostLamports,
        
        // Details
        details: {
          solPriceUSD: parseFloat(solPriceUSD.toFixed(2)),
          ataCount: tokenCount * 3 - 1, // sender + tiplink + recipient (minus 1 for SOL sender)
          ataCostLamports: totalATALamports,
          ataCostSOL: parseFloat((totalATALamports / LAMPORTS_PER_SOL).toFixed(6)),
          ataCostUSD: parseFloat(((totalATALamports / LAMPORTS_PER_SOL) * solPriceUSD).toFixed(2)),
          swapCount,
          swapFeesLamports,
          swapFeesSOL: parseFloat((swapFeesLamports / LAMPORTS_PER_SOL).toFixed(6)),
          swapFeesUSD: parseFloat(((swapFeesLamports / LAMPORTS_PER_SOL) * solPriceUSD).toFixed(2)),
          dexFeeUSD: parseFloat(dexFeeUSD.toFixed(2)),
          dexFeeLamports,
          baseTxsLamports
        }
      };
    } finally {
      client.release();
    }
  }
}

