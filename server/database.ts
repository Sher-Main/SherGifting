import { Pool, QueryResultRow } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('⚠️ Warning: DATABASE_URL not set. Database features will be disabled.');
}

// Create a connection pool
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('vercel') 
        ? { rejectUnauthorized: false } 
        : false,
    })
  : null;

// Test connection
if (pool) {
  pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client:', err);
  });

  // Initialize database schema
  (async () => {
    try {
      await initializeSchema();
      console.log('✅ Database schema initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing database schema:', error);
    }
  })();
}

async function initializeSchema() {
  if (!pool) return;

  // Create users table if it does not exist yet
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      privy_did VARCHAR(255) UNIQUE NOT NULL,
      wallet_address VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(30) UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT username_format CHECK (
        username IS NULL OR username ~ '^@[a-zA-Z0-9_]{3,29}$'
      )
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_username
    ON users(username)
    WHERE username IS NOT NULL
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Create gifts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gifts (
      id VARCHAR(255) PRIMARY KEY,
      sender_did VARCHAR(255) NOT NULL,
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      token_mint VARCHAR(255) NOT NULL,
      token_symbol VARCHAR(50) NOT NULL,
      token_decimals INTEGER NOT NULL,
      amount DECIMAL(20, 9) NOT NULL,
      usd_value DECIMAL(20, 3),
      message TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'SENT',
      tiplink_url TEXT NOT NULL,
      tiplink_public_key VARCHAR(255) NOT NULL,
      transaction_signature VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMP,
      claimed_by VARCHAR(255),
      claim_signature VARCHAR(255)
    )
  `);
  
  // Add usd_value column if it doesn't exist (for existing databases)
  await pool.query(`
    ALTER TABLE gifts 
    ADD COLUMN IF NOT EXISTS usd_value DECIMAL(20, 3)
  `).catch(() => {
    // Column might already exist, ignore error
  });

  // Add security columns for email verification
  await pool.query(`
    ALTER TABLE gifts 
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS tiplink_url_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS claim_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_claim_attempt TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP
  `).catch(() => {
    // Columns might already exist, ignore error
  });

  // Add refund tracking columns
  await pool.query(`
    ALTER TABLE gifts 
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS refund_transaction_signature VARCHAR(255),
    ADD COLUMN IF NOT EXISTS auto_refund_attempted BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auto_refund_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_refund_attempt TIMESTAMP
  `).catch(() => {
    // Columns might already exist, ignore error
  });

  // Add greeting card columns
  await pool.query(`
    ALTER TABLE gifts 
    ADD COLUMN IF NOT EXISTS has_greeting_card BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS card_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS card_cloudinary_url TEXT,
    ADD COLUMN IF NOT EXISTS card_recipient_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS card_price_usd DECIMAL(10,2) DEFAULT 0.50
  `).catch(() => {
    // Columns might already exist, ignore error
  });

  // Create indexes for card fields
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_has_card ON gifts(has_greeting_card)
  `).catch(() => {
    // Index might already exist, ignore error
  });

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_card_type ON gifts(card_type)
  `).catch(() => {
    // Index might already exist, ignore error
  });

  // Create index on claim_token for fast lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_claim_token ON gifts(claim_token)
  `).catch(() => {
    // Index might already exist, ignore error
  });

  // Create index on sender_did for faster history queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_sender_did ON gifts(sender_did)
  `);

  // Create index on recipient_email for faster lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_recipient_email ON gifts(recipient_email)
  `);

  // Create index on status for filtering
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status)
  `);

  // Create indexes for refund system
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_expiry_check 
    ON gifts(expires_at, status) 
    WHERE status = 'SENT'
  `).catch(() => {
    // Index might already exist, ignore error
  });

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gifts_refunded 
    ON gifts(refunded_at) 
    WHERE status = 'REFUNDED'
  `).catch(() => {
    // Index might already exist, ignore error
  });

  // Create withdrawals table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id VARCHAR(255) PRIMARY KEY,
      sender_did VARCHAR(255) NOT NULL,
      token_mint VARCHAR(255) NOT NULL,
      token_symbol VARCHAR(50),
      token_decimals INTEGER,
      amount DECIMAL(20, 9) NOT NULL,
      fee DECIMAL(20, 9) NOT NULL,
      recipient_address VARCHAR(255) NOT NULL,
      transaction_signature VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_did) REFERENCES users(privy_did)
    )
  `).catch(() => {
    // Table might already exist, ignore error
  });

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_withdrawals_sender ON withdrawals(sender_did)
  `).catch(() => {
    // Index might already exist, ignore error
  });

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at)
  `).catch(() => {
    // Index might already exist, ignore error
  });

  // ========================================
  // ONRAMP SYSTEM TABLES
  // ========================================

  // Create onramp_transactions table
  await pool.query(`
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
    )
  `).catch(() => {
    // Table might already exist, ignore error
  });

  // Create indexes for onramp_transactions
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_transactions_user_id ON onramp_transactions(user_id)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_transactions_moonpay_id ON onramp_transactions(moonpay_id)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_transactions_wallet_address ON onramp_transactions(wallet_address)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_transactions_created_at ON onramp_transactions(created_at)
  `).catch(() => {});

  // Create onramp_credits table
  await pool.query(`
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
    )
  `).catch(() => {
    // Table might already exist, ignore error
  });

  // Create indexes for onramp_credits
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_credits_user_id ON onramp_credits(user_id)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_credits_expires_at ON onramp_credits(expires_at)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_onramp_credits_is_active ON onramp_credits(is_active)
  `).catch(() => {});

  // Create card_transactions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_transactions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      card_address_added VARCHAR(255),
      amount_charged DECIMAL(10, 2) DEFAULT 1.0,
      is_free BOOLEAN DEFAULT FALSE,
      onramp_credit_id VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => {
    // Table might already exist, ignore error
  });

  // Create indexes for card_transactions
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_card_transactions_user_id ON card_transactions(user_id)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_card_transactions_onramp_credit_id ON card_transactions(onramp_credit_id)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_card_transactions_is_free ON card_transactions(is_free)
  `).catch(() => {});
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_card_transactions_created_at ON card_transactions(created_at)
  `).catch(() => {});

  // Create trigger function for onramp_credits updated_at
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_onramp_credits_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `).catch(() => {});

  // Attach trigger to onramp_credits table
  await pool.query(`
    DROP TRIGGER IF EXISTS update_onramp_credits_updated_at ON onramp_credits
  `).catch(() => {});
  await pool.query(`
    CREATE TRIGGER update_onramp_credits_updated_at
    BEFORE UPDATE ON onramp_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_onramp_credits_updated_at()
  `).catch(() => {});
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  if (!pool) {
    throw new Error('Database not configured. Please set DATABASE_URL in your .env file.');
  }

  try {
    const result = await pool.query<T>(text, params);
    return result.rows;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
}

export interface DbUser extends QueryResultRow {
  id: number;
  privy_did: string;
  wallet_address: string;
  email: string;
  username: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export async function upsertUser(user: {
  privy_did: string;
  wallet_address: string;
  email: string;
}): Promise<DbUser> {
  const [result] = await query<DbUser>(
    `
    INSERT INTO users (privy_did, wallet_address, email)
    VALUES ($1, $2, $3)
    ON CONFLICT (privy_did)
    DO UPDATE SET
      wallet_address = EXCLUDED.wallet_address,
      email = EXCLUDED.email,
      updated_at = NOW()
    RETURNING *
    `,
    [user.privy_did, user.wallet_address, user.email]
  );

  return result;
}

export async function getUserByPrivyDid(privy_did: string): Promise<DbUser | null> {
  const results = await query<DbUser>(
    `SELECT * FROM users WHERE privy_did = $1`,
    [privy_did]
  );
  return results[0] || null;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const results = await query<DbUser>(
    `SELECT * FROM users WHERE email = $1`,
    [normalizedEmail]
  );
  return results[0] || null;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const results = await query<DbUser>(
    `SELECT * FROM users WHERE username = $1`,
    [username]
  );
  return results[0] || null;
}

export async function setUsernameForUser(privy_did: string, username: string): Promise<DbUser | null> {
  const results = await query<DbUser>(
    `
    UPDATE users
    SET username = $1,
        updated_at = NOW()
    WHERE privy_did = $2
      AND (username IS NULL OR username = $1)
    RETURNING *
    `,
    [username, privy_did]
  );
  return results[0] || null;
}

export async function insertGift(gift: {
  id: string;
  sender_did: string;
  sender_email: string;
  recipient_email: string;
  token_mint: string;
  token_symbol: string;
  token_decimals: number;
  amount: number;
  usd_value?: number | null;
  message: string;
  status: string;
  tiplink_url: string;
  tiplink_public_key: string;
  transaction_signature: string;
  created_at: string;
  claim_token?: string | null;
  tiplink_url_encrypted?: string | null;
  expires_at?: string;  // 24 hours from creation
  has_greeting_card?: boolean;
  card_type?: string | null;
  card_cloudinary_url?: string | null;
  card_recipient_name?: string | null;
  card_price_usd?: number;
}): Promise<void> {
  await query(
    `INSERT INTO gifts (
      id, sender_did, sender_email, recipient_email, token_mint, token_symbol, 
      token_decimals, amount, usd_value, message, status, tiplink_url, tiplink_public_key, 
      transaction_signature, created_at, claim_token, tiplink_url_encrypted, expires_at,
      has_greeting_card, card_type, card_cloudinary_url, card_recipient_name, card_price_usd
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
    [
      gift.id,
      gift.sender_did,
      gift.sender_email,
      gift.recipient_email,
      gift.token_mint,
      gift.token_symbol,
      gift.token_decimals,
      gift.amount,
      gift.usd_value ?? null,
      gift.message || null,
      gift.status,
      gift.tiplink_url, // Keep for backward compatibility
      gift.tiplink_public_key,
      gift.transaction_signature,
      gift.created_at,
      gift.claim_token ?? null,
      gift.tiplink_url_encrypted ?? null,
      gift.expires_at ?? null,
      gift.has_greeting_card ?? false,
      gift.card_type ?? null,
      gift.card_cloudinary_url ?? null,
      gift.card_recipient_name ?? null,
      gift.card_price_usd ?? null,
    ]
  );
}

export async function getGiftsBySender(sender_did: string): Promise<any[]> {
  return await query(
    `SELECT 
      id, sender_did, sender_email, recipient_email, token_mint, token_symbol, 
      token_decimals, amount, usd_value, message, status, tiplink_url, 
      tiplink_public_key, transaction_signature, created_at, claimed_at, 
      claimed_by, claim_signature, expires_at, refunded_at, refund_transaction_signature,
      has_greeting_card, card_type, card_cloudinary_url, card_recipient_name, card_price_usd
     FROM gifts 
     WHERE sender_did = $1 
     ORDER BY created_at DESC`,
    [sender_did]
  );
}

export async function getGiftById(giftId: string): Promise<any | null> {
  const results = await query(
    `SELECT * FROM gifts WHERE id = $1`,
    [giftId]
  );
  return results.length > 0 ? results[0] : null;
}

export async function updateGiftClaim(
  giftId: string,
  claimed_by: string,
  claim_signature: string
): Promise<void> {
  await query(
    `UPDATE gifts 
     SET status = 'CLAIMED', claimed_at = NOW(), claimed_by = $1, claim_signature = $2 
     WHERE id = $3`,
    [claimed_by, claim_signature, giftId]
  );
}

// ========================================
// ONRAMP SYSTEM DATABASE FUNCTIONS
// ========================================

export interface OnrampTransaction extends QueryResultRow {
  id: string;
  user_id: string;
  wallet_address: string;
  moonpay_id: string | null;
  moonpay_status: string;
  moonpay_fee_charged: number;
  amount_fiat: number;
  amount_crypto: number | null;
  currency: string;
  crypto_asset: string;
  credit_issued: boolean;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
}

export interface OnrampCredit extends QueryResultRow {
  id: string;
  user_id: string;
  total_credits_issued: number;
  credits_remaining: number;
  card_adds_free_used: number;
  card_adds_allowed: number;
  issued_at: Date;
  expires_at: Date;
  is_active: boolean;
  onramp_transaction_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CardTransaction extends QueryResultRow {
  id: string;
  user_id: string;
  card_address_added: string | null;
  amount_charged: number;
  is_free: boolean;
  onramp_credit_id: string | null;
  created_at: Date;
}

export async function upsertOnrampTransaction(data: {
  id: string;
  user_id: string;
  wallet_address: string;
  moonpay_id?: string | null;
  moonpay_status?: string;
  moonpay_fee_charged?: number;
  amount_fiat: number;
  amount_crypto?: number | null;
  currency?: string;
  crypto_asset?: string;
  credit_issued?: boolean;
  completed_at?: Date | null;
  expires_at?: Date | null;
}): Promise<OnrampTransaction> {
  const [result] = await query<OnrampTransaction>(
    `
    INSERT INTO onramp_transactions (
      id, user_id, wallet_address, moonpay_id, moonpay_status, moonpay_fee_charged,
      amount_fiat, amount_crypto, currency, crypto_asset, credit_issued,
      completed_at, expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id)
    DO UPDATE SET
      moonpay_status = EXCLUDED.moonpay_status,
      completed_at = EXCLUDED.completed_at,
      credit_issued = EXCLUDED.credit_issued
    RETURNING *
    `,
    [
      data.id,
      data.user_id,
      data.wallet_address,
      data.moonpay_id || null,
      data.moonpay_status || 'pending',
      data.moonpay_fee_charged || 5.0,
      data.amount_fiat,
      data.amount_crypto || null,
      data.currency || 'USD',
      data.crypto_asset || 'SOL',
      data.credit_issued || false,
      data.completed_at || null,
      data.expires_at || null,
    ]
  );
  return result;
}

export async function getOnrampCreditByUserId(userId: string): Promise<OnrampCredit | null> {
  const results = await query<OnrampCredit>(
    `
    SELECT * FROM onramp_credits
    WHERE user_id = $1
      AND is_active = TRUE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return results[0] || null;
}

export async function createOnrampCredit(data: {
  id: string;
  user_id: string;
  total_credits_issued?: number;
  credits_remaining?: number;
  card_adds_free_used?: number;
  card_adds_allowed?: number;
  expires_at: Date;
  onramp_transaction_id?: string | null;
}): Promise<OnrampCredit> {
  const [result] = await query<OnrampCredit>(
    `
    INSERT INTO onramp_credits (
      id, user_id, total_credits_issued, credits_remaining,
      card_adds_free_used, card_adds_allowed, expires_at, onramp_transaction_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_active = TRUE,
      credits_remaining = EXCLUDED.credits_remaining,
      card_adds_free_used = EXCLUDED.card_adds_free_used,
      expires_at = EXCLUDED.expires_at,
      onramp_transaction_id = EXCLUDED.onramp_transaction_id,
      updated_at = NOW()
    RETURNING *
    `,
    [
      data.id,
      data.user_id,
      data.total_credits_issued || 5.0,
      data.credits_remaining || 5.0,
      data.card_adds_free_used || 0,
      data.card_adds_allowed || 5,
      data.expires_at,
      data.onramp_transaction_id || null,
    ]
  );
  return result;
}

export async function updateOnrampCredit(
  creditId: string,
  updates: {
    credits_remaining?: number;
    card_adds_free_used?: number;
    is_active?: boolean;
  }
): Promise<OnrampCredit | null> {
  const updateFields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.credits_remaining !== undefined) {
    updateFields.push(`credits_remaining = $${paramIndex++}`);
    values.push(updates.credits_remaining);
  }
  if (updates.card_adds_free_used !== undefined) {
    updateFields.push(`card_adds_free_used = $${paramIndex++}`);
    values.push(updates.card_adds_free_used);
  }
  if (updates.is_active !== undefined) {
    updateFields.push(`is_active = $${paramIndex++}`);
    values.push(updates.is_active);
  }

  if (updateFields.length === 0) {
    // No updates, just return the current record
    const results = await query<OnrampCredit>(
      `SELECT * FROM onramp_credits WHERE id = $1`,
      [creditId]
    );
    return results[0] || null;
  }

  values.push(creditId);
  const results = await query<OnrampCredit>(
    `
    UPDATE onramp_credits
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex}
    RETURNING *
    `,
    values
  );
  return results[0] || null;
}

export async function createCardTransaction(data: {
  id: string;
  user_id: string;
  card_address_added?: string | null;
  amount_charged: number;
  is_free: boolean;
  onramp_credit_id?: string | null;
}): Promise<CardTransaction> {
  const [result] = await query<CardTransaction>(
    `
    INSERT INTO card_transactions (
      id, user_id, card_address_added, amount_charged, is_free, onramp_credit_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      data.id,
      data.user_id,
      data.card_address_added || null,
      data.amount_charged,
      data.is_free,
      data.onramp_credit_id || null,
    ]
  );
  return result;
}

export async function getCardTransactionsByUserId(userId: string): Promise<CardTransaction[]> {
  return await query<CardTransaction>(
    `
    SELECT * FROM card_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
}

export async function getOnrampTransactionsByUserId(userId: string): Promise<OnrampTransaction[]> {
  return await query<OnrampTransaction>(
    `
    SELECT * FROM onramp_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
}

export { pool };



