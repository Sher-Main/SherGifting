-- Migration: Enhanced Bundle Flow with Smart Payment
-- Creates gift_tiplinks table for multi-token TipLink storage
-- Adds payment_method and fee_breakdown columns to gifts table

-- Create gift_tiplinks table (one TipLink per token in bundle)
CREATE TABLE IF NOT EXISTS gift_tiplinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id VARCHAR(255) REFERENCES gifts(id) ON DELETE CASCADE,
  token_mint VARCHAR(44) NOT NULL,
  token_symbol VARCHAR(10) NOT NULL,
  tiplink_url TEXT NOT NULL,
  tiplink_keypair_encrypted TEXT NOT NULL,
  token_amount NUMERIC(20, 9) NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at TIMESTAMP,
  claimed_by VARCHAR(44),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_tiplinks_gift ON gift_tiplinks(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_tiplinks_claimed ON gift_tiplinks(claimed);
CREATE INDEX IF NOT EXISTS idx_gift_tiplinks_token ON gift_tiplinks(token_mint);

-- Add payment_method column to gifts table
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'moonpay';

-- Add fee_breakdown column to gifts table (stores JSON breakdown)
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS fee_breakdown JSONB;

CREATE INDEX IF NOT EXISTS idx_gifts_payment_method ON gifts(payment_method);

