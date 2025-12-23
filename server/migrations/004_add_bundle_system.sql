-- Migration: Add Bundle Gifting System
-- Creates tables for preset gift bundles and links them to gifts

-- Create gift_bundles table
CREATE TABLE IF NOT EXISTS gift_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  total_usd_value NUMERIC(10, 2) NOT NULL,
  badge_text VARCHAR(50),
  badge_color VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_bundles_active ON gift_bundles(is_active);
CREATE INDEX IF NOT EXISTS idx_gift_bundles_display_order ON gift_bundles(display_order);

-- Create bundle_tokens table
CREATE TABLE IF NOT EXISTS bundle_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES gift_bundles(id) ON DELETE CASCADE,
  token_mint VARCHAR(44) NOT NULL,
  token_symbol VARCHAR(20) NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundle_tokens_bundle ON bundle_tokens(bundle_id);

-- Add bundle_id column to gifts table
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS bundle_id UUID NULL REFERENCES gift_bundles(id);

CREATE INDEX IF NOT EXISTS idx_gifts_bundle_id ON gifts(bundle_id);

-- Create gift_bundle_links table
CREATE TABLE IF NOT EXISTS gift_bundle_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id VARCHAR(255) NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES gift_bundles(id),
  tiplink_url TEXT NOT NULL,
  tiplink_keypair_encrypted TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_bundle_links_gift ON gift_bundle_links(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_bundle_links_bundle ON gift_bundle_links(bundle_id);

-- Seed initial bundles
-- Starter Pack: $20 SOL
INSERT INTO gift_bundles (name, description, total_usd_value, display_order, badge_text, badge_color)
VALUES (
  'Starter Pack',
  'Perfect for first-time crypto recipients',
  20.00,
  1,
  'POPULAR',
  '#F59E0B'
)
ON CONFLICT DO NOTHING;

INSERT INTO bundle_tokens (bundle_id, token_mint, token_symbol, percentage, display_order)
SELECT id, 'So11111111111111111111111111111111111111112', 'SOL', 100.00, 1
FROM gift_bundles WHERE name = 'Starter Pack'
ON CONFLICT DO NOTHING;

-- Value Pack: $50 (50% SOL / 50% wBTC)
INSERT INTO gift_bundles (name, description, total_usd_value, display_order, badge_text, badge_color)
VALUES (
  'Value Pack',
  'Experience the two giants of crypto',
  50.00,
  2,
  'BEST VALUE',
  '#3B82F6'
)
ON CONFLICT DO NOTHING;

INSERT INTO bundle_tokens (bundle_id, token_mint, token_symbol, percentage, display_order)
SELECT id, 'So11111111111111111111111111111111111111112', 'SOL', 50.00, 1
FROM gift_bundles WHERE name = 'Value Pack'
UNION ALL
SELECT id, '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 'wBTC', 50.00, 2
FROM gift_bundles WHERE name = 'Value Pack'
ON CONFLICT DO NOTHING;

-- Whale Pack: $100 (25% SOL / 25% wBTC / 25% wETH / 25% USDC)
INSERT INTO gift_bundles (name, description, total_usd_value, display_order, badge_text, badge_color)
VALUES (
  'Whale Pack',
  'Maximum diversification for serious gifting',
  100.00,
  3,
  'PREMIUM',
  '#8B5CF6'
)
ON CONFLICT DO NOTHING;

INSERT INTO bundle_tokens (bundle_id, token_mint, token_symbol, percentage, display_order)
SELECT id, 'So11111111111111111111111111111111111111112', 'SOL', 25.00, 1
FROM gift_bundles WHERE name = 'Whale Pack'
UNION ALL
SELECT id, '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 'wBTC', 25.00, 2
FROM gift_bundles WHERE name = 'Whale Pack'
UNION ALL
SELECT id, '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 'wETH', 25.00, 3
FROM gift_bundles WHERE name = 'Whale Pack'
UNION ALL
SELECT id, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 25.00, 4
FROM gift_bundles WHERE name = 'Whale Pack'
ON CONFLICT DO NOTHING;

-- Cleanup: Remove Builder Pack if it exists (migration to 3 bundles)
DELETE FROM bundle_tokens WHERE bundle_id IN (SELECT id FROM gift_bundles WHERE name = 'Builder Pack');
DELETE FROM gift_bundles WHERE name = 'Builder Pack';

-- Update Whale Pack display_order to 3 if it was previously 4
UPDATE gift_bundles SET display_order = 3 WHERE name = 'Whale Pack' AND display_order = 4;

-- Update Curiosity Pack to Value Pack
UPDATE gift_bundles SET name = 'Value Pack' WHERE name = 'Curiosity Pack';

-- Update bundle prices
UPDATE gift_bundles SET total_usd_value = 20.00, updated_at = NOW() WHERE name = 'Starter Pack';
UPDATE gift_bundles SET total_usd_value = 50.00, updated_at = NOW() WHERE name = 'Value Pack';
-- Whale Pack stays at $100.00

