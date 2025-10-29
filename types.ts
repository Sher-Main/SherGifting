
export interface User {
  privy_did: string;
  wallet_address: string;
  email: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
}

export interface TokenBalance extends Token {
  balance: number;
  usdValue: number;
}

export enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
}

export interface Gift {
  id: string;
  recipient_email: string;
  token_address: string;
  token_symbol: string;
  amount: number;
  message: string;
  status: GiftStatus;
  tiplink_url: string;
  created_at: string;
  claimed_at?: string | null;
}
