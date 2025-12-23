import express from 'express';
import { BundleService } from '../services/bundleService';
import { authenticateToken, AuthRequest } from '../authMiddleware';
import { pool, getUserByPrivyDid } from '../database';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * GET /api/bundles/:id/fees
 * Get detailed fee breakdown for a bundle
 */
router.get('/:id/fees', async (req, res) => {
  try {
    const { id } = req.params;
    const includeCard = req.query.includeCard === 'true';
    const paymentMethod = (req.query.paymentMethod as 'wallet' | 'moonpay') || 'moonpay';

    // Get connection from global (set in main.ts)
    const connection = (global as any).solanaConnection;
    if (!connection) {
      return res.status(500).json({ success: false, error: 'Solana connection not initialized' });
    }

    const { FeeCalculator } = await import('../services/feeCalculator');
    const calculator = new FeeCalculator(pool!, connection);
    const fees = await calculator.calculateBundleFees(id, includeCard, paymentMethod);

    res.json({ success: true, ...fees });
  } catch (e: any) {
    console.error('Error calculating fees:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to calculate fees' });
  }
});

/**
 * POST /api/bundles/:id/create-wallet
 * Create gift from wallet payment (user has sufficient balance)
 */
router.post('/:id/create-wallet', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { id: bundleId } = req.params;
    const { recipientEmail, customMessage, includeCard, walletAddress } = req.body;
    const privyUser = req.user;
    const privyUserId = req.userId || privyUser?.id;

    if (!privyUser || !privyUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!bundleId || !recipientEmail || !walletAddress) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get user from database
    let dbUser = null;
    let privyDid = privyUserId;
    if (!privyUserId.startsWith('did:privy:')) {
      privyDid = `did:privy:${privyUserId}`;
    }
    dbUser = await getUserByPrivyDid(privyDid);
    if (!dbUser && privyDid.startsWith('did:privy:')) {
      const altPrivyDid = privyDid.replace('did:privy:', '');
      dbUser = await getUserByPrivyDid(altPrivyDid);
      if (dbUser) {
        privyDid = dbUser.privy_did;
      }
    }
    if (!dbUser) {
      privyDid = privyUserId.startsWith('did:privy:') ? privyUserId : `did:privy:${privyUserId}`;
    } else {
      privyDid = dbUser.privy_did;
    }

    const senderEmail = dbUser?.email || privyUser.email?.address || privyUser.linkedAccounts?.find((acc: any) => acc.type === 'email')?.address || null;
    if (!senderEmail) {
      return res.status(400).json({ success: false, error: 'User email not found' });
    }

    // Get connection
    const connection = (global as any).solanaConnection;
    if (!connection) {
      throw new Error('Solana connection not initialized');
    }

    const { BundleOrchestrator } = await import('../services/bundleOrchestrator');
    const orchestrator = new BundleOrchestrator(pool!, connection);

    // Calculate fees
    const { FeeCalculator } = await import('../services/feeCalculator');
    const feeCalculator = new FeeCalculator(pool!, connection);
    const fees = await feeCalculator.calculateBundleFees(bundleId, includeCard, 'wallet');

    // Create gift record
    const giftId = uuidv4();
    await client.query(
      `INSERT INTO gifts (
        id, sender_did, sender_email, recipient_email, bundle_id,
        token_mint, token_symbol, token_decimals, amount, usd_value,
        message, status, tiplink_url, tiplink_public_key, transaction_signature,
        total_onramp_amount, swap_status, onramp_status, payment_method, fee_breakdown,
        expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())`,
      [
        giftId,
        privyDid,
        senderEmail,
        recipientEmail,
        bundleId,
        'So11111111111111111111111111111111111111112',
        'BUNDLE',
        9,
        0,
        fees.baseValue,
        customMessage || null,
        'pending_payment',
        'pending',
        'pending',
        'pending',
        fees.totalCost,
        'pending',
        'completed', // Wallet payment doesn't need onramp
        'wallet',
        JSON.stringify(fees),
        new Date(Date.now() + 48 * 60 * 60 * 1000),
      ]
    );

    // Check wallet balance and determine if swaps are needed
    const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    const pubkey = new PublicKey(walletAddress);
    const solBalance = await connection.getBalance(pubkey) / LAMPORTS_PER_SOL;

    // Get bundle tokens to check what user has
    const bundleRes = await client.query(
      `SELECT bt.token_mint, bt.token_symbol, bt.percentage
       FROM bundle_tokens bt
       WHERE bt.bundle_id = $1
       ORDER BY bt.display_order`,
      [bundleId]
    );

    const bundleValue = fees.baseValue;
    const solPrice = await orchestrator['jupiterService'].getTokenPrice('So11111111111111111111111111111111111111112');

    // Check if user has all tokens or needs swaps
    let needsSwaps = false;
    for (const token of bundleRes.rows) {
      if (token.token_mint === 'So11111111111111111111111111111111111111112') continue;
      
      try {
        const { getAccount, getAssociatedTokenAddress } = await import('@solana/spl-token');
        const mint = new PublicKey(token.token_mint);
        const ata = await getAssociatedTokenAddress(mint, pubkey);
        const tokenAccount = await getAccount(connection, ata);
        const tokenUsdValue = (bundleValue * Number(token.percentage)) / 100;
        const tokenPrice = await orchestrator['jupiterService'].getTokenPrice(token.token_mint);
        const requiredAmount = tokenPrice > 0 ? tokenUsdValue / tokenPrice : 0;
        const { getMint } = await import('@solana/spl-token');
        const mintInfo = await getMint(connection, mint);
        const balanceAmount = Number(tokenAccount.amount) / Math.pow(10, mintInfo.decimals);
        
        if (balanceAmount < requiredAmount) {
          needsSwaps = true;
          break;
        }
      } catch {
        // Token account doesn't exist, needs swap
        needsSwaps = true;
        break;
      }
    }

    // Execute swaps if needed
    if (needsSwaps) {
      await orchestrator.executeSwaps({
        giftId,
        bundleId,
        userWalletAddress: walletAddress,
        availableSol: solBalance,
      });
    } else {
      // User has all tokens, skip swaps
      await client.query(
        `UPDATE gifts SET swap_status = 'completed' WHERE id = $1`,
        [giftId]
      );
    }

    // Create TipLinks for all tokens
    await orchestrator.createBundleTipLinks({
      giftId,
      bundleId,
      userWalletAddress: walletAddress,
    });

    res.json({
      success: true,
      giftId,
      needsSwaps,
      message: needsSwaps ? 'Swaps prepared, please sign transactions' : 'TipLinks created, ready to send',
    });
  } catch (error: any) {
    console.error('Error creating wallet payment gift:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/bundles/initiate
 * Create gift record and return onramp amount breakdown
 */
router.post('/initiate', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { bundleId, recipientEmail, customMessage, includeCard } = req.body;
    const privyUser = req.user;
    const privyUserId = req.userId || privyUser?.id;

    if (!privyUser || !privyUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!bundleId || !recipientEmail) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get user from database to get privy_did and email
    // Try to find user by Privy ID (might be in format "did:privy:..." or "clxxxxx")
    let dbUser = null;
    let privyDid = privyUserId;
    
    // Normalize Privy ID format
    if (!privyUserId.startsWith('did:privy:')) {
      privyDid = `did:privy:${privyUserId}`;
    }
    
    // Try to find user in database
    dbUser = await getUserByPrivyDid(privyDid);
    
    // If not found, try without did:privy: prefix
    if (!dbUser && privyDid.startsWith('did:privy:')) {
      const altPrivyDid = privyDid.replace('did:privy:', '');
      dbUser = await getUserByPrivyDid(altPrivyDid);
      if (dbUser) {
        privyDid = dbUser.privy_did;
      }
    }
    
    // If still not found, use the Privy ID directly
    if (!dbUser) {
      privyDid = privyUserId.startsWith('did:privy:') ? privyUserId : `did:privy:${privyUserId}`;
    } else {
      privyDid = dbUser.privy_did;
    }

    // Get email from database user or Privy user object
    const senderEmail = dbUser?.email || privyUser.email?.address || privyUser.linkedAccounts?.find((acc: any) => acc.type === 'email')?.address || null;
    
    if (!senderEmail) {
      return res.status(400).json({ success: false, error: 'User email not found' });
    }

    // Import orchestrator dynamically (will be initialized in main.ts)
    const { BundleOrchestrator } = await import('../services/bundleOrchestrator');
    
    // Get connection from global (set in main.ts)
    const connection = (global as any).solanaConnection;
    
    if (!connection) {
      throw new Error('Solana connection not initialized');
    }

    const orchestrator = new BundleOrchestrator(pool!, connection);

    // Calculate onramp amount
    const costs = await orchestrator.calculateOnrampAmount(bundleId, includeCard);
    const totalOnramp = costs.total;

    // Get bundle total USD value for the gift record
    const bundleRes = await client.query(
      `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
      [bundleId]
    );
    const bundleTotalUsdValue = bundleRes.rows[0]?.total_usd_value || costs.baseAmount;

    // Create gift record
    // Note: For bundle gifts, we use placeholder values for token_mint, token_symbol, etc.
    // The actual tokens are stored in jupiter_swaps and gift_bundle_links tables
    // TipLink fields are placeholders and will be updated when TipLink is created
    const giftId = uuidv4();
    await client.query(
      `INSERT INTO gifts (
        id, sender_did, sender_email, recipient_email, bundle_id,
        token_mint, token_symbol, token_decimals, amount, usd_value,
        message, status, tiplink_url, tiplink_public_key, transaction_signature,
        total_onramp_amount, swap_status, onramp_status,
        expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())`,
      [
        giftId,
        privyDid,
        senderEmail,
        recipientEmail,
        bundleId,
        'So11111111111111111111111111111111111111112', // SOL as placeholder
        'BUNDLE', // Bundle indicator
        9, // SOL decimals
        0, // Amount is 0 for bundles (tokens stored separately)
        bundleTotalUsdValue, // Total bundle USD value
        customMessage || null,
        'pending_payment',
        'pending', // Placeholder tiplink_url (will be updated when TipLink is created)
        'pending', // Placeholder tiplink_public_key (will be updated when TipLink is created)
        'pending', // Placeholder transaction_signature (will be updated when swaps complete)
        totalOnramp,
        'pending',
        'pending',
        new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      ]
    );

    res.json({
      success: true,
      giftId,
      onrampAmount: totalOnramp,
      breakdown: costs,
    });
  } catch (error: any) {
    console.error('Error initiating bundle gift:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/bundles/poll/:giftId
 * Check gift status (onramp_status, swap_status)
 */
router.get('/poll/:giftId', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId } = req.params;
    const privyUser = req.user;
    const privyUserId = req.userId || privyUser?.id;

    if (!privyUser || !privyUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Normalize Privy ID format
    let privyDid = privyUserId;
    if (!privyUserId.startsWith('did:privy:')) {
      privyDid = `did:privy:${privyUserId}`;
    }

    const giftRes = await client.query(
      `SELECT onramp_status, swap_status, status, bundle_id FROM gifts WHERE id = $1 AND sender_did = $2`,
      [giftId, privyDid]
    );

    if (!giftRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Gift not found' });
    }

    const gift = giftRes.rows[0];

    res.json({
      success: true,
      onrampStatus: gift.onramp_status,
      swapStatus: gift.swap_status,
      status: gift.status,
      message: getStatusMessage(gift.onramp_status, gift.swap_status, gift.status),
    });
  } catch (error: any) {
    console.error('Polling error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/bundles/:giftId/swaps
 * Get pending swap transactions for user to sign
 */
router.get('/:giftId/swaps', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get pending swap transactions
    const swapsRes = await client.query(
      `SELECT id, input_mint, output_mint, input_amount, output_amount, transaction_signature, status
       FROM jupiter_swaps
       WHERE gift_id = $1 AND status = 'pending_signature'
       ORDER BY created_at`,
      [giftId]
    );

    res.json({
      success: true,
      swaps: swapsRes.rows.map((swap: any) => ({
        id: swap.id,
        inputMint: swap.input_mint,
        outputMint: swap.output_mint,
        inputAmount: Number(swap.input_amount),
        outputAmount: Number(swap.output_amount),
        transaction: swap.transaction_signature, // Base64 encoded transaction
      })),
    });
  } catch (error: any) {
    console.error('Error fetching swaps:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/bundles/:giftId/swaps/:swapId/confirm
 * Confirm swap transaction was signed and sent by user
 */
router.post('/:giftId/swaps/:swapId/confirm', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId, swapId } = req.params;
    const { signature } = req.body;
    const user = req.user;

    if (!user || !signature) {
      return res.status(400).json({ success: false, error: 'Missing signature' });
    }

    // Update swap with signature
    await client.query(
      `UPDATE jupiter_swaps 
       SET transaction_signature = $1, status = 'completed'
       WHERE id = $2 AND gift_id = $3`,
      [signature, swapId, giftId]
    );

    // Check if all swaps are complete
    const pendingRes = await client.query(
      `SELECT COUNT(*) as count FROM jupiter_swaps 
       WHERE gift_id = $1 AND status = 'pending_signature'`,
      [giftId]
    );

    if (Number(pendingRes.rows[0].count) === 0) {
      // All swaps complete, update gift status
      await client.query(
        `UPDATE gifts SET swap_status = 'completed' WHERE id = $1`,
        [giftId]
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error confirming swap:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/bundles/execute-swaps
 * Trigger swap orchestration after SOL detected
 */
router.post('/execute-swaps', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId } = req.body;
    const privyUser = req.user;
    const privyUserId = req.userId || privyUser?.id;

    if (!privyUser || !privyUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Normalize Privy ID format
    let privyDid = privyUserId;
    if (!privyUserId.startsWith('did:privy:')) {
      privyDid = `did:privy:${privyUserId}`;
    }

    // Get gift details
    const giftRes = await client.query(
      `SELECT bundle_id, sender_did, recipient_email, custom_message, include_card FROM gifts WHERE id = $1 AND sender_did = $2`,
      [giftId, privyDid]
    );

    if (!giftRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Gift not found' });
    }

    const gift = giftRes.rows[0];
    const { bundle_id, recipient_email, custom_message, include_card } = gift;

    // Get user wallet address
    const userRes = await client.query(
      `SELECT wallet_address FROM users WHERE privy_did = $1`,
      [privyDid]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ success: false, error: 'User wallet not found' });
    }

    const userWalletAddress = userRes.rows[0].wallet_address;

    // Update status
    await client.query(
      `UPDATE gifts SET onramp_status = 'completed', swap_status = 'processing' WHERE id = $1`,
      [giftId]
    );

    // Import orchestrator
    const { BundleOrchestrator } = await import('../services/bundleOrchestrator');
    
    // Get connection from global (set in main.ts)
    const connection = (global as any).solanaConnection;
    
    if (!connection) {
      throw new Error('Solana connection not initialized');
    }

    const orchestrator = new BundleOrchestrator(pool!, connection);

    // Get wallet balance
    const { PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    const balance = await connection.getBalance(new PublicKey(userWalletAddress));
    const availableSol = balance / LAMPORTS_PER_SOL;

    // Prepare swaps (async, don't wait)
    // Swaps will be signed and executed by frontend
    orchestrator
      .executeSwaps({
        giftId,
        bundleId: bundle_id,
        userWalletAddress,
        availableSol,
      })
      .then(async () => {
        // After swaps are prepared, create TipLinks (multiple, one per token)
        const tiplinks = await orchestrator.createBundleTipLinks({
          giftId,
          bundleId: bundle_id,
          userWalletAddress,
        });

        // Update gift status (TipLinks are stored in gift_tiplinks table)
        await client.query(
          `UPDATE gifts SET swap_status = 'pending_signature', tiplink_url = $1 WHERE id = $2`,
          [tiplinks.length > 0 ? tiplinks[0].tiplinkUrl : 'pending', giftId]
        );
      })
      .catch((error) => {
        console.error('Swap preparation error:', error);
        client.query(`UPDATE gifts SET swap_status = 'failed' WHERE id = $1`, [giftId]);
      });

    res.json({ success: true, message: 'Swaps initiated' });
  } catch (error: any) {
    console.error('Swap execution error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/bundles/:giftId/tiplink
 * Get TipLink details and transfer instructions for frontend to execute
 */
router.get('/:giftId/tiplink', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get TipLink details and public key from gift
    const linkRes = await client.query(
      `SELECT gbl.tiplink_url, gbl.bundle_id, g.tiplink_public_key 
       FROM gift_bundle_links gbl
       JOIN gifts g ON gbl.gift_id = g.id
       WHERE gbl.gift_id = $1`,
      [giftId]
    );

    if (!linkRes.rows.length) {
      return res.status(404).json({ success: false, error: 'TipLink not found' });
    }

    const { tiplink_url, bundle_id, tiplink_public_key } = linkRes.rows[0];

    // Get bundle tokens and amounts
    const bundleRes = await client.query(
      `SELECT total_usd_value FROM gift_bundles WHERE id = $1`,
      [bundle_id]
    );
    const bundleValue = Number(bundleRes.rows[0]?.total_usd_value || 0);

    const tokensRes = await client.query(
      `SELECT bt.token_mint, bt.token_symbol, bt.percentage
       FROM bundle_tokens bt
       WHERE bt.bundle_id = $1
       ORDER BY bt.display_order`,
      [bundle_id]
    );

    // Get actual swap amounts
    const swapsRes = await client.query(
      `SELECT output_mint, output_amount FROM jupiter_swaps 
       WHERE gift_id = $1 AND status = 'completed'`,
      [giftId]
    );

    const swapAmounts = new Map<string, number>();
    for (const swap of swapsRes.rows) {
      swapAmounts.set(swap.output_mint, Number(swap.output_amount));
    }

    // Calculate transfer amounts
    const transfers = tokensRes.rows.map((token: any) => {
      let amount = 0;
      if (token.token_mint === 'So11111111111111111111111111111111111111112') {
        // SOL - calculate from percentage (frontend will use actual balance)
        const solPercentage = Number(token.percentage);
        const solUsdValue = (bundleValue * solPercentage) / 100;
        amount = solUsdValue; // USD value, frontend will convert
      } else {
        amount = swapAmounts.get(token.token_mint) || 0;
      }

      return {
        mint: token.token_mint,
        symbol: token.token_symbol,
        amount,
        percentage: Number(token.percentage),
      };
    });

    res.json({
      success: true,
      tiplinkUrl: tiplink_url,
      tiplinkPublicKey: tiplink_public_key,
      transfers,
    });
  } catch (error: any) {
    console.error('Error fetching TipLink:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/bundles/:giftId/complete
 * Mark gift as sent and send email after TipLink is funded
 */
router.post('/:giftId/complete', authenticateToken, async (req: AuthRequest, res) => {
  const client = await pool!.connect();
  try {
    const { giftId } = req.params;
    const privyUser = req.user;
    const privyUserId = req.userId || privyUser?.id;

    if (!privyUser || !privyUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Normalize Privy ID format
    let privyDid = privyUserId;
    if (!privyUserId.startsWith('did:privy:')) {
      privyDid = `did:privy:${privyUserId}`;
    }

    // Get gift details
    const giftRes = await client.query(
      `SELECT bundle_id, recipient_email, custom_message, include_card, sender_email 
       FROM gifts WHERE id = $1 AND sender_did = $2`,
      [giftId, privyDid]
    );

    if (!giftRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Gift not found' });
    }

    const gift = giftRes.rows[0];
    const { bundle_id, recipient_email, custom_message, include_card, sender_email } = gift;

    // Get TipLinks from gift_tiplinks table
    const tiplinksRes = await client.query(
      `SELECT token_mint, token_symbol, tiplink_url, token_amount 
       FROM gift_tiplinks WHERE gift_id = $1 ORDER BY created_at`,
      [giftId]
    );

    if (!tiplinksRes.rows.length) {
      return res.status(404).json({ success: false, error: 'TipLinks not found' });
    }

    // Use first TipLink URL for email (backward compatibility)
    const tiplinkUrl = tiplinksRes.rows[0].tiplink_url;

    // Get bundle details
    const bundleRes = await client.query(
      `SELECT name, total_usd_value FROM gift_bundles WHERE id = $1`,
      [bundle_id]
    );
    const bundleName = bundleRes.rows[0]?.name || 'Bundle';
    const totalUsdValue = Number(bundleRes.rows[0]?.total_usd_value || 0);

    // Get token breakdown
    const tokensRes = await client.query(
      `SELECT token_mint, token_symbol, percentage FROM bundle_tokens WHERE bundle_id = $1 ORDER BY display_order`,
      [bundle_id]
    );

    // Get prices for all tokens
    const { JupiterService } = await import('../services/jupiterService');
    const connection = (global as any).solanaConnection;
    if (!connection) {
      throw new Error('Solana connection not initialized');
    }
    const jupiterService = new JupiterService(connection);

    const tokens = await Promise.all(
      tokensRes.rows.map(async (t: any) => {
        const percentage = Number(t.percentage);
        const usdValue = (totalUsdValue * percentage) / 100;
        const currentPrice = await jupiterService.getTokenPrice(t.token_mint);
        const tokenAmount = currentPrice > 0 ? usdValue / currentPrice : 0;

        return {
          symbol: t.token_symbol,
          mint: t.token_mint,
          percentage,
          usdValue,
          tokenAmount,
          currentPrice,
        };
      })
    );

    // Update gift status
    await client.query(
      `UPDATE gifts SET status = 'SENT', swap_status = 'completed' WHERE id = $1`,
      [giftId]
    );

    // Send email
    const { sendBundleGiftEmail } = await import('../emailService');
    await sendBundleGiftEmail({
      recipientEmail: recipient_email,
      senderEmail: sender_email,
      bundleName,
      totalUsdValue,
      customMessage: custom_message || undefined,
      includeCard: include_card || false,
      tokens,
      tiplinkUrl,
      giftId,
    });

    res.json({ success: true, message: 'Gift completed and email sent' });
  } catch (error: any) {
    console.error('Error completing gift:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

function getStatusMessage(
  onrampStatus: string,
  swapStatus: string,
  giftStatus: string
): string {
  if (giftStatus === 'SENT') {
    return 'Gift sent successfully!';
  }
  if (swapStatus === 'processing') {
    return 'Converting SOL to bundle tokens...';
  }
  if (swapStatus === 'completed') {
    return 'Packaging your gift...';
  }
  if (onrampStatus === 'completed') {
    return 'Payment received! Processing swaps...';
  }
  if (onrampStatus === 'pending') {
    return 'Waiting for payment confirmation...';
  }
  return 'Processing...';
}

export default router;

