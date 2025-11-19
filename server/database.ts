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
}): Promise<void> {
  await query(
    `INSERT INTO gifts (
      id, sender_did, sender_email, recipient_email, token_mint, token_symbol, 
      token_decimals, amount, usd_value, message, status, tiplink_url, tiplink_public_key, 
      transaction_signature, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
      gift.tiplink_url,
      gift.tiplink_public_key,
      gift.transaction_signature,
      gift.created_at,
    ]
  );
}

export async function getGiftsBySender(sender_did: string): Promise<any[]> {
  return await query(
    `SELECT * FROM gifts WHERE sender_did = $1 ORDER BY created_at DESC`,
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

export { pool };



