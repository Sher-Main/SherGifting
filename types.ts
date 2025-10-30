
export interface User {
  privy_did: string;
  wallet_address: string;
  email: string;
  balance: number; // Treasury balance for gifting
}

export interface Token {
  mint: string; // Token mint address
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
}

export interface TokenBalance extends Token {
  balance: number;
  usdValue?: number;
  logoURI?: string;
}

export enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
}

export interface Gift {
  id: string;
  sender_did: string;
  sender_email: string;
  recipient_email: string;
  token_mint: string;
  token_symbol: string;
  token_decimals: number;
  amount: number;
  message: string;
  status: GiftStatus;
  tiplink_url: string;
  tiplink_public_key: string;
  transaction_signature: string;
  created_at: string;
  claimed_at?: string | null;
  claimed_by?: string | null;
  claim_signature?: string | null;
}

export interface GiftInfo {
  amount: number;
  token_symbol: string;
  sender_email: string;
  message?: string;
  status: GiftStatus;
  created_at: string;
}
