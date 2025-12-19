import { pool } from '../database';
import { Bundle, BundleToken, BundleCalculation, BundleTokenAmount } from '../models/Bundle';

export class BundleService {
  async getActiveBundles(): Promise<Bundle[]> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    const client = await pool.connect();
    try {
      const bundlesRes = await client.query(
        `SELECT id, name, description, total_usd_value, display_order,
                is_active, badge_text, badge_color, created_at, updated_at
         FROM gift_bundles
         WHERE is_active = TRUE
         ORDER BY display_order ASC`
      );

      const bundles: Bundle[] = [];

      for (const row of bundlesRes.rows) {
        const tokensRes = await client.query(
          `SELECT id, bundle_id, token_mint, token_symbol, percentage, display_order
           FROM bundle_tokens
           WHERE bundle_id = $1
           ORDER BY display_order ASC`,
          [row.id],
        );

        bundles.push({
          id: row.id,
          name: row.name,
          description: row.description,
          totalUsdValue: Number(row.total_usd_value),
          displayOrder: row.display_order,
          isActive: row.is_active,
          badgeText: row.badge_text,
          badgeColor: row.badge_color,
          tokens: tokensRes.rows.map((t: any): BundleToken => ({
            id: t.id,
            bundleId: t.bundle_id,
            tokenMint: t.token_mint,
            tokenSymbol: t.token_symbol,
            percentage: Number(t.percentage),
            displayOrder: t.display_order,
          })),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }

      return bundles;
    } finally {
      client.release();
    }
  }

  async calculateBundleTokenAmounts(bundleId: string): Promise<BundleCalculation> {
    if (!pool) {
      throw new Error('Database not configured');
    }

    const client = await pool.connect();
    try {
      const bundleRes = await client.query(
        `SELECT name, total_usd_value FROM gift_bundles WHERE id = $1`,
        [bundleId],
      );
      if (!bundleRes.rows.length) throw new Error('Bundle not found');

      const bundleRow = bundleRes.rows[0];
      const totalUsdValue = Number(bundleRow.total_usd_value);

      const tokensRes = await client.query(
        `SELECT token_mint, token_symbol, percentage
         FROM bundle_tokens
         WHERE bundle_id = $1
         ORDER BY display_order ASC`,
        [bundleId],
      );

      const mints = tokensRes.rows.map((t: any) => t.token_mint);
      
      // Fetch prices from Jupiter using the same approach as main.ts
      // Use the search API which includes price in the response
      const priceMap = new Map<string, number>();
      
      for (const mint of mints) {
        try {
          const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const result = await response.json();
            if (Array.isArray(result) && result.length > 0) {
              const token = result.find((t: any) => 
                (t.id === mint || t.address === mint)
              ) || result[0];
              
              const priceValue = token.usdPrice;
              const price = (typeof priceValue === 'number') ? priceValue : 0;
              if (price > 0) {
                priceMap.set(mint, price);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch price for ${mint}:`, error);
        }
      }

      const tokens: BundleTokenAmount[] = tokensRes.rows.map((t: any) => {
        const percentage = Number(t.percentage);
        const usdValue = (totalUsdValue * percentage) / 100;
        const currentPrice = priceMap.get(t.token_mint) ?? 0;
        const tokenAmount = currentPrice > 0 ? usdValue / currentPrice : 0;

        return {
          symbol: t.token_symbol,
          mint: t.token_mint,
          percentage,
          usdValue,
          tokenAmount,
          currentPrice,
        };
      });

      return {
        bundleName: bundleRow.name,
        totalUsdValue,
        tokens,
      };
    } finally {
      client.release();
    }
  }
}

