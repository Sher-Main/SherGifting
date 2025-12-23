import fetch from 'cross-fetch';

interface PriceData {
  solUSD: number;
  tokenPrices: Map<string, number>; // mint address -> USD price
  timestamp: number;
}

// Cache prices for 30 seconds to reduce API calls
let priceCache: PriceData | null = null;
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Fetch current SOL price and token prices from Jupiter Price API
 */
export async function fetchCurrentPrices(tokenMints: string[]): Promise<PriceData> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL) {
    return priceCache;
  }

  try {
    // Jupiter Price API V3
    const mints = ['So11111111111111111111111111111111111111112', ...tokenMints].join(',');
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints}`);
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const data = await response.json();

    const prices = new Map<string, number>();
    
    // Extract prices from Jupiter v3 API response structure
    // Response format: { data: { [mint]: { price: number, usdPrice: number } } }
    const priceData = data.data || data; // Support both formats
    Object.entries(priceData).forEach(([mint, priceInfo]: [string, any]) => {
      // Use usdPrice if available, otherwise fall back to price
      const price = priceInfo?.usdPrice || priceInfo?.price || 0;
      if (price > 0) {
        prices.set(mint, price);
      }
    });

    const solPrice = prices.get('So11111111111111111111111111111111111111112') || 180;

    const priceDataResult: PriceData = {
      solUSD: solPrice,
      tokenPrices: prices,
      timestamp: Date.now()
    };

    // Update cache
    priceCache = priceDataResult;

    return priceDataResult;
  } catch (error) {
    console.error('Error fetching prices:', error);
    
    // Fallback to cached or default prices
    if (priceCache) {
      console.warn('Using cached prices due to fetch error');
      return priceCache;
    }
    
    // Ultimate fallback
    console.warn('Using fallback prices (SOL = $180)');
    return {
      solUSD: 180,
      tokenPrices: new Map(),
      timestamp: Date.now()
    };
  }
}

/**
 * Get SOL price in USD
 */
export async function getSOLPrice(): Promise<number> {
  const prices = await fetchCurrentPrices([]);
  return prices.solUSD;
}

/**
 * Get token price by mint address
 */
export async function getTokenPrice(mint: string): Promise<number> {
  const prices = await fetchCurrentPrices([mint]);
  return prices.tokenPrices.get(mint) || 0;
}

