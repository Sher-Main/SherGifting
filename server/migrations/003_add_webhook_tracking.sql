-- Migration: Add webhook tracking for Privy onramp detection
-- This allows distinguishing onramp transactions from regular transfers

-- Add idempotency_key to onramp_transactions (prevents duplicate webhook processing)
ALTER TABLE onramp_transactions 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Add transaction_hash for on-chain reference
ALTER TABLE onramp_transactions 
ADD COLUMN IF NOT EXISTS transaction_hash VARCHAR(255);

-- Add unique constraint on idempotency_key (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_onramp_transactions_idempotency_key 
ON onramp_transactions(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Add index for transaction_hash
CREATE INDEX IF NOT EXISTS idx_onramp_transactions_transaction_hash 
ON onramp_transactions(transaction_hash);

-- Create table to track pending onramps (when user opens funding modal)
CREATE TABLE IF NOT EXISTS pending_onramps (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for pending_onramps
CREATE INDEX IF NOT EXISTS idx_pending_onramps_user_id ON pending_onramps(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_onramps_wallet_address ON pending_onramps(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pending_onramps_expires_at ON pending_onramps(expires_at);

-- Cleanup old pending onramps (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_expired_pending_onramps()
RETURNS void AS $$
BEGIN
  DELETE FROM pending_onramps WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

