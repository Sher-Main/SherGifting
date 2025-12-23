import { Pool } from 'pg';
import { TipLink } from '@tiplink/api';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { JupiterService } from './jupiterService';
import { encryptTipLink } from '../utils/encryption';
import { transferSOLToTipLink, transferSPLTokenToTipLink } from './solana';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface OnrampAmountBreakdown {
  baseAmount: number;
  serviceFee: number;
  cardFee: number;
  ataBuffer: number;
  slippageBuffer: number;
  total: number;
}

export class BundleOrchestrator {
  private pool: Pool;
  private connection: Connection;
  private jupiterService: JupiterService;

  constructor(pool: Pool, connection: Connection) {
    this.pool = pool;
    this.connection = connection;
    this.jupiterService = new JupiterService(connection);
  }

  /**
   * Calculate total onramp amount including buffer for ATAs and slippage
   */
  async calculateOnrampAmount(
    bundleId: string,
    includeCard: boolean = false
  ): Promise<OnrampAmountBreakdown> {
    const client = await this.pool.connect();
    try {
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const baseAmount = Number(bundleRes.rows[0].total_usd_value);
      const serviceFee = 1.0;
      const cardFee = includeCard ? 1.0 : 0;

      // Count non-SOL tokens (each needs ATA creation ~0.002 SOL)
      const tokensRes = await client.query(
        `SELECT COUNT(*) as count FROM bundle_tokens 
         WHERE bundle_id = $1 AND token_mint != $2`,
        [bundleId, SOL_MINT]
      );

      const nonSolTokenCount = Number(tokensRes.rows[0].count);
      const ataBufferSol = nonSolTokenCount * 0.002; // ~0.002 SOL per ATA

      // Convert SOL to USD (get current SOL price)
      const solPrice = await this.jupiterService.getTokenPrice(SOL_MINT);
      const ataBufferUsd = ataBufferSol * solPrice;

      // Add 3% slippage buffer for swaps
      const slippageBuffer = baseAmount * 0.03;

      const total = baseAmount + serviceFee + cardFee + ataBufferUsd + slippageBuffer;

      return {
        baseAmount,
        serviceFee,
        cardFee,
        ataBuffer: ataBufferUsd,
        slippageBuffer,
        total: Math.ceil(total * 100) / 100, // Round up to nearest cent
      };
    } finally {
      client.release();
    }
  }

  /**
   * Poll wallet balance for SOL arrival
   */
  async pollWalletBalance(
    walletAddress: string,
    expectedAmountSol: number,
    maxAttempts: number = 20
  ): Promise<boolean> {
    const pubkey = new PublicKey(walletAddress);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const balance = await this.connection.getBalance(pubkey);
        const balanceSol = balance / LAMPORTS_PER_SOL;

        console.log(
          `Polling ${walletAddress}: ${balanceSol.toFixed(6)} SOL (expecting ${expectedAmountSol.toFixed(6)})`
        );

        // 95% threshold to account for fees
        if (balanceSol >= expectedAmountSol * 0.95) {
          return true;
        }
      } catch (error) {
        console.error('Balance check error:', error);
      }

      // Wait 30 seconds between polls (twice per minute)
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    return false;
  }

  /**
   * Execute bundle swaps (SOL → tokens via Jupiter)
   */
  async executeSwaps(params: {
    giftId: string;
    bundleId: string;
    userWalletAddress: string;
    availableSol: number;
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get bundle tokens
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [params.bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const bundleValue = Number(bundleRes.rows[0].total_usd_value);

      // Get all tokens including SOL to calculate SOL portion
      const allTokensRes = await client.query(
        `SELECT bt.token_mint, bt.token_symbol, bt.percentage
         FROM bundle_tokens bt
         WHERE bt.bundle_id = $1
         ORDER BY bt.display_order`,
        [params.bundleId]
      );

      // Calculate SOL portion of bundle (not to be swapped)
      const solToken = allTokensRes.rows.find((t: any) => t.token_mint === SOL_MINT);
      const solPercentage = solToken ? Number(solToken.percentage) : 0;
      const solUsdValue = (bundleValue * solPercentage) / 100;

      // Get SOL price
      const solPrice = await this.jupiterService.getTokenPrice(SOL_MINT);
      const solAmountNeeded = solPrice > 0 ? solUsdValue / solPrice : 0;

      // Reserve SOL for bundle portion (plus buffer for fees)
      const reservedSol = solAmountNeeded + 0.01; // Small buffer for transaction fees
      const availableSolForSwaps = Math.max(0, params.availableSol - reservedSol);

      // Get non-SOL tokens to swap
      const tokensRes = await client.query(
        `SELECT bt.token_mint, bt.token_symbol, bt.percentage
         FROM bundle_tokens bt
         WHERE bt.bundle_id = $1 AND bt.token_mint != $2
         ORDER BY bt.display_order`,
        [params.bundleId, SOL_MINT]
      );

      const userPubkey = new PublicKey(params.userWalletAddress);

      // Calculate total USD for swaps
      const swapUsdTotal = bundleValue - solUsdValue;
      let remainingSwapSol = availableSolForSwaps;

      for (const token of tokensRes.rows) {
        try {
          const targetUsdValue = (bundleValue * Number(token.percentage)) / 100;
          
          // Calculate SOL needed for this swap (proportional to available SOL)
          const solToSwap = (targetUsdValue / swapUsdTotal) * remainingSwapSol;
          const solToSwapLamports = Math.floor(solToSwap * LAMPORTS_PER_SOL);

          if (solToSwapLamports <= 0) {
            console.warn(`⚠️ Not enough SOL for ${token.token_symbol} swap, skipping`);
            continue;
          }

          console.log(`Swapping ${solToSwap.toFixed(6)} SOL → ${token.token_symbol}`);

          // Get quote
          const quote = await this.jupiterService.getQuote({
            inputMint: SOL_MINT,
            outputMint: token.token_mint,
            amount: solToSwapLamports,
            slippageBps: 300, // 3% slippage
          });

          // Get swap transaction (unsigned) - user will sign on frontend
          const swapTransactionBase64 = await this.jupiterService.getSwapTransaction({
            quoteResponse: quote,
            userPublicKey: params.userWalletAddress,
          });

          // Calculate output amount (approximate from quote)
          const outputDecimals = 9; // Default, should be fetched from token metadata
          const outputAmount = Number(quote.outAmount) / Math.pow(10, outputDecimals);

          // Store swap transaction in database for frontend to sign
          // Note: transaction_signature column stores the base64 transaction initially,
          // then gets updated with the actual signature after user signs
          await client.query(
            `INSERT INTO jupiter_swaps (
              gift_id, input_mint, output_mint, 
              input_amount, output_amount, transaction_signature, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              params.giftId,
              SOL_MINT,
              token.token_mint,
              solToSwap,
              outputAmount,
              swapTransactionBase64, // Store base64 transaction (will be replaced with signature after signing)
              'pending_signature', // Status: waiting for user to sign
            ]
          );

          console.log(`✅ Swap transaction prepared for ${token.token_symbol}`);
        } catch (error: any) {
          console.error(`❌ Swap failed for ${token.token_symbol}:`, error);

          // Record failed swap
          await client.query(
            `INSERT INTO jupiter_swaps (
              gift_id, input_mint, output_mint, 
              input_amount, status, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              params.giftId,
              SOL_MINT,
              token.token_mint,
              0,
              'failed',
              error.message,
            ]
          );

          throw error;
        }
      }

      // Update gift status to pending - swaps need user signatures
      await client.query(
        `UPDATE gifts SET swap_status = 'pending_signature' WHERE id = $1`,
        [params.giftId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create multiple TipLinks (one per token) and store in gift_tiplinks table
   */
  async createBundleTipLinks(params: {
    giftId: string;
    bundleId: string;
    userWalletAddress: string;
  }): Promise<Array<{ tokenMint: string; tokenSymbol: string; tiplinkUrl: string; amount: number }>> {
    const client = await this.pool.connect();

    try {
      // Get bundle configuration
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [params.bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const bundleValue = Number(bundleRes.rows[0].total_usd_value);

      const tokensRes = await client.query(
        `SELECT bt.token_mint, bt.token_symbol, bt.percentage
         FROM bundle_tokens bt
         WHERE bt.bundle_id = $1
         ORDER BY bt.display_order`,
        [params.bundleId]
      );

      const userPubkey = new PublicKey(params.userWalletAddress);
      const tiplinks: Array<{ tokenMint: string; tokenSymbol: string; tiplinkUrl: string; amount: number }> = [];

      // Get swap amounts if swaps were executed
      const swapAmounts = new Map<string, number>();
      const swapsRes = await client.query(
        `SELECT output_mint, output_amount FROM jupiter_swaps 
         WHERE gift_id = $1 AND status = 'completed'`,
        [params.giftId]
      );

      for (const swap of swapsRes.rows) {
        swapAmounts.set(swap.output_mint, Number(swap.output_amount));
      }

      // Get SOL balance
      const solBalance = await this.connection.getBalance(userPubkey);
      const solBalanceAmount = solBalance / LAMPORTS_PER_SOL;

      // Calculate SOL amount for bundle
      const solToken = tokensRes.rows.find((t: any) => t.token_mint === SOL_MINT);
      const solPercentage = solToken ? Number(solToken.percentage) : 0;
      const solTargetUsd = (bundleValue * solPercentage) / 100;
      const solPrice = await this.jupiterService.getTokenPrice(SOL_MINT);
      const solAmount = solPrice > 0 ? Math.min(solTargetUsd / solPrice, solBalanceAmount) : 0;

      const ENCRYPTION_KEY = process.env.TIPLINK_ENCRYPTION_KEY;
      if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
        throw new Error('TIPLINK_ENCRYPTION_KEY not set or too short');
      }

      // Create TipLink for each token
      for (const token of tokensRes.rows) {
        try {
          let tokenAmount = 0;

          if (token.token_mint === SOL_MINT) {
            tokenAmount = solAmount;
          } else {
            tokenAmount = swapAmounts.get(token.token_mint) || 0;
          }

          if (tokenAmount === 0) {
            console.warn(`⚠️ No amount available for ${token.token_symbol}, skipping`);
            continue;
          }

          // Create TipLink
          const tiplink = await TipLink.create();
          const encryptedKeypair = encryptTipLink(
            JSON.stringify(Array.from(tiplink.keypair.secretKey)),
            ENCRYPTION_KEY
          );

          // Store TipLink in gift_tiplinks table
          await client.query(
            `INSERT INTO gift_tiplinks (
              gift_id, token_mint, token_symbol, tiplink_url, 
              tiplink_keypair_encrypted, token_amount
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              params.giftId,
              token.token_mint,
              token.token_symbol,
              tiplink.url.toString(),
              encryptedKeypair,
              tokenAmount,
            ]
          );

          tiplinks.push({
            tokenMint: token.token_mint,
            tokenSymbol: token.token_symbol,
            tiplinkUrl: tiplink.url.toString(),
            amount: tokenAmount,
          });

          console.log(`✅ TipLink created for ${token.token_symbol}: ${tiplink.url.toString()}`);
        } catch (error: any) {
          console.error(`❌ Failed to create TipLink for ${token.token_symbol}:`, error);
          throw error;
        }
      }

      // Update gift with first TipLink URL for backward compatibility
      if (tiplinks.length > 0) {
        await client.query(
          `UPDATE gifts SET tiplink_url = $1, tiplink_public_key = $2 WHERE id = $3`,
          [tiplinks[0].tiplinkUrl, 'MULTI_TIPLINK', params.giftId]
        );
      }

      return tiplinks;
    } finally {
      client.release();
    }
  }

  /**
   * Create TipLink and fund with bundle tokens (legacy method, kept for backward compatibility)
   */
  async createBundleTipLink(params: {
    giftId: string;
    bundleId: string;
    userWalletAddress: string;
  }): Promise<string> {
    const client = await this.pool.connect();

    try {
      // Create TipLink
      const tiplink = await TipLink.create();
      const tiplinkPubkey = tiplink.keypair.publicKey;

      console.log(`✅ TipLink created: ${tiplink.url.toString()}`);

      // Get all tokens in bundle (including SOL)
      const bundleRes = await client.query(
        `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
        [params.bundleId]
      );

      if (!bundleRes.rows.length) {
        throw new Error('Bundle not found');
      }

      const bundleValue = Number(bundleRes.rows[0].total_usd_value);

      const tokensRes = await client.query(
        `SELECT bt.token_mint, bt.token_symbol, bt.percentage
         FROM bundle_tokens bt
         WHERE bt.bundle_id = $1
         ORDER BY bt.display_order`,
        [params.bundleId]
      );

      const userPubkey = new PublicKey(params.userWalletAddress);

      // Get actual swap output amounts from database
      const swapAmounts = new Map<string, number>();
      const swapsRes = await client.query(
        `SELECT output_mint, output_amount FROM jupiter_swaps 
         WHERE gift_id = $1 AND status = 'completed'`,
        [params.giftId]
      );

      for (const swap of swapsRes.rows) {
        swapAmounts.set(swap.output_mint, Number(swap.output_amount));
      }

      // Get SOL balance (remaining after swaps)
      const solBalance = await this.connection.getBalance(userPubkey);
      const solBalanceAmount = solBalance / LAMPORTS_PER_SOL;
      
      // Calculate SOL amount for bundle (percentage of bundle value)
      const solPercentage = tokensRes.rows.find((t: any) => t.token_mint === SOL_MINT)?.percentage || 0;
      const solTargetUsd = (bundleValue * Number(solPercentage)) / 100;
      const solPrice = await this.jupiterService.getTokenPrice(SOL_MINT);
      const solAmount = solPrice > 0 ? Math.min(solTargetUsd / solPrice, solBalanceAmount) : 0;

      // Transfer each token to TipLink wallet
      for (const token of tokensRes.rows) {
        try {
          let tokenAmount = 0;

          if (token.token_mint === SOL_MINT) {
            tokenAmount = solAmount;
          } else {
            // Get amount from swap output
            tokenAmount = swapAmounts.get(token.token_mint) || 0;
          }

          if (tokenAmount === 0) {
            console.warn(`⚠️ No amount available for ${token.token_symbol}, skipping`);
            continue;
          }

          // Store transfer instruction for frontend to execute
          // Frontend will sign and send these transactions
          console.log(`Prepared ${tokenAmount.toFixed(6)} ${token.token_symbol} for TipLink transfer`);
          
          // Store in gift_bundle_links with transfer info
          // The frontend will fetch this and execute transfers
        } catch (error: any) {
          console.error(`❌ Failed to transfer ${token.token_symbol}:`, error);
          throw error;
        }
      }

      // Store TipLink
      const ENCRYPTION_KEY = process.env.TIPLINK_ENCRYPTION_KEY;
      if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
        throw new Error('TIPLINK_ENCRYPTION_KEY not set or too short');
      }
      const encryptedKeypair = encryptTipLink(
        JSON.stringify(Array.from(tiplink.keypair.secretKey)),
        ENCRYPTION_KEY
      );
      const tiplinkPublicKey = tiplink.keypair.publicKey.toBase58();
      
      await client.query(
        `INSERT INTO gift_bundle_links (
          gift_id, bundle_id, tiplink_url, tiplink_keypair_encrypted
        ) VALUES ($1, $2, $3, $4)`,
        [params.giftId, params.bundleId, tiplink.url.toString(), encryptedKeypair]
      );

      // Update gift with TipLink public key
      await client.query(
        `UPDATE gifts SET tiplink_public_key = $1 WHERE id = $2`,
        [tiplinkPublicKey, params.giftId]
      );

      return tiplink.url.toString();
    } finally {
      client.release();
    }
  }
}

