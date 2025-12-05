import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { TipLink } from '@tiplink/api';
import { decryptTipLink } from '../utils/encryption';
import { pool } from '../database';

export class GiftRefundService {
  private connection: Connection;
  private encryptionKey: string;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000,
      disableRetryOnRateLimit: false,
      httpHeaders: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
    });
    this.encryptionKey = process.env.TIPLINK_ENCRYPTION_KEY || '';

    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('TIPLINK_ENCRYPTION_KEY not set or too short in environment variables');
    }
  }

  /**
   * Helper function to detect token program ID from mint address
   */
  private async getTokenProgramId(mintAddress: string): Promise<PublicKey> {
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const mintInfo = await this.connection.getAccountInfo(mintPubkey);
      if (mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        return TOKEN_2022_PROGRAM_ID;
      }
      return TOKEN_PROGRAM_ID;
    } catch (error) {
      // Default to TOKEN_PROGRAM_ID if detection fails
      console.warn(`⚠️ Could not detect token program for ${mintAddress}, defaulting to TOKEN_PROGRAM_ID:`, error);
      return TOKEN_PROGRAM_ID;
    }
  }

  /**
   * Find all expired unclaimed gifts
   */
  async findExpiredGifts(): Promise<any[]> {
    if (!pool) {
      console.error('❌ Database pool not available');
      return [];
    }

    try {
      const result = await pool.query(`
        SELECT 
          g.*, 
          u.wallet_address as sender_wallet, 
          u.email as sender_email,
          u.username as sender_username
        FROM gifts g
        JOIN users u ON g.sender_did = u.privy_did
        WHERE g.status = 'SENT'
          AND g.expires_at < NOW()
          AND (g.auto_refund_attempted = FALSE OR g.auto_refund_attempts < 3)
        ORDER BY g.expires_at ASC
        LIMIT 50
      `);

      console.log(`🔍 Found ${result.rows.length} expired gifts to refund`);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding expired gifts:', error);
      return [];
    }
  }

  /**
   * Process refund for a single gift
   */
  async refundGift(gift: any): Promise<{ success: boolean; signature?: string; error?: string }> {
    const giftId = gift.id;

    try {
      console.log(`💸 Processing refund for gift ${giftId} (${gift.amount} ${gift.token_symbol || 'SOL'})`);
      console.log(`   Recipient: ${gift.recipient_email}`);
      console.log(`   Sender: ${gift.sender_email} (${gift.sender_wallet})`);

      // Mark as attempted to prevent duplicate processing
      if (pool) {
        await pool.query(`
          UPDATE gifts 
          SET auto_refund_attempted = TRUE, 
              auto_refund_attempts = auto_refund_attempts + 1,
              last_refund_attempt = NOW()
          WHERE id = $1
        `, [giftId]);
      }

      // Decrypt TipLink URL
      if (!gift.tiplink_url_encrypted) {
        console.error(`❌ Gift ${giftId} has no encrypted TipLink URL`);
        return { success: false, error: 'No encrypted TipLink URL found' };
      }

      const tiplinkUrl = decryptTipLink(gift.tiplink_url_encrypted, this.encryptionKey);

      // Load TipLink
      const tipLink = await TipLink.fromUrl(new URL(tiplinkUrl));
      const tipLinkPublicKey = tipLink.keypair.publicKey;

      console.log(`   TipLink wallet: ${tipLinkPublicKey.toBase58()}`);

      // Check if SOL or SPL token
      const isNativeSOL = gift.token_mint === 'So11111111111111111111111111111111111111112';

      if (isNativeSOL) {
        // SOL refund
        const balance = await this.connection.getBalance(tipLinkPublicKey);

        if (balance === 0) {
          console.log(`⚠️ Gift ${giftId} TipLink is already empty`);
          
          if (pool) {
            await pool.query(`
              UPDATE gifts 
              SET status = 'EXPIRED_EMPTY', 
                  refunded_at = NOW()
              WHERE id = $1
            `, [giftId]);
          }

          return { success: false, error: 'TipLink already empty' };
        }

        const balanceSOL = balance / LAMPORTS_PER_SOL;
        console.log(`   💰 TipLink balance: ${balanceSOL.toFixed(6)} SOL`);

        // Get sender wallet
        if (!gift.sender_wallet) {
          console.error(`❌ No sender wallet found for gift ${giftId}`);
          return { success: false, error: 'Sender wallet not found' };
        }

        const senderWallet = new PublicKey(gift.sender_wallet);

        // Calculate transfer amount (reserve for fees)
        const FEE_RESERVE = 5000; // 0.000005 SOL
        const transferLamports = Math.floor(balance - FEE_RESERVE);

        if (transferLamports <= 0) {
          console.log(`⚠️ Gift ${giftId} balance too low after fees`);
          
          if (pool) {
            await pool.query(`
              UPDATE gifts 
              SET status = 'EXPIRED_LOW_BALANCE'
              WHERE id = $1
            `, [giftId]);
          }

          return { success: false, error: 'Balance too low after fees' };
        }

        const transferSOL = transferLamports / LAMPORTS_PER_SOL;
        console.log(`   📤 Refunding ${transferSOL.toFixed(6)} SOL to sender ${gift.sender_wallet}`);

        // Create transfer transaction
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: tipLinkPublicKey,
          toPubkey: senderWallet,
          lamports: transferLamports,
        });

        const transaction = new Transaction().add(transferInstruction);

        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = tipLinkPublicKey;

        // Sign with TipLink keypair
        transaction.sign(tipLink.keypair);

        // Send transaction
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [tipLink.keypair],
          { commitment: 'confirmed' }
        );

        console.log(`   ✅ Refund transaction confirmed: ${signature}`);

        // Update database
        if (pool) {
          await pool.query(`
            UPDATE gifts 
            SET status = 'REFUNDED',
                refunded_at = NOW(),
                refund_transaction_signature = $1
            WHERE id = $2
          `, [signature, giftId]);
        }

        console.log(`   ✅ Database updated: status = 'REFUNDED'`);

        // Send notification email
        await this.sendRefundNotificationEmail(gift, signature, transferSOL);

        return { success: true, signature };
      } else {
        // SPL Token refund (supports both SPL Token and Token2022)
        console.log(`💸 Preparing SPL token refund: ${gift.amount} ${gift.token_symbol} to sender...`);

        // ✅ Detect token program ID (SPL Token vs Token2022)
        const tokenProgramId = await this.getTokenProgramId(gift.token_mint);
        const isToken2022 = tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);
        console.log(`🔍 Detected token program: ${isToken2022 ? 'Token2022' : 'SPL Token'} for ${gift.token_symbol}`);

        const mintPubkey = new PublicKey(gift.token_mint);
        const tiplinkATA = await getAssociatedTokenAddress(mintPubkey, tipLinkPublicKey, false, tokenProgramId);
        const senderATA = await getAssociatedTokenAddress(mintPubkey, new PublicKey(gift.sender_wallet), false, tokenProgramId);

        // Check if TipLink has the SPL tokens
        console.log(`🔍 Checking TipLink token account: ${tiplinkATA.toBase58()} [${isToken2022 ? 'Token2022' : 'SPL Token'}]`);
        let tiplinkTokenAccount;
        try {
          // ✅ FIX: Pass tokenProgramId to getAccount for Token2022 compatibility
          tiplinkTokenAccount = await getAccount(this.connection, tiplinkATA, 'confirmed', tokenProgramId);
          const tokenBalance = Number(tiplinkTokenAccount.amount) / (10 ** gift.token_decimals);
          console.log(`💰 TipLink ${gift.token_symbol} balance: ${tokenBalance} ${gift.token_symbol}`);

          if (tokenBalance === 0) {
            console.log(`⚠️ Gift ${giftId} TipLink token account is empty`);
            
            if (pool) {
              await pool.query(`
                UPDATE gifts 
                SET status = 'EXPIRED_EMPTY', 
                    refunded_at = NOW()
                WHERE id = $1
              `, [giftId]);
            }

            return { success: false, error: 'TipLink token account already empty' };
          }

          if (tokenBalance < gift.amount) {
            console.log(`⚠️ Gift ${giftId} has less tokens than expected. Balance: ${tokenBalance}, Expected: ${gift.amount}`);
            // Refund what's available
          }
        } catch (error: any) {
          if (error.name === 'TokenAccountNotFoundError' || error.message?.includes('could not find account')) {
            console.log(`⚠️ Gift ${giftId} TipLink token account not found`);
            
            if (pool) {
              await pool.query(`
                UPDATE gifts 
                SET status = 'EXPIRED_EMPTY', 
                    refunded_at = NOW()
                WHERE id = $1
              `, [giftId]);
            }

            return { success: false, error: 'TipLink token account not found' };
          }
          throw error;
        }

        const instructions = [];

        // Create sender's associated token account if it doesn't exist (using correct program ID)
        const senderAccountInfo = await this.connection.getAccountInfo(senderATA);
        if (!senderAccountInfo) {
          console.log(`📝 Creating sender token account: ${senderATA.toBase58()} [${isToken2022 ? 'Token2022' : 'SPL Token'}]`);
          instructions.push(
            createAssociatedTokenAccountInstruction(
              tipLinkPublicKey,
              senderATA,
              new PublicKey(gift.sender_wallet),
              mintPubkey,
              tokenProgramId
            )
          );
        } else {
          console.log(`✅ Sender token account exists: ${senderATA.toBase58()}`);
        }

        // Calculate transfer amount in token's smallest unit
        const availableBalance = Number(tiplinkTokenAccount.amount);
        const transferAmount = BigInt(Math.min(availableBalance, Math.floor(gift.amount * (10 ** gift.token_decimals))));
        const tokenDecimals = gift.token_decimals;

        console.log(`📊 Transfer details:`, {
          tokenSymbol: gift.token_symbol,
          tokenAmount: gift.amount,
          transferAmountRaw: transferAmount.toString(),
          tiplinkBalance: availableBalance.toString(),
          senderATA: senderATA.toBase58(),
          programId: isToken2022 ? 'Token2022' : 'SPL Token',
          decimals: tokenDecimals
        });

        // Transfer SPL tokens (using correct program ID)
        // ✅ FIX: Use createTransferCheckedInstruction for Token2022 compatibility
        instructions.push(
          createTransferCheckedInstruction(
            tiplinkATA, // source
            mintPubkey, // mint (required for checked transfer)
            senderATA, // destination
            tipLinkPublicKey, // owner
            transferAmount, // amount
            tokenDecimals, // decimals (required for checked transfer)
            [], // multiSigners
            tokenProgramId
          )
        );
        console.log(`✅ Added refund transfer instruction (checked) for ${gift.amount} ${gift.token_symbol}`);

        const transaction = new Transaction().add(...instructions);

        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = tipLinkPublicKey;

        // Sign with TipLink keypair
        transaction.sign(tipLink.keypair);

        // Send transaction
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [tipLink.keypair],
          { commitment: 'confirmed' }
        );

        console.log(`   ✅ Refund transaction confirmed: ${signature}`);

        // Update database
        if (pool) {
          await pool.query(`
            UPDATE gifts 
            SET status = 'REFUNDED',
                refunded_at = NOW(),
                refund_transaction_signature = $1
            WHERE id = $2
          `, [signature, giftId]);
        }

        console.log(`   ✅ Database updated: status = 'REFUNDED'`);

        const refundedAmount = Number(transferAmount) / (10 ** gift.token_decimals);
        await this.sendRefundNotificationEmail(gift, signature, refundedAmount);

        return { success: true, signature };
      }
    } catch (error: any) {
      console.error(`❌ Error refunding gift ${giftId}:`, error);

      // Log the error
      if (pool) {
        await pool.query(`
          UPDATE gifts 
          SET auto_refund_attempts = auto_refund_attempts + 1,
              last_refund_attempt = NOW()
          WHERE id = $1
        `, [giftId]);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification to sender about refund
   */
  async sendRefundNotificationEmail(gift: any, signature: string, amount: number): Promise<void> {
    try {
      // Import email service dynamically to avoid circular dependencies
      const { sendRefundNotificationEmail } = await import('../emailService');
      
      await sendRefundNotificationEmail({
        senderEmail: gift.sender_email,
        senderName: gift.sender_username,
        recipientEmail: gift.recipient_email,
        amount: amount,
        tokenSymbol: gift.token_symbol || 'SOL',
        transactionSignature: signature,
        giftId: gift.id,
        message: gift.message
      });

      console.log(`   ✅ Refund notification sent to ${gift.sender_email}`);
    } catch (error) {
      console.error('❌ Error sending refund notification email:', error);
      // Don't throw - refund was successful even if email fails
    }
  }

  /**
   * Process all expired gifts - called by cron job
   */
  async processAllExpiredGifts(): Promise<{ success: number; failed: number; total: number }> {
    console.log('🔄 Starting expired gifts refund check...');

    const expiredGifts = await this.findExpiredGifts();

    if (expiredGifts.length === 0) {
      console.log('✅ No expired gifts to refund');
      return { success: 0, failed: 0, total: 0 };
    }

    let successCount = 0;
    let failCount = 0;

    // Process gifts sequentially to avoid rate limits
    for (const gift of expiredGifts) {
      const result = await this.refundGift(gift);

      if (result.success) {
        successCount++;
      } else {
        failCount++;
        console.log(`   ⚠️ Failed to refund gift ${gift.id}: ${result.error}`);
      }

      // Small delay between transactions to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
    }

    console.log(`✅ Refund processing complete: ${successCount} successful, ${failCount} failed, ${expiredGifts.length} total`);

    return {
      success: successCount,
      failed: failCount,
      total: expiredGifts.length
    };
  }
}

