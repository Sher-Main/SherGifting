-- Migration: Add Bundle Onramp System
-- Creates tables for tracking onramp transactions and Jupiter swaps

-- Create moonpay_transactions table (tracks Privy onramp transactions)
CREATE TABLE IF NOT EXISTS moonpay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id VARCHAR(255) REFERENCES gifts(id) ON DELETE CASCADE,
  privy_transaction_id VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  amount_usd NUMERIC(10, 2),
  amount_sol NUMERIC(16, 9),
  user_wallet_address VARCHAR(44),
  detected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moonpay_transactions_gift ON moonpay_transactions(gift_id);
CREATE INDEX IF NOT EXISTS idx_moonpay_transactions_status ON moonpay_transactions(status);
CREATE INDEX IF NOT EXISTS idx_moonpay_transactions_wallet ON moonpay_transactions(user_wallet_address);

-- Create jupiter_swaps table
CREATE TABLE IF NOT EXISTS jupiter_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id VARCHAR(255) REFERENCES gifts(id) ON DELETE CASCADE,
  input_mint VARCHAR(44) NOT NULL,
  output_mint VARCHAR(44) NOT NULL,
  input_amount NUMERIC(20, 9),
  output_amount NUMERIC(20, 9),
  transaction_signature VARCHAR(88),
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jupiter_swaps_gift ON jupiter_swaps(gift_id);
CREATE INDEX IF NOT EXISTS idx_jupiter_swaps_status ON jupiter_swaps(status);

-- Update gifts table with bundle onramp fields
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS total_onramp_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS swap_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onramp_status VARCHAR(50) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_gifts_onramp_status ON gifts(onramp_status);
CREATE INDEX IF NOT EXISTS idx_gifts_swap_status ON gifts(swap_status);

