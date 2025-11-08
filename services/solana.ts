import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ✅ Use Helius mainnet RPC endpoint (or fallback to public mainnet)
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;
const RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet.solana.com';

export const connection = new Connection(RPC_URL, 'confirmed');

export async function createTransferToTipLinkTransaction(
  fromPublicKey: PublicKey,
  toPublicKey: PublicKey,
  amountInSol: number
): Promise<Transaction> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromPublicKey,
      toPubkey: toPublicKey,
      lamports: amountInSol * LAMPORTS_PER_SOL,
    })
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPublicKey;

  return transaction;
}

export async function getTipLinkBalance(tiplinkPublicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(tiplinkPublicKey);
  return balance / LAMPORTS_PER_SOL;
}
