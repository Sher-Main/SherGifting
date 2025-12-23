import axios from 'axios';
import { Connection, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import { sendAndConfirmTransaction } from '@solana/web3.js';

const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1';
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v3';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: any[];
}

export class JupiterService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get swap quote from Jupiter API
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: number; // in lamports
    slippageBps?: number; // default 300 = 3%
  }): Promise<JupiterQuote> {
    try {
      const response = await axios.get(`${JUPITER_QUOTE_API}/quote`, {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount.toString(),
          slippageBps: params.slippageBps || 300,
          onlyDirectRoutes: false,
          asLegacyTransaction: false,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Jupiter quote error:', error.response?.data || error.message);
      throw new Error(`Failed to get Jupiter quote: ${error.message}`);
    }
  }

  /**
   * Get swap transaction (unsigned) for user to sign
   * Returns serialized transaction that user must sign and send
   */
  async getSwapTransaction(params: {
    quoteResponse: JupiterQuote;
    userPublicKey: string;
  }): Promise<string> {
    try {
      // Get swap transaction from Jupiter
      const swapResponse = await axios.post(`${JUPITER_SWAP_API}/swap`, {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 'auto',
        asLegacyTransaction: false,
      });

      // Return base64-encoded transaction for frontend to sign
      return swapResponse.data.swapTransaction;
    } catch (error: any) {
      console.error('Jupiter swap error:', error.response?.data || error.message);
      throw new Error(`Failed to get Jupiter swap transaction: ${error.message}`);
    }
  }

  /**
   * Get current token price in USD
   */
  async getTokenPrice(mint: string): Promise<number> {
    try {
      const response = await axios.get(JUPITER_PRICE_API, {
        params: { ids: mint },
      });

      // v3 API response structure: response.data[mint] contains object with usdPrice field
      const priceData = response.data.data?.[mint] || response.data[mint];
      // Jupiter v3 API uses 'usdPrice' field, not 'price'
      const price = priceData?.usdPrice || priceData?.price || 0;
      return price;
    } catch (error: any) {
      console.error('Jupiter price error:', error.response?.data || error.message);
      return 0;
    }
  }
}

