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

export async function insertGift(gift: {
  id: string;
  sender_did: string;
  sender_email: string;
  recipient_email: string;
  token_mint: string;
  token_symbol: string;
  token_decimals: number;
  amount: number;
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
      token_decimals, amount, message, status, tiplink_url, tiplink_public_key, 
      transaction_signature, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      gift.id,
      gift.sender_did,
      gift.sender_email,
      gift.recipient_email,
      gift.token_mint,
      gift.token_symbol,
      gift.token_decimals,
      gift.amount,
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


