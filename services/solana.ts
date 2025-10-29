import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ✅ Use devnet RPC endpoint
const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

export const connection = new Connection(DEVNET_RPC_URL, 'confirmed');

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
