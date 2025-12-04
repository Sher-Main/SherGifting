
export interface User {
  id?: number;
  privy_did: string;
  wallet_address: string;
  email: string;
  username?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface UsernameCheckResponse {
  available: boolean;
  username: string;
  error?: string;
}

export interface SetUsernameResponse {
  success: boolean;
  user: User;
  error?: string;
}

export interface ResolveRecipientResponse {
  email: string;
  wallet_address: string;
  username?: string | null;
  privy_did: string;
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
  verified?: boolean;      // Jupiter verification status
  tags?: string[];         // Token tags from Jupiter
  programId?: string;      // Token program ID ('spl' or 'token2022')
}

export enum GiftStatus {
  SENT = 'SENT',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
  EXPIRED_EMPTY = 'EXPIRED_EMPTY',
  EXPIRED_LOW_BALANCE = 'EXPIRED_LOW_BALANCE',
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
  usd_value?: number | null;  // USD value at time of gift creation
  message: string;
  status: GiftStatus;
  tiplink_url: string;
  tiplink_public_key: string;
  transaction_signature: string;
  created_at: string;
  claimed_at?: string | null;
  claimed_by?: string | null;
  claim_signature?: string | null;
  expires_at?: string;  // 24 hours from creation
  refunded_at?: string | null;  // when refund was processed
  refund_transaction_signature?: string | null;  // Solana transaction signature
  auto_refund_attempted?: boolean;  // prevent duplicate processing
  auto_refund_attempts?: number;  // track retry attempts
  last_refund_attempt?: string | null;  // last attempt timestamp
  has_greeting_card?: boolean;  // whether a greeting card was included
  card_type?: string | null;  // 'thanksgiving', 'newyear', 'christmas', 'birthday'
  card_cloudinary_url?: string | null;  // Generated personalized card URL
  card_recipient_name?: string | null;  // Name used for card personalization
  card_price_usd?: number;  // Price of the greeting card (default 0.50)
}

export interface GiftInfo {
  amount: number;
  token_symbol: string;
  sender_email: string;
  recipient_email?: string; // Added for email verification
  message?: string;
  status: GiftStatus;
  created_at: string;
  locked_until?: string | null; // Timestamp when lock expires
  minutes_remaining?: number | null; // Minutes remaining until unlock
}
