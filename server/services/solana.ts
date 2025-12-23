import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

// This will be set from main.ts
let connection: Connection | null = null;

export function setConnection(conn: Connection) {
  connection = conn;
}

/**
 * Detect token program ID (SPL Token vs Token2022) from mint address
 */
export async function getTokenProgramId(mintAddress: string, conn?: Connection): Promise<PublicKey> {
  const connToUse = conn || connection;
  if (!connToUse) {
    throw new Error('Solana connection not initialized');
  }
  
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await connToUse.getAccountInfo(mintPubkey);
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

export async function transferSOLToTipLink(
  fromPubkey: string,
  toPubkey: PublicKey,
  amountSol: number,
  fromKeypair: Keypair
): Promise<string> {
  if (!connection) {
    throw new Error('Solana connection not initialized');
  }

  const lamports = Math.floor(amountSol * 1e9);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports,
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [fromKeypair]);
  return signature;
}

export async function transferSPLTokenToTipLink(
  fromPubkey: string,
  toPubkey: PublicKey,
  mint: string,
  amount: number,
  decimals: number,
  fromKeypair: Keypair
): Promise<string> {
  if (!connection) {
    throw new Error('Solana connection not initialized');
  }

  const from = new PublicKey(fromPubkey);
  const mintPubkey = new PublicKey(mint);

  // Detect token program ID
  const mintInfo = await connection.getAccountInfo(mintPubkey);
  const tokenProgramId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) 
    ? TOKEN_2022_PROGRAM_ID 
    : TOKEN_PROGRAM_ID;

  const fromAta = await getAssociatedTokenAddress(mintPubkey, from, false, tokenProgramId);
  const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey, true, tokenProgramId);

  const amountRaw = BigInt(Math.floor(amount * 10 ** decimals));

  const ix = createTransferInstruction(
    fromAta,
    toAta,
    from,
    amountRaw,
    [],
    tokenProgramId,
  );

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [fromKeypair]);
  return signature;
}

