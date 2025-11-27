-- Migration: Add MoonPay Onramp System
-- Creates tables for tracking onramp transactions, credits, and card transactions

-- Table: onramp_transactions
-- Tracks each time a user purchases crypto via MoonPay
CREATE TABLE IF NOT EXISTS onramp_transactions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  moonpay_id VARCHAR(255) UNIQUE,
  moonpay_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  moonpay_fee_charged DECIMAL(10, 2) DEFAULT 5.0,
  amount_fiat DECIMAL(20, 2) NOT NULL,
  amount_crypto DECIMAL(20, 9),
  currency VARCHAR(10) DEFAULT 'USD',
  crypto_asset VARCHAR(10) DEFAULT 'SOL',
  credit_issued BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  expires_at TIMESTAMP
);

-- Indexes for onramp_transactions
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_user_id ON onramp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_moonpay_id ON onramp_transactions(moonpay_id);
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_wallet_address ON onramp_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_created_at ON onramp_transactions(created_at);

-- Table: onramp_credits
-- Tracks the $5 credit issued to users who onramp
-- One record per user (upserted when they onramp)
CREATE TABLE IF NOT EXISTS onramp_credits (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,
  total_credits_issued DECIMAL(10, 2) DEFAULT 5.0,
  credits_remaining DECIMAL(10, 2) DEFAULT 5.0,
  card_adds_free_used INTEGER DEFAULT 0,
  card_adds_allowed INTEGER DEFAULT 5,
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  onramp_transaction_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for onramp_credits
CREATE INDEX IF NOT EXISTS idx_onramp_credits_user_id ON onramp_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_onramp_credits_expires_at ON onramp_credits(expires_at);
CREATE INDEX IF NOT EXISTS idx_onramp_credits_is_active ON onramp_credits(is_active);

-- Table: card_transactions
-- Tracks each card transfer (gift) a user sends
-- Logs whether it was free (used credit) or paid ($1)
CREATE TABLE IF NOT EXISTS card_transactions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_address_added VARCHAR(255),
  amount_charged DECIMAL(10, 2) DEFAULT 1.0,
  is_free BOOLEAN DEFAULT FALSE,
  onramp_credit_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for card_transactions
CREATE INDEX IF NOT EXISTS idx_card_transactions_user_id ON card_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_onramp_credit_id ON card_transactions(onramp_credit_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_is_free ON card_transactions(is_free);
CREATE INDEX IF NOT EXISTS idx_card_transactions_created_at ON card_transactions(created_at);

-- Foreign key constraint (optional, for referential integrity)
-- Note: Using VARCHAR for IDs, so we can't use traditional foreign keys
-- But we'll maintain referential integrity in application code

-- Trigger function to keep updated_at fresh for onramp_credits
CREATE OR REPLACE FUNCTION update_onramp_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to onramp_credits table
DROP TRIGGER IF EXISTS update_onramp_credits_updated_at ON onramp_credits;
CREATE TRIGGER update_onramp_credits_updated_at
BEFORE UPDATE ON onramp_credits
FOR EACH ROW
EXECUTE FUNCTION update_onramp_credits_updated_at();

